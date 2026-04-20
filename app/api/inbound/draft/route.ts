// POST /api/inbound/draft
// Generates an AI-suggested reply draft when an assisted-mode engagement
// receives an inbound message. Called internally by /api/inbound/resend.
//
// Body: { engagement_id: string, message_id: string }
// Header: x-internal-secret — must match CRON_SECRET
//
// Guards:
//   - Engagement must be assisted mode
//   - Engagement must not be in a terminal stage (awarded | closed)
//   - Message must exist and be inbound
//
// Output: stores a new outbound 'draft' message with ai_generated=true,
// then fires a fire-and-forget to /api/notify/draft-ready so Tasks 11/12
// (in-app + email notifications) are triggered.
//
// Always returns 200 — errors are logged but do not crash the inbound pipeline.

import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@supabase/supabase-js';
import Anthropic                     from '@anthropic-ai/sdk';

// ── System prompts (per initiator role) ──────────────────────────────────────

const BIOTECH_SYSTEM = `You are helping a biotech company communicate with CROs professionally. \
Write concise, clear, scientific emails. \
Never include compound names, mechanisms of action, or disease indications in outreach messages \
unless explicitly told the user has approved sharing this information.`;

const CRO_SYSTEM = `You are an expert preclinical CRO proposal writer with 15 years of experience \
writing winning proposals for biotech and pharma sponsors. \
Your writing is precise, scientific, and persuasive. You never use generic filler text.`;

// ── Terminal stages — no drafts generated ────────────────────────────────────

const TERMINAL_STAGES = new Set(['awarded', 'closed']);

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  console.log('[draft] POST received');
  // Verify internal caller
  const secret = req.headers.get('x-internal-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    console.warn('[draft] Unauthorized — secret present?', !!secret, 'cron_secret set?', !!process.env.CRON_SECRET);
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }
  console.log('[draft] Authorized');

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let body: { engagement_id?: string; message_id?: string };
  try { body = await req.json(); }
  catch {
    console.error('[draft] Invalid JSON body');
    return NextResponse.json({ ok: false, reason: 'invalid_json' });
  }

  const { engagement_id, message_id } = body;
  if (!engagement_id || !message_id) {
    console.error('[draft] Missing engagement_id or message_id');
    return NextResponse.json({ ok: false, reason: 'missing_params' });
  }

  // ── Fetch engagement ────────────────────────────────────────────────────────

  const { data: engagement } = await adminSupabase
    .from('cro_engagements')
    .select('id, user_id, cro_name, cro_email, stage, brief_id')
    .eq('id', engagement_id)
    .maybeSingle();

  if (!engagement) {
    console.warn('[draft] Engagement not found', engagement_id);
    return NextResponse.json({ ok: false, reason: 'engagement_not_found' });
  }

  if (TERMINAL_STAGES.has(engagement.stage)) {
    console.log('[draft] Skipping — terminal stage', engagement.stage, engagement_id);
    return NextResponse.json({ ok: true, reason: 'terminal_stage_skipped' });
  }

  // initiator: biotech if brief_id is set (biotech created this engagement), else cro
  const initiator = engagement.brief_id ? 'biotech' : 'cro';

  // capture_mode lives in per-user settings tables, not on the engagement row
  const settingsTable = initiator === 'biotech' ? 'biotech_user_settings' : 'cro_user_settings';
  const { data: userSettings } = await adminSupabase
    .from(settingsTable)
    .select('capture_mode')
    .eq('user_id', engagement.user_id)
    .maybeSingle();

  const captureMode = (userSettings as { capture_mode?: string } | null)?.capture_mode ?? 'assisted';
  console.log('[draft] initiator:', initiator, 'captureMode:', captureMode, 'engagement:', engagement_id);
  if (captureMode !== 'assisted') {
    console.log('[draft] Skipping — native mode', engagement_id);
    return NextResponse.json({ ok: true, reason: 'native_mode_skipped' });
  }

  // ── Fetch the triggering inbound message ────────────────────────────────────

  const { data: triggerMsg } = await adminSupabase
    .from('engagement_messages')
    .select('id, direction, subject, body, created_at')
    .eq('id', message_id)
    .maybeSingle();

  if (!triggerMsg || triggerMsg.direction !== 'inbound') {
    console.warn('[draft] Trigger message not found or not inbound', message_id);
    return NextResponse.json({ ok: false, reason: 'trigger_message_invalid' });
  }

  // ── Fetch conversation history for context ──────────────────────────────────

  const { data: history } = await adminSupabase
    .from('engagement_messages')
    .select('direction, message_type, subject, body, created_at, ai_generated')
    .eq('engagement_id', engagement_id)
    .neq('id', message_id)           // exclude the triggering message (appended separately)
    .order('created_at', { ascending: true })
    .limit(20);

  // ── Fetch user/company context ──────────────────────────────────────────────

  let senderName: string    = '';
  let senderCompany: string = '';

  if (initiator === 'cro') {
    // CRO-initiated: pull CRO profile for context
    const { data: profile } = await adminSupabase
      .from('cro_profiles')
      .select('company_name, sender_display_name, therapeutic_areas, assay_types')
      .eq('user_id', engagement.user_id)
      .maybeSingle();
    senderName    = profile?.sender_display_name ?? '';
    senderCompany = profile?.company_name ?? '';
  } else {
    // Biotech-initiated: pull biotech user settings
    const { data: settings } = await adminSupabase
      .from('biotech_user_settings')
      .select('sender_display_name, company_name')
      .eq('user_id', engagement.user_id)
      .maybeSingle();
    senderName    = settings?.sender_display_name ?? '';
    senderCompany = settings?.company_name ?? '';
  }

  // ── Build prompt ────────────────────────────────────────────────────────────

  const isCro        = initiator === 'cro';
  const systemPrompt = isCro ? CRO_SYSTEM : BIOTECH_SYSTEM;

  const historyText = (history ?? [])
    .map(m => {
      const dir   = m.direction === 'outbound' ? 'US' : `THEM (${engagement.cro_name ?? engagement.cro_email})`;
      const label = m.ai_generated ? '[AI draft]' : '';
      return `[${dir}] ${label}\nSubject: ${m.subject ?? '(no subject)'}\n${m.body ?? '(empty)'}`;
    })
    .join('\n\n---\n\n');

  const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const userPrompt = [
    isCro
      ? `You are drafting a reply on behalf of a CRO (Contract Research Organization) responding to a biotech client.`
      : `You are drafting a reply on behalf of a biotech company responding to a CRO (Contract Research Organization).`,
    ``,
    `TODAY'S DATE: ${todayIso}`,
    ``,
    senderName    ? `Our name:    ${senderName}`    : '',
    senderCompany ? `Our company: ${senderCompany}` : '',
    `Counterparty: ${engagement.cro_name ?? engagement.cro_email} <${engagement.cro_email}>`,
    ``,
    `== CONVERSATION HISTORY (oldest first) ==`,
    historyText || '(no prior messages)',
    ``,
    `== NEW INBOUND MESSAGE (reply to this) ==`,
    `Subject: ${triggerMsg.subject ?? '(no subject)'}`,
    triggerMsg.body ?? '(no body)',
    ``,
    `== INSTRUCTIONS ==`,
    `Today's date is ${todayIso}. Use this as the authoritative current date when reasoning about timelines, deadlines, or urgency.`,
    `Write a professional, concise reply to the message above.`,
    `- Use plain text only (no HTML, no markdown).`,
    `- Do not start with "Dear" or generic pleasantries — get to the point.`,
    `- Do not sign off with a full signature block — end after your closing line.`,
    `- Match the scientific precision expected in pharma/biotech communication.`,
    isCro
      ? `- Reply from the CRO's perspective: acknowledge the client's request, restate key details, and commit to next steps.`
      : `- Reply from the biotech's perspective: acknowledge the CRO's response and outline next steps for the study.`,
    `- Keep it under 200 words unless the message requires more detail.`,
    ``,
    `Output ONLY the email body text. No subject line, no preamble, no commentary.`,
  ].filter(Boolean).join('\n');

  // ── Call Claude API ─────────────────────────────────────────────────────────

  let draftBody: string;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2000,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    });
    const block = msg.content[0];
    if (block.type !== 'text') throw new Error('Unexpected Claude response type');
    draftBody = block.text.trim();
  } catch (err) {
    console.error('[draft] Claude API failed', err);
    return NextResponse.json({ ok: false, reason: 'ai_generation_failed' });
  }

  // ── Store the draft ─────────────────────────────────────────────────────────

  const now = new Date().toISOString();
  const subject = triggerMsg.subject
    ? (triggerMsg.subject.startsWith('Re:') ? triggerMsg.subject : `Re: ${triggerMsg.subject}`)
    : 'Re: (your message)';

  const { data: draftMsg, error: insertErr } = await adminSupabase
    .from('engagement_messages')
    .insert({
      engagement_id: engagement_id,
      direction:     'outbound',
      message_type:  'response',
      subject:       subject,
      body:          draftBody,
      status:        'draft',
      ai_generated:  true,
      created_at:    now,
    })
    .select('id')
    .single();

  if (insertErr || !draftMsg) {
    console.error('[draft] Failed to store draft', insertErr);
    return NextResponse.json({ ok: false, reason: 'store_failed' });
  }

  console.log('[draft] AI draft stored', draftMsg.id, 'for engagement', engagement_id);

  // ── Trigger notifications (Tasks 11 + 12) — fire and forget ─────────────────

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  void fetch(`${appUrl}/api/notify/draft-ready`, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'x-internal-secret': process.env.CRON_SECRET ?? '',
    },
    body: JSON.stringify({
      engagement_id,
      draft_id:  draftMsg.id,
      user_id:   engagement.user_id,
      initiator,
      cro_name:  engagement.cro_name,
      cro_email: engagement.cro_email,
    }),
  }).catch(err => console.error('[draft] Notification trigger failed', err));

  return NextResponse.json({ ok: true, draft_id: draftMsg.id });
}
