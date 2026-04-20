import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Internal email sender — wraps Resend and logs every attempt.
// Never throws — always resolves, even on failure.

export interface SendEmailOptions {
  to: string;
  subject: string;
  /** Prefer `text` for human-readable emails — HTML trips spam filters */
  html?: string;
  text?: string;
  templateName: string;
  userId?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  // Prefer explicit EMAIL_FROM, then fall back to the verified outreach domain
  // that we already use for outbound biotech/CRO emails. Avoids needing to verify
  // a separate notifications domain just for transactional messages.
  const outreach = process.env.BIOTECH_OUTREACH_EMAIL;
  const from = process.env.EMAIL_FROM
    ?? (outreach ? `BiotechOS <${outreach}>` : 'onboarding@resend.dev');

  // Supabase admin client for logging (uses service role — bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping send');
    await supabase.from('email_logs').insert({
      user_id: opts.userId ?? null,
      template_name: opts.templateName,
      recipient_email: opts.to,
      subject: opts.subject,
      status: 'skipped',
      error_text: 'RESEND_API_KEY not configured',
    }).then(() => {});
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    // Dynamically import Resend so missing key doesn't crash at module load time
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    // Resend requires at least one of html/text/template (discriminated union).
    // Build the payload loosely, then cast — at least one body field is
    // guaranteed to be set by the fallback below.
    const emailPayload: Record<string, unknown> = {
      from,
      to:      opts.to,
      subject: opts.subject,
    };
    if (opts.text) emailPayload.text = opts.text;
    if (opts.html) emailPayload.html = opts.html;
    if (!opts.text && !opts.html) {
      emailPayload.text = '(no content)';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await resend.emails.send(emailPayload as any);

    if (error) throw new Error(error.message);

    await supabase.from('email_logs').insert({
      user_id: opts.userId ?? null,
      template_name: opts.templateName,
      recipient_email: opts.to,
      subject: opts.subject,
      status: 'sent',
    }).then(() => {});

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email] send failed:', msg);

    await supabase.from('email_logs').insert({
      user_id: opts.userId ?? null,
      template_name: opts.templateName,
      recipient_email: opts.to,
      subject: opts.subject,
      status: 'failed',
      error_text: msg,
    }).then(() => {});

    return { ok: false, error: msg };
  }
}

// ── Reply-To routing ────────────────────────────────────────────────────────
//
// For assisted-mode engagements, outbound emails use a per-engagement
// reply-to address (e.{engagementId}@{RESEND_INBOUND_DOMAIN}) so replies
// arrive at the app's inbound webhook rather than the user's inbox.
//
// For native-mode engagements, the user's own email is used.
// When RESEND_INBOUND_DOMAIN is not configured, falls back to userEmail
// regardless of mode (safe degradation — inbound capture just won't work).

// Optional displayName surfaces in the Reply-To header so recipients see
// e.g. "Acme Bio via BiotechOS <reply.uuid@replies.domain>" instead of
// a raw UUID address.
export async function resolveReplyTo(
  engagementId: string,
  userEmail: string,
  adminSupabase: SupabaseClient,
  displayName?: string,
): Promise<string> {
  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN;

  const { data: eng } = await adminSupabase
    .from('cro_engagements')
    .select('capture_mode, reply_to_address')
    .eq('id', engagementId)
    .single();

  if (!eng || eng.capture_mode !== 'assisted' || !inboundDomain) {
    return userEmail;
  }

  // reply. prefix is more recognisable than bare e. — looks intentional to recipients.
  // Display name further hides the UUID from casual inspection.
  const assistedEmail   = `reply.${engagementId}@${inboundDomain}`;
  const assistedReplyTo = displayName
    ? `${displayName} via BiotechOS <${assistedEmail}>`
    : `BiotechOS Replies <${assistedEmail}>`;

  // Persist / update stored address (handles migration from old e. prefix)
  if (eng.reply_to_address !== assistedReplyTo) {
    await adminSupabase
      .from('cro_engagements')
      .update({ reply_to_address: assistedReplyTo })
      .eq('id', engagementId);
  }

  return assistedReplyTo;
}

// Check if user has opted in to a given email type
export async function userWantsEmail(
  userId: string,
  prefKey: 'rfp_parsed' | 'deadline_reminders' | 'proposal_complete' | 'win_notification' | 'weekly_summary'
): Promise<boolean> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase
    .from('user_email_preferences')
    .select(prefKey)
    .eq('user_id', userId)
    .maybeSingle();

  // Default to true if no preferences row exists
  if (!data) return true;
  return (data as Record<string, boolean>)[prefKey] !== false;
}
