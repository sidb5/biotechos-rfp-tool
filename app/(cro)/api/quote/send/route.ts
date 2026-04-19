import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { quoteSentTemplate } from '@shared/lib/email-templates';
import { resolveReplyTo } from '@shared/lib/email';

// POST — send quote via email + mark as complete + enable sharing
// Body: { proposal_id: string, recipient_email: string, message?: string }
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { proposal_id?: string; recipient_email?: string; subject?: string; reply_to?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { proposal_id: proposalId, recipient_email: recipientEmail, subject: customSubject, reply_to: customReplyTo, message } = body;
  if (!proposalId) return NextResponse.json({ error: 'proposal_id required' }, { status: 400 });
  if (!recipientEmail) return NextResponse.json({ error: 'recipient_email required' }, { status: 400 });

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // Verify ownership + load proposal data
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id, share_token, share_views, quote_data, rfps(biotech_name)')
    .eq('id', proposalId)
    .single();

  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name, sender_display_name, sender_email')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Mark as complete + enable sharing
  const { error: updateErr } = await supabase
    .from('proposals')
    .update({ status: 'complete', share_enabled: true })
    .eq('id', proposalId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Build share URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cro-rfp-tool.vercel.app';
  const shareUrl = `${appUrl}/q/${proposal.share_token}`;

  const quoteData = proposal.quote_data as { scope?: string; mode?: string } | null;
  const scopeSummary = quoteData?.scope ?? undefined;
  const isFullProposal = quoteData?.mode === 'full_proposal';

  const rfpData = proposal.rfps as { biotech_name?: string } | null;
  const biotechName = rfpData?.biotech_name ?? 'your company';
  const croCompanyName = profile.company_name ?? 'Our team';

  const accessCode = (proposal.share_token as string).slice(-6);
  const { subject: defaultSubject, html } = quoteSentTemplate({
    biotechName, croCompanyName, shareUrl, accessCode, scopeSummary,
    documentType: isFullProposal ? 'rfp_bid' : 'quote',
  });

  const finalSubject = customSubject?.trim() || defaultSubject;
  const senderName = profile.sender_display_name ?? profile.company_name ?? 'CRO Proposal Engine';
  const verifiedFrom = process.env.BIOTECH_OUTREACH_EMAIL ?? 'onboarding@resend.dev';
  const fromField = `${senderName} via BiotechOS <${verifiedFrom}>`;

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Create a cro_engagement to own the reply thread ──────────────────────────
  // This wires the quote into the assisted-mode capture pipeline so replies
  // come back to the app, trigger an AI draft, and generate a notification.
  const now = new Date().toISOString();
  let engagementId: string | null = null;
  let replyTo: string = profile.sender_email ?? user.email ?? '';

  try {
    const { data: newEng } = await adminSupabase
      .from('cro_engagements')
      .insert({
        user_id:      user.id,
        cro_name:     biotechName,
        cro_email:    recipientEmail.trim().toLowerCase(),
        initiator:    'cro',
        capture_mode: 'assisted',
        stage:        'enquiry_sent',
        created_at:   now,
        updated_at:   now,
      })
      .select('id')
      .single();

    if (newEng?.id) {
      engagementId = newEng.id;
      // resolveReplyTo returns the inbound address when RESEND_INBOUND_DOMAIN is
      // set, otherwise falls back to the user's email (native-mode behaviour).
      replyTo = await resolveReplyTo(newEng.id, user.email!, adminSupabase);
      // Persist the link so the quote page can always find the conversation.
      await supabase
        .from('proposals')
        .update({ engagement_id: engagementId })
        .eq('id', proposalId);
    }
  } catch { /* non-fatal — email still sends, just without capture */ }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Email not configured (RESEND_API_KEY missing)' }, { status: 500 });
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const { error: resendErr } = await resend.emails.send({
      from:    fromField,
      to:      recipientEmail.trim(),
      replyTo: replyTo || undefined,
      subject: finalSubject,
      html,
    });

    if (resendErr) throw new Error(resendErr.message);

    // Record the sent quote as the first outbound message on the engagement
    if (engagementId) {
      await adminSupabase.from('engagement_messages').insert({
        engagement_id: engagementId,
        direction:     'outbound',
        message_type:  'response',
        status:        'sent',
        subject:       finalSubject,
        body:          `Quote sent. View at: ${shareUrl}\n\n${scopeSummary ?? ''}`.trim(),
        ai_generated:  false,
        created_at:    now,
      });
    }

    await adminSupabase.from('email_logs').insert({
      user_id: user.id,
      template_name: 'quote_sent',
      recipient_email: recipientEmail.trim(),
      subject: finalSubject,
      status: 'sent',
    });

    return NextResponse.json({
      ok: true,
      engagement_id: engagementId,
      share_token: proposal.share_token,
      share_views: proposal.share_views ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    await adminSupabase.from('email_logs').insert({
      user_id: user.id,
      template_name: 'quote_sent',
      recipient_email: recipientEmail.trim(),
      subject: finalSubject,
      status: 'failed',
      error_text: msg,
    });

    return NextResponse.json({
      error: `Email failed: ${msg}`,
      share_token: proposal.share_token,
      share_views: proposal.share_views ?? 0,
    }, { status: 500 });
  }
}
