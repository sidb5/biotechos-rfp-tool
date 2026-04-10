import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, userWantsEmail } from '@shared/lib/email';
import { weeklySummaryTemplate } from '@shared/lib/email-templates';

// GET /api/cron/weekly-summary
// Runs every Monday at 8am via Vercel Cron. Protected by CRON_SECRET.
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
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get all CRO profiles with activity in last 7 days
  const { data: profiles } = await supabase
    .from('cro_profiles')
    .select('id, user_id, company_name');

  let sent = 0;
  for (const profile of profiles ?? []) {
    // Count proposals created this week
    const { count: proposalsCreated } = await supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('cro_id', profile.id)
      .gte('created_at', weekAgo);

    // Count RFPs received this week
    const { count: rfpsReceived } = await supabase
      .from('rfps')
      .select('id', { count: 'exact', head: true })
      .eq('cro_id', profile.id)
      .gte('created_at', weekAgo);

    // Skip inactive users (no activity this week)
    if ((proposalsCreated ?? 0) === 0 && (rfpsReceived ?? 0) === 0) continue;

    // Count won this week
    const { count: proposalsWon } = await supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('cro_id', profile.id)
      .eq('outcome', 'won')
      .gte('updated_at', weekAgo);

    // Pending proposals
    const { data: pendingRows } = await supabase
      .from('proposals')
      .select('id, rfps(biotech_name)')
      .eq('cro_id', profile.id)
      .eq('status', 'draft')
      .limit(5);

    const pendingProposals = (pendingRows ?? []).map(p => ({
      proposalId: p.id,
      biotechName: (p.rfps as { biotech_name?: string } | null)?.biotech_name ?? 'Unknown',
    }));

    const totalProposals = (proposalsCreated ?? 0);
    const hoursSaved = totalProposals * 27;

    // Get user email
    const { data: userData } = await supabase.auth.admin.getUserById(profile.user_id);
    const email = userData?.user?.email;
    if (!email) continue;

    const wantsEmail = await userWantsEmail(profile.user_id, 'weekly_summary');
    if (!wantsEmail) continue;

    const { subject, html } = weeklySummaryTemplate({
      croName: profile.company_name ?? 'Team',
      proposalsCreated: proposalsCreated ?? 0,
      proposalsWon: proposalsWon ?? 0,
      rfpsReceived: rfpsReceived ?? 0,
      hoursSaved,
      pendingProposals,
    });

    await sendEmail({ to: email, subject, html, templateName: 'weekly_summary', userId: profile.user_id });
    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
