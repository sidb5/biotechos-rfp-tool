// POST /api/biotech/engagements/[id]/inbound
// Logs a CRO's inbound reply (manual paste) and triggers AI followup generation.
// Stage → response_received.
// Returns { message_id, followup } where followup is the AI analysis (Task 3.2).

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { biotechClaude } from '@biotech/lib/claude';
import { buildFollowupPrompt, type FollowupOutput } from '@biotech/prompts/followup';
import type { ExtractedData } from '@biotech/prompts/extract-brief';

// Context window: pass up to 8 most recent messages.
// For threads with more than 8 prior messages, older ones are summarised first.
const MAX_CONTEXT_MESSAGES = 8;
const SUMMARISE_THRESHOLD  = 8; // summarise when prior message count exceeds this

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const engagementId = params.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { response_text } = body as { response_text?: string };
  if (!response_text?.trim()) {
    return NextResponse.json({ error: 'response_text is required' }, { status: 400 });
  }

  // Verify engagement belongs to this user
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, brief_id, stage')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
  }

  // Save inbound message
  const { data: inboundMsg, error: msgErr } = await supabase
    .from('engagement_messages')
    .insert({
      engagement_id: engagementId,
      direction:     'inbound',
      message_type:  'response',
      body:          response_text.trim(),
      status:        'delivered',
      ai_generated:  false,
    })
    .select('id')
    .single();

  if (msgErr || !inboundMsg) {
    console.error('[inbound] message insert failed:', msgErr);
    return NextResponse.json({ error: 'Failed to save response' }, { status: 500 });
  }

  // Advance stage to response_received — but only if the engagement is still
  // in an early pre-meeting stage. After meeting_done the stage should not
  // regress — the meeting context must be preserved.
  const PRE_MEETING_STAGES = ['enquiry_sent', 'followup_sent', 'meeting_scheduled'];
  if (PRE_MEETING_STAGES.includes(engagement.stage)) {
    await supabase
      .from('cro_engagements')
      .update({ stage: 'response_received', updated_at: new Date().toISOString() })
      .eq('id', engagementId);
  } else {
    // Just bump updated_at so the engagement appears active in lists
    await supabase
      .from('cro_engagements')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', engagementId);
  }

  // ── Load context for AI followup ────────────────────────────────────────────

  // Load brief safe fields
  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('extracted_data')
    .eq('id', engagement.brief_id)
    .single();

  // Load ALL prior messages (excluding the one just inserted) so we can decide on compression
  const { data: allPriorMessages } = await supabase
    .from('engagement_messages')
    .select('direction, message_type, subject, body, created_at')
    .eq('engagement_id', engagementId)
    .neq('id', inboundMsg.id)
    .order('created_at', { ascending: true }); // oldest first

  const priorMsgs = allPriorMessages ?? [];

  const croName = engagement.cro_name;

  // Format a message for prompt inclusion
  function fmtMsg(m: { direction: string; subject: string | null; body: string | null }): string {
    const who = m.direction === 'outbound' ? 'We sent' : `${croName} replied`;
    const subjectLine = m.subject ? ` (subject: ${m.subject})` : '';
    return `[${who}${subjectLine}]\n${(m.body ?? '').slice(0, 800)}`; // cap per-message length
  }

  let history: string;

  if (priorMsgs.length > SUMMARISE_THRESHOLD) {
    // Split: older portion to summarise + last 5 to pass verbatim
    const older  = priorMsgs.slice(0, -5);
    const recent = priorMsgs.slice(-5);

    // Quick Claude call to summarise older messages
    let olderSummary = `[${older.length} earlier messages in this thread]`;
    try {
      const olderText = older.map(fmtMsg).join('\n\n---\n\n');
      const summaryRaw = await biotechClaude({
        userPrompt: `Summarise these ${older.length} email messages between a biotech company and ${engagement.cro_name} in 3-4 bullet points. Focus on: what was asked, what was confirmed, what remains unresolved. Be specific.\n\n${olderText}`,
        maxTokens:  300,
      });
      olderSummary = `[Summary of earlier ${older.length} messages]\n${summaryRaw.trim()}`;
    } catch { /* fall back to count placeholder */ }

    const recentText = recent.map(fmtMsg).join('\n\n---\n\n');
    history = `${olderSummary}\n\n---\n\n${recentText}`;
  } else {
    // Short thread — pass all verbatim (up to MAX_CONTEXT_MESSAGES)
    history = priorMsgs
      .slice(-MAX_CONTEXT_MESSAGES)
      .map(fmtMsg)
      .join('\n\n---\n\n');
  }

  // Build safe fields (same set as enquiry — no compound/MOA/indication)
  const safeFields: Record<string, string | null> = {};
  if (brief?.extracted_data) {
    const ext = brief.extracted_data as ExtractedData;
    const keys: (keyof ExtractedData)[] = [
      'study_type', 'assay_types', 'species_model', 'group_sizes',
      'primary_endpoints', 'timeline', 'glp_requirement', 'deliverables',
      'budget_range', 'special_requirements',
    ];
    for (const key of keys) {
      const field = ext[key] as { tag: string; value: string | null } | undefined;
      if (field && field.tag !== 'MISSING' && field.value) {
        safeFields[key as string] = field.value;
      }
    }
  }

  // Load user settings for company name
  let senderCompany: string | null = null;
  try {
    const { data: settings } = await supabase
      .from('biotech_user_settings')
      .select('company_name')
      .eq('user_id', user.id)
      .maybeSingle();
    if (settings?.company_name) senderCompany = settings.company_name;
  } catch { /* ignore */ }

  // ── Call Claude ─────────────────────────────────────────────────────────────

  let followup: FollowupOutput;

  try {
    const prompt = buildFollowupPrompt({
      briefSafeFields:  safeFields,
      croName:          engagement.cro_name,
      messageHistory:   history,
      croResponse:      response_text.trim(),
      senderCompany,
    });

    const raw = await biotechClaude({ userPrompt: prompt, maxTokens: 2000 });
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    followup = JSON.parse(cleaned) as FollowupOutput;

    // Validate shape
    if (!followup.gap_analysis || !followup.draft_reply || !Array.isArray(followup.suggested_questions)) {
      throw new Error('Invalid AI response shape');
    }
  } catch (err) {
    console.error('[inbound] AI followup failed:', err);
    // Return success for the inbound save even if AI fails
    return NextResponse.json({
      message_id: inboundMsg.id,
      followup:   null,
      ai_error:   'AI analysis failed — you can generate it again from the thread',
    });
  }

  // Supersede any stale pending drafts for this engagement so Actions Needed
  // doesn't keep showing the engagement based on an old, never-sent draft.
  await supabase
    .from('engagement_messages')
    .update({ status: 'superseded' })
    .eq('engagement_id', engagementId)
    .eq('direction', 'outbound')
    .eq('status', 'draft')
    .eq('ai_generated', true);

  // Save the AI draft reply as a followup_draft message.
  // Also persist the gap analysis in ai_metadata so it can be restored on page reload
  // and so the "resolved" toggle can track which items the user has marked done.
  const { data: draftMsg } = await supabase
    .from('engagement_messages')
    .insert({
      engagement_id: engagementId,
      direction:     'outbound',
      message_type:  'followup',
      subject:       followup.draft_subject,
      body:          followup.draft_reply,
      status:        'draft',
      ai_generated:  true,
      ai_metadata: {
        gap_analysis:    followup.gap_analysis,
        resolved_items:  [] as string[],
        is_bid_document: followup.is_bid_document ?? false,
        bid_extracted:   followup.bid_extracted   ?? null,
      },
    })
    .select('id')
    .single();

  // Insert notification via admin client (RLS requires service role for inserts)
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await adminSupabase.from('notifications').insert({
    user_id:       user.id,
    engagement_id: engagementId,
    draft_id:      draftMsg?.id ?? null,
    type:          followup.is_bid_document ? 'bid_received' : 'ai_draft_ready',
    title:         followup.is_bid_document
      ? `Bid received from ${engagement.cro_name}`
      : `AI draft ready — ${engagement.cro_name}`,
    body_text:     followup.is_bid_document
      ? 'A bid/quote was detected in the CRO reply. Review the analysis and log the quote.'
      : 'A CRO reply was analysed. Review the AI draft and approve to send.',
    read:          false,
  });

  // Only advance to followup_draft if we just moved to response_received.
  // At meeting_done or later, preserve the current stage.
  if (PRE_MEETING_STAGES.includes(engagement.stage) || engagement.stage === 'response_received') {
    await supabase
      .from('cro_engagements')
      .update({ stage: 'followup_draft', updated_at: new Date().toISOString() })
      .eq('id', engagementId);
  }

  return NextResponse.json({
    message_id:      inboundMsg.id,
    draft_message_id: draftMsg?.id ?? null,
    followup,
  });
}
