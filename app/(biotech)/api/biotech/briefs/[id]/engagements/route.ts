// POST /api/biotech/briefs/[id]/engagements
// Sends an approved enquiry email and updates existing DB records.
// The engagement + message records are always created by the enquiry route first.
// This route only handles the send step.
//
// From:    "[User Name] via BiotechOS <BIOTECH_OUTREACH_EMAIL>"
// Reply-To: user's sender_email from biotech_user_settings (fallback: auth email)

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 1em 0">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
${paragraphs}
</body></html>`;
}

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
    engagement_id,
    message_id,
    cro_email,
    subject,
    body: messageBody,
  } = body as {
    engagement_id?: string;
    message_id?:    string;
    cro_email?:     string;
    subject?:       string;
    body?:          string;
  };

  if (!engagement_id || !message_id || !cro_email || !subject || !messageBody) {
    return NextResponse.json(
      { error: 'engagement_id, message_id, cro_email, subject, and body are required' },
      { status: 400 }
    );
  }

  // Verify engagement belongs to this user + brief (RLS double-check)
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, cro_name')
    .eq('id', engagement_id)
    .eq('user_id', user.id)
    .eq('brief_id', briefId)
    .single();

  if (!engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
  }

  // Admin client for email_logs (bypasses RLS)
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Load sender settings — always fall back to auth email so sending is never blocked
  let senderDisplayName = (user.user_metadata?.full_name as string) || user.email!;
  let senderEmail = user.email!;

  try {
    const { data: settings } = await supabase
      .from('biotech_user_settings')
      .select('sender_display_name, sender_email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settings?.sender_display_name) senderDisplayName = settings.sender_display_name;
    if (settings?.sender_email)        senderEmail        = settings.sender_email;
  } catch {
    // Table not yet migrated — use auth defaults
  }

  // Update message with final subject/body (user may have edited in textarea)
  await supabase
    .from('engagement_messages')
    .update({ subject, body: messageBody, status: 'approved' })
    .eq('id', message_id)
    .eq('engagement_id', engagement_id);

  // ── Send via Resend ───────────────────────────────────────────────────────

  const resendApiKey = process.env.RESEND_API_KEY;
  const verifiedFromEmail =
    process.env.BIOTECH_OUTREACH_EMAIL ?? 'onboarding@resend.dev';

  if (!resendApiKey) {
    console.warn('[engagements] RESEND_API_KEY not set — email not sent');
    return NextResponse.json({
      engagement_id,
      message_id,
      sent:    false,
      warning: 'RESEND_API_KEY not configured — draft saved but not sent',
    });
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendApiKey);

    const fromField = `${senderDisplayName} via BiotechOS <${verifiedFromEmail}>`;

    const { data: sendData, error: sendError } = await resend.emails.send({
      from:     fromField,
      reply_to: senderEmail,
      to:       cro_email,
      subject,
      html:     textToHtml(messageBody),
    });

    if (sendError) throw new Error(sendError.message);

    const resendMessageId = (sendData as { id?: string } | null)?.id ?? null;

    // Update message → sent
    await supabase
      .from('engagement_messages')
      .update({
        status:            'sent',
        sent_at:           new Date().toISOString(),
        resend_message_id: resendMessageId,
      })
      .eq('id', message_id);

    // Update engagement stage → enquiry_sent
    await supabase
      .from('cro_engagements')
      .update({ stage: 'enquiry_sent', updated_at: new Date().toISOString() })
      .eq('id', engagement_id);

    await adminSupabase.from('email_logs').insert({
      user_id:         user.id,
      template_name:   'biotech_enquiry',
      recipient_email: cro_email,
      subject,
      status:          'sent',
    });

    return NextResponse.json({ engagement_id, message_id, sent: true });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[engagements] Resend error:', errMsg);

    await supabase
      .from('engagement_messages')
      .update({ status: 'failed' })
      .eq('id', message_id);

    await adminSupabase.from('email_logs').insert({
      user_id:         user.id,
      template_name:   'biotech_enquiry',
      recipient_email: cro_email,
      subject,
      status:          'failed',
      error_text:      errMsg,
    });

    return NextResponse.json(
      { engagement_id, message_id, sent: false, error: `Email delivery failed: ${errMsg}` },
      { status: 500 }
    );
  }
}
