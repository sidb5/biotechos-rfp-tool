import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, userWantsEmail } from '@shared/lib/email';
import { deadlineReminderTemplate } from '@shared/lib/email-templates';

// GET /api/cron/deadline-reminders
// Runs daily at 8am via Vercel Cron. Protected by CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = now.toISOString().slice(0, 10);

  // Find draft proposals with submission_deadline in ~7 or ~2 days
  // proposals table stores deadline in rfps.parsed_summary.submission_deadline
  const { data: proposals } = await supabase
    .from('proposals')
    .select(`
      id,
      cro_id,
      status,
      rfps(biotech_name, parsed_summary),
      cro_profiles(user_id, company_name)
    `)
    .eq('status', 'draft');

  let sent = 0;
  for (const p of proposals ?? []) {
    const rfpData = p.rfps as { biotech_name?: string; parsed_summary?: { submission_deadline?: string } } | null;
    const deadline = rfpData?.parsed_summary?.submission_deadline;
    if (!deadline) continue;

    const deadlineDate = new Date(deadline);
    const daysRemaining = Math.round((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysRemaining !== 7 && daysRemaining !== 2) continue;

    const profileData = p.cro_profiles as { user_id?: string; company_name?: string } | null;
    const userId = profileData?.user_id;
    if (!userId) continue;

    // Get user email
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) continue;

    const wantsEmail = await userWantsEmail(userId, 'deadline_reminders');
    if (!wantsEmail) continue;

    const { subject, html } = deadlineReminderTemplate({
      biotechName: rfpData?.biotech_name ?? 'Sponsor',
      proposalId: p.id,
      deadlineDate: deadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      daysRemaining,
      croName: profileData?.company_name ?? 'Team',
    });

    await sendEmail({ to: email, subject, html, templateName: 'deadline_reminder', userId });
    sent++;
  }

  return NextResponse.json({ ok: true, sent, checked: (proposals ?? []).length });
}
