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

      const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      // Link to the correct engagement page depending on initiator persona
      const engPath     = initiator === 'cro'
        ? `/engagements/${engagement_id}`
        : `/biotech/engagements/${engagement_id}`;
      const engUrl      = `${appUrl}${engPath}`;

      const subject = `A response from ${counterpartyLabel} is ready for your review`;

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="margin:0 0 0.5em 0;font-size:18px;color:#111">
    Reply from ${counterpartyLabel}
  </h2>
  <p style="margin:0 0 1em 0;color:#555">
    An AI-generated response draft is waiting for your review. Click the link below to approve, edit, or dismiss it.
  </p>
  <p style="margin:1.5em 0">
    <a href="${engUrl}"
       style="background:#2563eb;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
      Review &amp; approve draft →
    </a>
  </p>
  <p style="font-size:11px;color:#9ca3af;margin:2em 0 0 0">
    Managed by BiotechOS · <a href="${engUrl}" style="color:#6366f1;text-decoration:none;">View engagement</a>
  </p>
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
