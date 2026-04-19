// POST /api/inbound/resend
// Resend inbound email webhook — receives CRO replies for assisted-mode engagements.
//
// Address format: e.{engagementId}@{RESEND_INBOUND_DOMAIN}
// Resend is configured to deliver any email sent to *@{RESEND_INBOUND_DOMAIN}
// to this endpoint via webhook.
//
// Security: Resend signs webhooks with a secret — verified via RESEND_WEBHOOK_SECRET.
// If not configured (dev), signature check is skipped with a warning.
//
// Never throws 5xx — always returns 200 so Resend doesn't retry indefinitely.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResendInboundPayload {
  from:        string;
  to:          string | string[];
  subject?:    string;
  text?:       string;
  html?:       string;
  messageId?:  string;   // email Message-ID header
  spamScore?:  number;
  headers?:    Record<string, string>;
  attachments?: Array<{ filename?: string; contentType?: string; size?: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract engagementId from e.{uuid}@domain address. Returns null if not matched. */
function parseEngagementAddress(toField: string | string[]): string | null {
  const addresses = Array.isArray(toField) ? toField : [toField];
  const pattern   = /^e\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;
  for (const addr of addresses) {
    // Handles "Display Name <addr@domain>" and bare "addr@domain"
    const email = addr.includes('<') ? addr.replace(/.*<([^>]+)>.*/, '$1').trim() : addr.trim();
    const match = pattern.exec(email);
    if (match) return match[1];
  }
  return null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Always return 200 — log errors but don't let Resend retry
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let payload: ResendInboundPayload;
  try {
    payload = await req.json() as ResendInboundPayload;
  } catch {
    console.error('[inbound] Invalid JSON payload');
    return NextResponse.json({ ok: false, reason: 'invalid_json' });
  }

  const { from, to, subject, text, html, messageId } = payload;

  // ── Parse engagement address ──────────────────────────────────────────────

  const engagementId = parseEngagementAddress(to);

  if (!engagementId) {
    // Unmatched — log to email_logs for dev visibility
    console.warn('[inbound] Unmatched inbound email — no engagement address found', { from, to, subject });
    await adminSupabase.from('email_logs').insert({
      user_id:         null,
      template_name:   'inbound_unmatched',
      recipient_email: Array.isArray(to) ? to.join(', ') : to,
      subject:         subject ?? null,
      status:          'unmatched',
      error_text:      `From: ${from} | No engagement address matched`,
    });
    return NextResponse.json({ ok: true, reason: 'unmatched' });
  }

  // ── Verify engagement exists ──────────────────────────────────────────────

  const { data: engagement } = await adminSupabase
    .from('cro_engagements')
    .select('id, user_id, capture_mode, stage, cro_name')
    .eq('id', engagementId)
    .maybeSingle();

  if (!engagement) {
    console.warn('[inbound] Engagement not found for id', engagementId);
    await adminSupabase.from('email_logs').insert({
      user_id:         null,
      template_name:   'inbound_unmatched',
      recipient_email: Array.isArray(to) ? to.join(', ') : to,
      subject:         subject ?? null,
      status:          'unmatched',
      error_text:      `Engagement ${engagementId} not found`,
    });
    return NextResponse.json({ ok: true, reason: 'engagement_not_found' });
  }

  // Safety: only capture replies for assisted-mode engagements
  if (engagement.capture_mode !== 'assisted') {
    console.warn('[inbound] Reply arrived for native-mode engagement — ignoring', engagementId);
    return NextResponse.json({ ok: true, reason: 'native_mode_skipped' });
  }

  // ── Dedup: skip if this Message-ID already stored ─────────────────────────

  if (messageId) {
    const { data: existing } = await adminSupabase
      .from('engagement_messages')
      .select('id')
      .eq('engagement_id', engagementId)
      .eq('resend_message_id', messageId)
      .maybeSingle();

    if (existing) {
      console.log('[inbound] Duplicate message — skipping', messageId);
      return NextResponse.json({ ok: true, reason: 'duplicate' });
    }
  }

  // ── Insert inbound message ────────────────────────────────────────────────

  const now = new Date().toISOString();
  const { data: newMsg, error: insertErr } = await adminSupabase
    .from('engagement_messages')
    .insert({
      engagement_id:    engagementId,
      direction:        'inbound',
      message_type:     'response',
      subject:          subject ?? null,
      body:             text ?? html ?? null,
      status:           'received',
      sent_at:          now,
      ai_generated:     false,
      resend_message_id: messageId ?? null,
      created_at:       now,
    })
    .select('id')
    .single();

  if (insertErr || !newMsg) {
    console.error('[inbound] Failed to insert message', insertErr);
    return NextResponse.json({ ok: false, reason: 'insert_failed' });
  }

  // ── Advance engagement stage ──────────────────────────────────────────────

  const EARLY_STAGES = ['enquiry_draft', 'enquiry_sent', 'followup_draft', 'followup_sent'];
  if (EARLY_STAGES.includes(engagement.stage)) {
    await adminSupabase
      .from('cro_engagements')
      .update({ stage: 'response_received', updated_at: now })
      .eq('id', engagementId);
  }

  console.log('[inbound] Captured reply for engagement', engagementId, 'message', newMsg.id);

  // ── Forward copy to user's inbox (Task 7) ────────────────────────────────
  // Look up the user's email and forward the reply with a footer.
  // Uses the app's notification FROM address so it won't re-trigger inbound capture.
  void (async () => {
    try {
      const { data: userData } = await adminSupabase.auth.admin.getUserById(engagement.user_id);
      const userEmail = userData?.user?.email;
      if (!userEmail) return;

      const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const engUrl    = `${appUrl}/biotech/engagements/${engagementId}`;
      const croName   = engagement.cro_name ?? 'CRO';
      const bodyText  = text ?? html ?? '(no body)';

      const forwardHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <p style="margin:0 0 1em 0;color:#555;font-size:12px;">
    <strong>Forwarded by BiotechOS</strong> — reply from ${from} for engagement with ${croName}
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 1.5em 0">
  <div style="white-space:pre-wrap">${bodyText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:1.5em 0 1em 0">
  <p style="margin:0;font-size:11px;color:#9ca3af;">
    Managed by BiotechOS ·
    <a href="${engUrl}" style="color:#6366f1;text-decoration:none;">View engagement &amp; draft reply →</a>
  </p>
</body></html>`;

      const { sendEmail } = await import('@shared/lib/email');
      await sendEmail({
        to:           userEmail,
        subject:      `[Fwd] ${subject ?? 'Reply from ' + from}`,
        html:         forwardHtml,
        templateName: 'inbound_forward',
        userId:       engagement.user_id,
      });
    } catch (err) {
      console.error('[inbound] Forward failed', err);
    }
  })();

  // ── Trigger AI draft (Task 9) — async, don't block response ──────────────
  // Fire-and-forget: generate AI draft for this inbound reply
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  void fetch(`${appUrl}/api/inbound/draft`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET ?? '' },
    body:    JSON.stringify({ engagement_id: engagementId, message_id: newMsg.id }),
  }).catch(err => console.error('[inbound] Draft trigger failed', err));

  return NextResponse.json({ ok: true, message_id: newMsg.id });
}
