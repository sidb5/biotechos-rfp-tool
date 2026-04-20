// POST /api/cro/engagements/[id]/send
// Sends an approved draft reply from a CRO-initiated engagement back to the counterparty.
//
// Body: { message_id, subject, body }
// The message must be outbound + draft and owned by this CRO user.
// Sends via Resend using the CRO profile's sender identity.
// In assisted mode, reply-to is set to the engagement's inbound capture address.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { createClient }               from '@supabase/supabase-js';
import { resolveReplyTo }             from '@shared/lib/email';

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 1em 0">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
${paragraphs}</body></html>`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const engagementId = params.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { message_id, subject, body: msgBody } = body as {
    message_id?: string;
    subject?:    string;
    body?:       string;
  };

  if (!message_id || !subject || !msgBody) {
    return NextResponse.json({ error: 'message_id, subject, and body are required' }, { status: 400 });
  }

  // Verify engagement belongs to this CRO user
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, stage, capture_mode')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  // Verify message is a draft belonging to this engagement
  const { data: draftMsg } = await supabase
    .from('engagement_messages')
    .select('id, status, direction')
    .eq('id', message_id)
    .eq('engagement_id', engagementId)
    .single();

  if (!draftMsg || draftMsg.direction !== 'outbound' || draftMsg.status !== 'draft') {
    return NextResponse.json({ error: 'Message is not a sendable draft' }, { status: 400 });
  }

  // Update message with (possibly edited) body and mark approved
  await supabase
    .from('engagement_messages')
    .update({ subject, body: msgBody, status: 'approved' })
    .eq('id', message_id);

  // Load CRO profile for sender identity
  let senderDisplayName: string = user.email ?? 'CRO';
  let senderEmail: string       = user.email ?? '';
  try {
    const { data: profile } = await supabase
      .from('cro_profiles')
      .select('company_name, sender_display_name, sender_email')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.company_name)        senderDisplayName  = profile.company_name;
    else if (profile?.sender_display_name) senderDisplayName = profile.sender_display_name;
    if (profile?.sender_email)        senderEmail        = profile.sender_email;
  } catch { /* use auth defaults */ }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const resendApiKey    = process.env.RESEND_API_KEY;
  const verifiedFrom    = process.env.BIOTECH_OUTREACH_EMAIL ?? 'onboarding@resend.dev';

  if (!resendApiKey) {
    return NextResponse.json({ sent: false, warning: 'RESEND_API_KEY not configured' });
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendApiKey);

    // In assisted mode, replies from the counterparty should loop back to the app
    const replyToAddress = await resolveReplyTo(engagementId, senderEmail, adminSupabase, senderDisplayName);

    const { data: sendData, error: sendErr } = await resend.emails.send({
      from:    `${senderDisplayName} via BiotechOS <${verifiedFrom}>`,
      replyTo: replyToAddress,
      to:      engagement.cro_email,
      subject,
      text:    msgBody,
    });

    if (sendErr) throw new Error(sendErr.message);

    const resendMessageId = (sendData as { id?: string } | null)?.id ?? null;
    const now = new Date().toISOString();

    await supabase
      .from('engagement_messages')
      .update({ status: 'sent', sent_at: now, resend_message_id: resendMessageId })
      .eq('id', message_id);

    // No specific stage transition for CRO-initiated response type replies
    // (stage is already response_received after an inbound; sending our reply means
    // we're still in response_received until the counterparty replies again)

    await adminSupabase.from('email_logs').insert({
      user_id:         user.id,
      template_name:   'cro_engagement_reply',
      recipient_email: engagement.cro_email,
      subject,
      status:          'sent',
    });

    return NextResponse.json({ sent: true, message_id });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[cro/send] Resend error:', errMsg);

    await supabase
      .from('engagement_messages')
      .update({ status: 'failed' })
      .eq('id', message_id);

    await adminSupabase.from('email_logs').insert({
      user_id:         user.id,
      template_name:   'cro_engagement_reply',
      recipient_email: engagement.cro_email,
      subject,
      status:          'failed',
      error_text:      errMsg,
    });

    return NextResponse.json({ error: errMsg, sent: false }, { status: 500 });
  }
}
