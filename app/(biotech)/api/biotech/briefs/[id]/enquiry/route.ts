// /api/biotech/briefs/[id]/enquiry
//
// GET  — returns all saved enquiry drafts for this brief (keyed by cro_email).
//        Used on page load to restore drafts without calling Claude.
//
// POST — generates a draft with Claude, saves/overwrites to DB, returns
//        { subject, body, engagement_id, message_id }.
//        Always saves — so "Re-draft" just calls POST again (overwrites).
//
// CRITICAL IP: compound_description and study_objective never passed to Claude.

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { biotechClaude } from '@biotech/lib/claude';
import { buildEnquiryPrompt, type SafeFields } from '@biotech/prompts/enquiry';
import type { ExtractedData } from '@biotech/prompts/extract-brief';

function hashExtractedData(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// ── GET — load saved drafts ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const briefId = params.id;

  // Fetch saved enquiry template from the brief (for reuse without re-calling Claude)
  const { data: briefData } = await supabase
    .from('rfp_internal_briefs')
    .select('enquiry_template, extracted_data')
    .eq('id', briefId)
    .eq('user_id', user.id)
    .single();

  // Fetch all enquiry_draft engagements for this brief + their latest draft message
  const { data: engagements } = await supabase
    .from('cro_engagements')
    .select(`
      id,
      cro_id,
      cro_name,
      cro_email,
      stage,
      engagement_messages (
        id,
        subject,
        body,
        status,
        message_type,
        direction
      )
    `)
    .eq('brief_id', briefId)
    .eq('user_id', user.id)
    .in('stage', ['enquiry_draft', 'enquiry_sent']);

  if (!engagements) {
    return NextResponse.json({ drafts: [] });
  }

  // Shape into a flat list: one entry per engagement, using the latest draft message
  const drafts = engagements
    .map(eng => {
      const messages = (eng.engagement_messages ?? []) as Array<{
        id: string;
        subject: string | null;
        body: string | null;
        status: string;
        message_type: string;
        direction: string;
      }>;

      // Find the most relevant message: draft enquiry outbound, or sent
      const msg = messages.find(
        m => m.direction === 'outbound' && m.message_type === 'enquiry'
      );
      if (!msg) return null;

      return {
        cro_email:     eng.cro_email,
        cro_name:      eng.cro_name,
        cro_id:        eng.cro_id,
        engagement_id: eng.id,
        stage:         eng.stage,
        message_id:    msg.id,
        subject:       msg.subject ?? '',
        body:          msg.body ?? '',
        status:        msg.status,   // 'draft' | 'sent' | 'failed' etc
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    drafts,
    enquiry_template: briefData?.enquiry_template ?? null,
    extracted_data:   briefData?.extracted_data ?? null,
  });
}

// ── POST — generate with Claude + save/overwrite draft in DB ─────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const briefId = params.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const {
    cro_id,
    cro_name,
    cro_email,
    include_budget   = false,
    deadline_days    = 10,
    sender_company,
    template_only    = false,   // if true: run Claude but DO NOT save to DB — returns {subject, body} only
    override_body,              // if provided: skip Claude, use this body directly
    override_subject,           // if provided alongside override_body: use this subject directly
  } = body as {
    cro_id?:          string | null;
    cro_name?:        string;
    cro_email?:       string;
    include_budget?:  boolean;
    deadline_days?:   number;
    sender_company?:  string | null;
    template_only?:   boolean;
    override_body?:   string;
    override_subject?: string;
  };

  if (!cro_name || !cro_email) {
    return NextResponse.json({ error: 'cro_name and cro_email are required' }, { status: 400 });
  }

  // Load brief — RLS ensures user owns it
  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('extracted_data')
    .eq('id', briefId)
    .eq('user_id', user.id)
    .single();

  if (!brief?.extracted_data) {
    return NextResponse.json({ error: 'Brief not found or not yet extracted' }, { status: 404 });
  }

  const ext = brief.extracted_data as ExtractedData;

  function safeVal(field: { tag: string; value: string | null } | undefined): string | null {
    if (!field || field.tag === 'MISSING') return null;
    return field.value;
  }

  const safeFields: SafeFields = {
    study_type:           safeVal(ext.study_type),
    assay_types:          safeVal(ext.assay_types),
    species_model:        safeVal(ext.species_model),
    group_sizes:          safeVal(ext.group_sizes),
    primary_endpoints:    safeVal(ext.primary_endpoints),
    timeline:             safeVal(ext.timeline),
    glp_requirement:      safeVal(ext.glp_requirement),
    deliverables:         safeVal(ext.deliverables),
    budget_range:         safeVal(ext.budget_range),
    special_requirements: safeVal(ext.special_requirements),
  };

  const prompt = buildEnquiryPrompt({
    safeFields,
    croName:       cro_name,
    includeBudget: Boolean(include_budget),
    deadlineDays:  Number(deadline_days) || 10,
    senderCompany: sender_company ?? null,
  });

  // ── Generate subject + body ───────────────────────────────────────────────

  let subject: string;
  let msgBody: string;

  if (override_body && override_subject) {
    // Caller provided final content — skip Claude entirely
    subject = override_subject;
    msgBody = override_body;
  } else {
    // Call Claude
    try {
      const raw = await biotechClaude({ userPrompt: prompt, maxTokens: 800 });
      const cleaned = raw
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();
      const parsed = JSON.parse(cleaned) as { subject?: string; body?: string };
      if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
        throw new Error('AI response missing subject or body');
      }
      subject = parsed.subject;
      msgBody = parsed.body;
    } catch (err) {
      console.error('[enquiry/generate] Claude error:', err);
      return NextResponse.json({ error: 'Failed to generate draft — please retry' }, { status: 500 });
    }
  }

  // Template-only mode: save template to brief for reuse, then return
  if (template_only) {
    const briefHash = hashExtractedData(ext);
    const enquiryTemplate = {
      subject,
      body:         msgBody,
      generated_at: new Date().toISOString(),
      brief_hash:   briefHash,
    };
    await supabase
      .from('rfp_internal_briefs')
      .update({ enquiry_template: enquiryTemplate })
      .eq('id', briefId)
      .eq('user_id', user.id);

    return NextResponse.json({ subject, body: msgBody, brief_hash: briefHash });
  }

  // ── Upsert engagement: find existing enquiry_draft for this brief+CRO or create ──

  // Use BOTH email + name to distinguish two companies that share the same email address
  const { data: existingEng } = await supabase
    .from('cro_engagements')
    .select('id')
    .eq('brief_id', briefId)
    .eq('user_id', user.id)
    .eq('cro_email', cro_email)
    .eq('cro_name', cro_name)
    .eq('stage', 'enquiry_draft')
    .maybeSingle();

  let engagementId: string;

  if (existingEng) {
    engagementId = existingEng.id;
  } else {
    const { data: newEng, error: engErr } = await supabase
      .from('cro_engagements')
      .insert({
        user_id:  user.id,
        brief_id: briefId,
        cro_id:   cro_id ?? null,
        cro_name,
        cro_email,
        stage:    'enquiry_draft',
      })
      .select('id')
      .single();

    if (engErr || !newEng) {
      console.error('[enquiry] engagement insert failed:', engErr);
      return NextResponse.json({ error: 'Failed to save engagement' }, { status: 500 });
    }
    engagementId = newEng.id;
  }

  // ── Upsert message: find existing draft message or create ─────────────────

  const { data: existingMsg } = await supabase
    .from('engagement_messages')
    .select('id')
    .eq('engagement_id', engagementId)
    .eq('direction', 'outbound')
    .eq('message_type', 'enquiry')
    .eq('status', 'draft')
    .maybeSingle();

  let messageId: string;

  if (existingMsg) {
    // Overwrite the saved draft (user clicked Re-draft)
    await supabase
      .from('engagement_messages')
      .update({ subject, body: msgBody })
      .eq('id', existingMsg.id);
    messageId = existingMsg.id;
  } else {
    const { data: newMsg, error: msgErr } = await supabase
      .from('engagement_messages')
      .insert({
        engagement_id: engagementId,
        direction:     'outbound',
        message_type:  'enquiry',
        subject,
        body:          msgBody,
        status:        'draft',
        ai_generated:  true,
      })
      .select('id')
      .single();

    if (msgErr || !newMsg) {
      console.error('[enquiry] message insert failed:', msgErr);
      return NextResponse.json({ error: 'Failed to save draft message' }, { status: 500 });
    }
    messageId = newMsg.id;
  }

  return NextResponse.json({ subject, body: msgBody, engagement_id: engagementId, message_id: messageId });
}
