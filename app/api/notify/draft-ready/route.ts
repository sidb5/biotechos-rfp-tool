// POST /api/notify/draft-ready
// Called internally by /api/inbound/draft after storing an AI draft.
//
// Two actions:
//   1. Insert a notifications row for in-app badge + list (Task 11).
//   2. Send an email notification to the user (Task 12).
//
// Header: x-internal-secret — must match CRON_SECRET.
// Always returns 200 — errors are logged but do not break the calling pipeline.

import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@supabase/supabase-js';
import { sendEmail }                 from '@shared/lib/email';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let body: {
    engagement_id?: string;
    draft_id?:      string;
    user_id?:       string;
    initiator?:     string;
    cro_name?:      string;
    cro_email?:     string;
  };
  try { body = await req.json(); }
  catch {
    console.error('[notify/draft-ready] Invalid JSON');
    return NextResponse.json({ ok: false, reason: 'invalid_json' });
  }

  const { engagement_id, draft_id, user_id, initiator, cro_name, cro_email } = body;
  if (!engagement_id || !draft_id || !user_id) {
    console.error('[notify/draft-ready] Missing required fields');
    return NextResponse.json({ ok: false, reason: 'missing_fields' });
  }

  const counterpartyLabel = cro_name ?? cro_email ?? 'counterparty';

  // ── Task 11: Insert in-app notification ──────────────────────────────────

  const { data: notif, error: notifErr } = await adminSupabase
    .from('notifications')
    .insert({
      user_id,
      engagement_id,
      draft_id,
      type:      'draft_ready',
      title:     `Response from ${counterpartyLabel}`,
      body_text: 'AI draft ready for your review',
      read:      false,
    })
    .select('id')
    .single();

  if (notifErr) {
    console.error('[notify/draft-ready] Failed to insert notification', notifErr);
  } else {
    console.log('[notify/draft-ready] Notification created', notif?.id);
  }

  // ── Task 12: Send email notification ────────────────────────────────────

  void (async () => {
    try {
      // Get user's email from auth
      const { data: userData } = await adminSupabase.auth.admin.getUserById(user_id);
      const userEmail = userData?.user?.email;
      if (!userEmail) {
        console.warn('[notify/draft-ready] No user email for notification', user_id);
        return;
      }

      const appUrl      = process.env.NEXT_PUBLIC_APP_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
      // Link to the correct engagement page depending on initiator persona
      const engPath     = initiator === 'cro'
        ? `/engagements/${engagement_id}`
        : `/biotech/engagements/${engagement_id}`;
      const engUrl      = `${appUrl}${engPath}`;

      const subject = `A response from ${counterpartyLabel} is ready for your review`;

      // Use table-wrapper layout so Gmail renders it centred (body margin:auto is stripped)
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;">

      <!-- Header bar -->
      <tr><td style="background:#16a34a;padding:16px 28px;">
        <p style="margin:0;color:#ffffff;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">BiotechOS</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:28px">
        <h2 style="margin:0 0 10px 0;font-size:18px;font-weight:700;color:#111827">
          Reply from ${counterpartyLabel}
        </h2>
        <p style="margin:0 0 20px 0;font-size:14px;color:#4b5563;line-height:1.6">
          An AI-generated response draft is waiting for your review. Click below to approve, edit, or dismiss it.
        </p>
        <a href="${engUrl}"
           style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
          Review &amp; approve draft &#8594;
        </a>
        <p style="margin:14px 0 0 0;font-size:12px;color:#9ca3af;word-break:break-all">
          <a href="${engUrl}" style="color:#9ca3af">${engUrl}</a>
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:14px 28px;border-top:1px solid #f3f4f6">
        <p style="margin:0;font-size:11px;color:#9ca3af">
          Managed by BiotechOS &middot; <a href="${engUrl}" style="color:#9ca3af;text-decoration:none">View engagement</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

      await sendEmail({
        to:           userEmail,
        subject,
        html,
        templateName: 'draft_ready_notification',
        userId:       user_id,
      });
      console.log('[notify/draft-ready] Email sent to', userEmail);
    } catch (err) {
      console.error('[notify/draft-ready] Email send failed', err);
    }
  })();

  return NextResponse.json({ ok: true, notification_id: notif?.id });
}
