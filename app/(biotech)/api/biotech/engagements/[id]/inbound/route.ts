// POST /api/biotech/engagements/[id]/inbound
// Logs a CRO's inbound reply (manual paste) and triggers AI followup generation.
// Stage → response_received.
// Returns { message_id, followup } where followup is the AI analysis (Task 3.2).

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { biotechClaude } from '@biotech/lib/claude';
import { buildFollowupPrompt, type FollowupOutput } from '@biotech/prompts/followup';
import type { ExtractedData } from '@biotech/prompts/extract-brief';

// Max messages to pass as context to Claude
const MAX_CONTEXT_MESSAGES = 5;

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

  // Update stage → response_received
  await supabase
    .from('cro_engagements')
    .update({ stage: 'response_received', updated_at: new Date().toISOString() })
    .eq('id', engagementId);

  // ── Load context for AI followup ────────────────────────────────────────────

  // Load brief safe fields
  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('extracted_data')
    .eq('id', engagement.brief_id)
    .single();

  // Load prior messages (up to MAX_CONTEXT_MESSAGES, excluding the one just inserted)
  const { data: priorMessages } = await supabase
    .from('engagement_messages')
    .select('direction, message_type, subject, body, created_at')
    .eq('engagement_id', engagementId)
    .neq('id', inboundMsg.id)
    .order('created_at', { ascending: false })
    .limit(MAX_CONTEXT_MESSAGES);

  // Format message history oldest-first
  const history = (priorMessages ?? [])
    .reverse()
    .map(m => {
      const who = m.direction === 'outbound' ? 'We sent' : `${engagement.cro_name} replied`;
      const subjectLine = m.subject ? ` (subject: ${m.subject})` : '';
      return `[${who}${subjectLine}]\n${m.body ?? ''}`;
    })
    .join('\n\n---\n\n');

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

  // Save the AI draft reply as a followup_draft message
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
    })
    .select('id')
    .single();

  // Update stage → followup_draft
  await supabase
    .from('cro_engagements')
    .update({ stage: 'followup_draft', updated_at: new Date().toISOString() })
    .eq('id', engagementId);

  return NextResponse.json({
    message_id:      inboundMsg.id,
    draft_message_id: draftMsg?.id ?? null,
    followup,
  });
}
