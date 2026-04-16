import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import AppShell from '@shared/components/AppShell';

interface AttentionItem {
  key: string;
  label: string;
  actionLabel: string;
  actionHref: string;
  priority: 'urgent' | 'normal' | 'low';
}

export default async function ActionsNeededPage() {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!profile) redirect('/profile');

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, status, outcome, created_at, updated_at, share_last_viewed_at, rfps(biotech_name, parsed_summary)')
    .eq('cro_id', profile.id)
    .order('created_at', { ascending: false });

  const allProposals = proposals ?? [];
  const attentionItems: AttentionItem[] = [];
  const nowMs = Date.now();
  const fortyEightHoursAgo = new Date(nowMs - 48 * 3600_000);
  const fourteenDaysAgo = new Date(nowMs - 14 * 86_400_000);

  // 0. Quote viewed recently (highest priority)
  const sixtyMinsAgo = new Date(nowMs - 60 * 60_000);
  for (const p of allProposals) {
    const rfpData = p.rfps as { biotech_name?: string } | null;
    const lastViewed = (p as Record<string, unknown>).share_last_viewed_at as string | null;
    if (lastViewed && new Date(lastViewed) > sixtyMinsAgo) {
      attentionItems.push({
        key: `viewed-${p.id}`,
        label: `Follow up with ${rfpData?.biotech_name ?? 'client'} — viewed your quote just now`,
        actionLabel: 'Follow up →',
        actionHref: `/quote/${p.id}`,
        priority: 'urgent',
      });
    }
  }

  // 1. Upcoming deadlines within 7 days
  for (const p of allProposals) {
    if (p.outcome === 'won' || p.outcome === 'lost') continue;
    const rfpData = p.rfps as { biotech_name?: string; parsed_summary?: { submission_deadline?: string } } | null;
    const deadline = rfpData?.parsed_summary?.submission_deadline;
    if (!deadline) continue;
    const daysUntil = Math.ceil((new Date(deadline).getTime() - nowMs) / 86_400_000);
    if (daysUntil >= 0 && daysUntil <= 7) {
      const when = daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
      attentionItems.push({
        key: `deadline-${p.id}`,
        label: `Submit ${rfpData?.biotech_name ?? 'Unknown client'} proposal — deadline ${when}`,
        actionLabel: 'Edit proposal →',
        actionHref: `/quote/${p.id}`,
        priority: 'urgent',
      });
    }
  }

  // 2. Draft quotes not sent after 48 hours
  for (const p of allProposals) {
    const rfpData = p.rfps as { biotech_name?: string } | null;
    if (
      (p.status === 'draft' || p.status === 'in_progress') &&
      p.created_at && new Date(p.created_at) < fortyEightHoursAgo
    ) {
      attentionItems.push({
        key: `draft-${p.id}`,
        label: `Finish and send ${rfpData?.biotech_name ?? 'Unknown client'} quote — sitting as draft`,
        actionLabel: 'Continue →',
        actionHref: `/quote/${p.id}`,
        priority: 'normal',
      });
    }
  }

  // 3. Submitted proposals with no outcome after 14 days
  for (const p of allProposals) {
    const rfpData = p.rfps as { biotech_name?: string } | null;
    if (
      p.status === 'complete' && !p.outcome &&
      p.updated_at && new Date(p.updated_at) < fourteenDaysAgo
    ) {
      attentionItems.push({
        key: `outcome-${p.id}`,
        label: `Record win/loss for ${rfpData?.biotech_name ?? 'Unknown client'} — sent 2+ weeks ago`,
        actionLabel: 'Record outcome →',
        actionHref: `/quote/${p.id}`,
        priority: 'low',
      });
    }
  }

  const priorityOrder = { urgent: 0, normal: 1, low: 2 };
  attentionItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const priorityBadge = {
    urgent: 'bg-red-50 border-red-200 text-red-700',
    normal: 'bg-amber-50 border-amber-200 text-amber-700',
    low:    'bg-gray-100 border-gray-200 text-gray-500',
  };

  return (
    <AppShell title="Actions Needed" navInLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        {attentionItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl mb-4">✓</div>
            <p className="text-sm font-medium text-gray-600 mb-1">All caught up</p>
            <p className="text-sm text-gray-400">No actions needed right now. Nice work.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{attentionItems.length} item{attentionItems.length !== 1 ? 's' : ''} need your attention</p>
            <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50 overflow-hidden">
              {attentionItems.map(item => (
                <li key={item.key}>
                  <Link
                    href={item.actionHref}
                    className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <span className={`shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${priorityBadge[item.priority]}`}>
                      {item.priority}
                    </span>
                    <p className="flex-1 text-sm text-gray-700 leading-snug">{item.label}</p>
                    <span className="shrink-0 text-xs text-green-600 hover:text-green-700 font-medium whitespace-nowrap">
                      {item.actionLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}
