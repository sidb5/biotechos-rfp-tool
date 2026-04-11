// POST /api/biotech/engagements/[id]/send
// Sends any approved outbound message (followup, meeting invite, etc.)
// Updates message status → sent, engagement stage → followup_sent.

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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
${paragraphs}</body></html>`;
}

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

  const { message_id, subject, body: msgBody } = body as {
    message_id?: string;
    subject?:    string;
    body?:       string;
  };

  if (!message_id || !subject || !msgBody) {
    return NextResponse.json({ error: 'message_id, subject, and body are required' }, { status: 400 });
  }

  // Verify engagement belongs to this user
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, stage')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  // Update message with final content
  await supabase
    .from('engagement_messages')
    .update({ subject, body: msgBody, status: 'approved' })
    .eq('id', message_id)
    .eq('engagement_id', engagementId);

  // Load sender settings
  let senderDisplayName = (user.user_metadata?.full_name as string) || user.email!;
  let senderEmail       = user.email!;
  try {
    const { data: settings } = await supabase
      .from('biotech_user_settings')
      .select('sender_display_name, sender_email')
      .eq('user_id', user.id)
      .maybeSingle();
    if (settings?.sender_display_name) senderDisplayName = settings.sender_display_name;
    if (settings?.sender_email)        senderEmail        = settings.sender_email;
  } catch { /* use auth defaults */ }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const resendApiKey       = process.env.RESEND_API_KEY;
  const verifiedFromEmail  = process.env.BIOTECH_OUTREACH_EMAIL ?? 'onboarding@resend.dev';

  if (!resendApiKey) {
    return NextResponse.json({ sent: false, warning: 'RESEND_API_KEY not configured' });
  }

  try {
    const { Resend } = await import('resend');
    const resend     = new Resend(resendApiKey);

    const { data: sendData, error: sendError } = await resend.emails.send({
      from:     `${senderDisplayName} via BiotechOS <${verifiedFromEmail}>`,
      reply_to: senderEmail,
      to:       engagement.cro_email,
      subject,
      html:     textToHtml(msgBody),
    });

    if (sendError) throw new Error(sendError.message);

    const resendMessageId = (sendData as { id?: string } | null)?.id ?? null;

    await supabase
      .from('engagement_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString(), resend_message_id: resendMessageId })
      .eq('id', message_id);

    // Advance stage: followup_draft → followup_sent
    if (engagement.stage === 'followup_draft') {
      await supabase
        .from('cro_engagements')
        .update({ stage: 'followup_sent', updated_at: new Date().toISOString() })
        .eq('id', engagementId);
    }

    await adminSupabase.from('email_logs').insert({
      user_id:         user.id,
      template_name:   'biotech_followup',
      recipient_email: engagement.cro_email,
      subject,
      status:          'sent',
    });

    return NextResponse.json({ sent: true, message_id });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[send] Resend error:', errMsg);

    await supabase
      .from('engagement_messages')
      .update({ status: 'failed' })
      .eq('id', message_id);

    await adminSupabase.from('email_logs').insert({
      user_id:         user.id,
      template_name:   'biotech_followup',
      recipient_email: engagement.cro_email,
      subject,
      status:          'failed',
      error_text:      errMsg,
    });

    return NextResponse.json(
      { sent: false, error: `Email delivery failed: ${errMsg}` },
      { status: 500 }
    );
  }
}
