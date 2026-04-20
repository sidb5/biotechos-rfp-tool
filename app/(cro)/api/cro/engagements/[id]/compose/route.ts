// POST /api/cro/engagements/[id]/compose
// Sends a user-composed follow-up message for a CRO engagement.
// Unlike /send (which approves an AI draft), this creates + sends in one step.
//
// Body: { subject: string, body: string }

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

  const { subject, body: msgBody } = body as { subject?: string; body?: string };
  if (!subject?.trim() || !msgBody?.trim()) {
    return NextResponse.json({ error: 'subject and body are required' }, { status: 400 });
  }

  // Verify engagement belongs to this CRO user
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, stage, capture_mode')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  // Load CRO profile for sender identity
  let senderDisplayName: string = user.email ?? 'CRO';
  let senderEmail: string       = user.email ?? '';
  try {
    const { data: profile } = await supabase
      .from('cro_profiles')
      .select('company_name, sender_display_name, sender_email')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.sender_display_name) senderDisplayName = profile.sender_display_name;
    if (profile?.sender_email)        senderEmail        = profile.sender_email;
    else if (profile?.company_name)   senderDisplayName  = profile.company_name;
  } catch { /* use auth defaults */ }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const resendApiKey = process.env.RESEND_API_KEY;
  const verifiedFrom = process.env.BIOTECH_OUTREACH_EMAIL ?? 'onboarding@resend.dev';

  if (!resendApiKey) {
    return NextResponse.json({ error: 'Email not configured (RESEND_API_KEY missing)' }, { status: 500 });
  }

  const now = new Date().toISOString();

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendApiKey);

    const replyToAddress = await resolveReplyTo(engagementId, senderEmail, adminSupabase, senderDisplayName);

    const { data: sendData, error: sendErr } = await resend.emails.send({
      from:    `${senderDisplayName} via BiotechOS <${verifiedFrom}>`,
      replyTo: replyToAddress,
      to:      engagement.cro_email,
      subject: subject.trim(),
      text:    msgBody.trim(),
    });

    if (sendErr) throw new Error(sendErr.message);

    const resendMessageId = (sendData as { id?: string } | null)?.id ?? null;

    // Record the sent message in the thread
    const { data: newMsg, error: insertErr } = await adminSupabase
      .from('engagement_messages')
      .insert({
        engagement_id:    engagementId,
        direction:        'outbound',
        message_type:     'response',
        status:           'sent',
        subject:          subject.trim(),
        body:             msgBody.trim(),
        ai_generated:     false,
        sent_at:          now,
        created_at:       now,
        resend_message_id: resendMessageId,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[compose] message insert error:', insertErr.message);
    }

    // Advance stage to followup_sent if currently at enquiry_sent or response_received
    const advanceStages = ['enquiry_sent', 'response_received'];
    if (advanceStages.includes(engagement.stage)) {
      await supabase
        .from('cro_engagements')
        .update({ stage: 'followup_sent', updated_at: now })
        .eq('id', engagementId);
    }

    await adminSupabase.from('email_logs').insert({
      user_id:         user.id,
      template_name:   'cro_followup',
      recipient_email: engagement.cro_email,
      subject:         subject.trim(),
      status:          'sent',
    });

    return NextResponse.json({ sent: true, message_id: newMsg?.id ?? null });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[compose] send error:', errMsg);

    await adminSupabase.from('email_logs').insert({
      user_id:         user.id,
      template_name:   'cro_followup',
      recipient_email: engagement.cro_email,
      subject:         subject.trim(),
      status:          'failed',
      error_text:      errMsg,
    });

    return NextResponse.json({ error: errMsg, sent: false }, { status: 500 });
  }
}
