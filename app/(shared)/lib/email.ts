import { createClient } from '@supabase/supabase-js';

// Internal email sender — wraps Resend and logs every attempt.
// Never throws — always resolves, even on failure.

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  templateName: string;
  userId?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'CRO Proposal Engine <notifications@cro-rfp-tool.com>';

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

    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });

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
