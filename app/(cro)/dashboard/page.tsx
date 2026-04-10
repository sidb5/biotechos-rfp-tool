import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import AppShell from '@shared/components/AppShell';
import DashboardActionBar from '@cro/components/DashboardActionBar';
import DashboardFirstRun from '@cro/components/DashboardFirstRun';
import ReferralBanner from '@shared/components/ReferralBanner';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

interface AttentionItem {
  key: string;
  label: string;
  actionLabel: string;
  actionHref: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name, referral_code')
    .eq('user_id', user.id)
    .single();

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, status, rfp_id, created_at, updated_at, outcome, share_enabled, share_views, share_last_viewed_at, rfps(biotech_name, parsed_summary)')
    .eq('cro_id', profile?.id ?? '')
    .order('updated_at', { ascending: false });

  const allProposals = proposals ?? [];

  // ─── Zone 3 stats ───────────────────────────────────────────────────────────
  const quotesThisMonth = allProposals.filter(p => p.created_at && isThisMonth(p.created_at)).length;
  const sentThisMonth = allProposals.filter(
    p => p.status === 'complete' && p.updated_at && isThisMonth(p.updated_at)
  ).length;
  const hoursSaved = allProposals.length * 27;

  // ─── Zone 2 left: recent requests (last 5) ─────────────────────────────────
  const recentRequests = allProposals.slice(0, 5);

  // ─── Zone 2 right: needs attention (max 5) ─────────────────────────────────
  const attentionItems: AttentionItem[] = [];
  const nowMs = Date.now();
  const fortyEightHoursAgo = new Date(nowMs - 48 * 3600_000);
  const fourteenDaysAgo = new Date(nowMs - 14 * 86_400_000);

  // 1. Upcoming deadlines within 7 days (most urgent)
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
      });
    }
  }

  // 0. Quote viewed within the last 60 minutes (highest priority)
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
      });
    }
  }

  const topAttentionItems = attentionItems.slice(0, 5);

  // ─── Status/outcome pill helpers ────────────────────────────────────────────
  const statusPill: Record<string, { label: string; cls: string }> = {
    draft:       { label: 'Draft',    cls: 'bg-gray-100 text-gray-500' },
    in_progress: { label: 'Draft',    cls: 'bg-gray-100 text-gray-500' },
    complete:    { label: 'Sent',     cls: 'bg-blue-50 text-blue-700'  },
  };
  const outcomePill: Record<string, { label: string; cls: string }> = {
    won:         { label: 'Won',      cls: 'bg-green-50 text-green-700'  },
    lost:        { label: 'Lost',     cls: 'bg-red-50 text-red-600'      },
    pending:     { label: 'Pending',  cls: 'bg-yellow-50 text-yellow-700'},
    no_decision: { label: 'No decision', cls: 'bg-gray-100 text-gray-500' },
    withdrawn:   { label: 'Withdrawn',   cls: 'bg-gray-100 text-gray-500' },
  };

  // ─── First-run: zero proposals ─────────────────────────────────────────────
  if (allProposals.length === 0) {
    return (
      <AppShell title="Proposals">
        <DashboardFirstRun />
      </AppShell>
    );
  }

  return (
    <AppShell title="Proposals">
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* ── Referral banner ────────────────────────────────────────────── */}
        <ReferralBanner
          referralCode={(profile as Record<string, string | null> | null)?.referral_code ?? null}
          appUrl={process.env.NEXT_PUBLIC_APP_URL ?? 'https://cro-rfp-tool.vercel.app'}
        />

        {/* ── Zone 1: Action bar ─────────────────────────────────────────── */}
        <DashboardActionBar />

        {/* ── Zone 2: Activity columns ───────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Recent requests */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Recent RFPs / quote requests</h2>
            </div>
            {recentRequests.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-gray-400">No requests yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Paste a client request above to get started.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {recentRequests.map(p => {
                  const rfpData = p.rfps as { biotech_name?: string; parsed_summary?: { study_type?: string } } | null;
                  const outcome = p.outcome as string | null | undefined;
                  const pill = outcome
                    ? (outcomePill[outcome] ?? statusPill.draft)
                    : (statusPill[p.status ?? 'draft'] ?? statusPill.draft);
                  return (
                    <li key={p.id}>
                      <a
                        href={`/quote/${p.id}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {rfpData?.biotech_name ?? 'Unknown client'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px] font-medium">
                              Full proposal
                            </span>
                            {timeAgo(p.updated_at)}
                          </p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${pill.cls}`}>
                          {pill.label}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Needs attention */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Action needed</h2>
            </div>
            {topAttentionItems.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-gray-400">Nothing needs attention right now.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {topAttentionItems.map(item => (
                  <li key={item.key} className="flex items-center gap-3 px-5 py-3.5">
                    <p className="flex-1 text-sm text-gray-700 leading-snug">{item.label}</p>
                    <a
                      href={item.actionHref}
                      className="shrink-0 text-xs text-green-600 hover:text-green-700 font-medium whitespace-nowrap"
                    >
                      {item.actionLabel}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Zone 3: Stats strip ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-4 border-t border-gray-100 text-sm">
          <span className="text-gray-400">
            Quotes this month:{' '}
            <span className="font-semibold text-gray-600">{quotesThisMonth}</span>
          </span>
          <span className="text-gray-200 hidden sm:inline">|</span>
          <span className="text-gray-400">
            Sent this month:{' '}
            <span className="font-semibold text-gray-600">{sentThisMonth}</span>
          </span>
          <span className="text-gray-200 hidden sm:inline">|</span>
          <span className="text-gray-400">
            Est. hours saved:{' '}
            <span className="font-semibold text-gray-600">~{hoursSaved}h</span>
          </span>
          <a
            href="/analytics"
            className="sm:ml-auto text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Full analytics →
          </a>
        </div>

      </div>
    </AppShell>
  );
}
