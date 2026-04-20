import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import AppShell from '@shared/components/AppShell';
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
    .select('id, status, rfp_id, created_at, updated_at, outcome, quote_data, share_enabled, share_views, share_last_viewed_at, rfps(biotech_name, parsed_summary)')
    .eq('cro_id', profile?.id ?? '')
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });

  const allProposals = proposals ?? [];

  // ─── Split into RFP bids vs quotes ────────────────────────────────────────
  const isRfpBid = (p: typeof allProposals[number]) => {
    const rfpData = p.rfps as { parsed_summary?: { request_type?: string } } | null;
    const mode = (p.quote_data as { mode?: string } | null)?.mode;
    return rfpData?.parsed_summary?.request_type === 'formal_rfp' || mode === 'full_proposal';
  };

  const recentRfpBids = allProposals.filter(isRfpBid).slice(0, 5);
  const recentQuotes  = allProposals.filter(p => !isRfpBid(p)).slice(0, 5);

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const quotesThisMonth = allProposals.filter(p => p.created_at && isThisMonth(p.created_at)).length;
  const sentThisMonth   = allProposals.filter(
    p => p.status === 'complete' && p.updated_at && isThisMonth(p.updated_at)
  ).length;
  const hoursSaved = allProposals.length * 27;

  // ─── Engagement AI draft items ────────────────────────────────────────────
  const { data: pendingEngDrafts } = await supabase
    .from('cro_engagements')
    .select('id, cro_name')
    .eq('user_id', user.id ?? '');

  const engagementIds = (pendingEngDrafts ?? []).map(e => e.id);
  let engDraftItems: AttentionItem[] = [];
  if (engagementIds.length > 0) {
    const [{ data: draftMsgs }, { data: linkedProposals }] = await Promise.all([
      supabase
        .from('engagement_messages')
        .select('id, engagement_id, created_at')
        .in('engagement_id', engagementIds)
        .eq('direction', 'outbound')
        .eq('ai_generated', true)
        .eq('status', 'draft')
        .order('created_at', { ascending: false }),
      supabase
        .from('proposals')
        .select('id, engagement_id')
        .in('engagement_id', engagementIds),
    ]);

    // Map engagement_id → proposal_id for quote-originated threads
    const proposalByEngId = new Map<string, string>();
    for (const p of linkedProposals ?? []) {
      if (p.engagement_id) proposalByEngId.set(p.engagement_id, p.id);
    }

    const seen = new Set<string>();
    for (const msg of draftMsgs ?? []) {
      if (seen.has(msg.engagement_id)) continue;
      seen.add(msg.engagement_id);
      const eng = (pendingEngDrafts ?? []).find(e => e.id === msg.engagement_id);
      const proposalId = proposalByEngId.get(msg.engagement_id);
      engDraftItems.push({
        key: `engdraft-${msg.engagement_id}`,
        label: `Reply received from ${eng?.cro_name ?? 'client'} — AI draft ready for review`,
        actionLabel: 'Review & send →',
        // Route to /quote/{id} for quote threads (where the full context lives),
        // fall back to /engagements/{id} for paste-flow engagements
        actionHref: proposalId ? `/quote/${proposalId}` : `/engagements/${msg.engagement_id}`,
      });
    }
  }

  // ─── Attention items ───────────────────────────────────────────────────────
  const attentionItems: AttentionItem[] = [];
  const nowMs = Date.now();
  const fortyEightHoursAgo = new Date(nowMs - 48 * 3600_000);
  const fourteenDaysAgo    = new Date(nowMs - 14 * 86_400_000);
  const sixtyMinsAgo       = new Date(nowMs - 60 * 60_000);

  for (const p of allProposals) {
    if (p.outcome === 'won' || p.outcome === 'lost') continue;
    const rfpData  = p.rfps as { biotech_name?: string; parsed_summary?: { submission_deadline?: string } } | null;
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

  for (const p of allProposals) {
    const rfpData   = p.rfps as { biotech_name?: string } | null;
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

  const allAttentionItems = [...engDraftItems, ...attentionItems];
  const topAttentionItems = allAttentionItems.slice(0, 5);

  // ─── Pill helpers ──────────────────────────────────────────────────────────
  const statusPill: Record<string, { label: string; cls: string }> = {
    draft:       { label: 'Draft',  cls: 'bg-gray-100 text-gray-500'  },
    in_progress: { label: 'Draft',  cls: 'bg-gray-100 text-gray-500'  },
    complete:    { label: 'Sent',   cls: 'bg-blue-50 text-blue-700'   },
    sent:        { label: 'Sent',   cls: 'bg-blue-50 text-blue-700'   },
  };
  const outcomePill: Record<string, { label: string; cls: string }> = {
    won:         { label: 'Won',        cls: 'bg-green-50 text-green-700'   },
    lost:        { label: 'Lost',       cls: 'bg-red-50 text-red-600'       },
    pending:     { label: 'Pending',    cls: 'bg-yellow-50 text-yellow-700' },
    no_decision: { label: 'No decision',cls: 'bg-gray-100 text-gray-500'    },
    withdrawn:   { label: 'Withdrawn',  cls: 'bg-gray-100 text-gray-500'    },
  };

  function pill(p: typeof allProposals[number]) {
    const outcome = p.outcome as string | null | undefined;
    return outcome
      ? (outcomePill[outcome] ?? statusPill.draft)
      : (statusPill[p.status ?? 'draft'] ?? statusPill.draft);
  }

  function clientName(p: typeof allProposals[number]) {
    const rfpData = p.rfps as { biotech_name?: string } | null;
    return rfpData?.biotech_name ?? 'Unknown client';
  }

  return (
    <AppShell title="Dashboard" navInLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* ── Referral banner ── */}
        <ReferralBanner
          referralCode={(profile as Record<string, string | null> | null)?.referral_code ?? null}
          appUrl={process.env.NEXT_PUBLIC_APP_URL ?? 'https://cro-rfp-tool.vercel.app'}
        />

        {/* ── 3-column grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* 1. Recent RFP Bids */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Recent RFP Bids</h2>
              <a href="/requests" className="text-xs text-green-600 hover:text-green-700 font-medium">View all →</a>
            </div>
            {recentRfpBids.length === 0 ? (
              <div className="px-5 py-10 text-center flex-1 flex flex-col items-center justify-center">
                <p className="text-sm text-gray-400">No RFP bids yet.</p>
                <a href="/rfp/new" className="mt-2 text-xs text-green-600 hover:text-green-700 font-medium">
                  Upload an RFP →
                </a>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50 flex-1">
                {recentRfpBids.map(p => {
                  const { label, cls } = pill(p);
                  return (
                    <li key={p.id}>
                      <a href={`/quote/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{clientName(p)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(p.updated_at)}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 2. Recent Quotes */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Recent Quotes</h2>
              <a href="/quotes" className="text-xs text-green-600 hover:text-green-700 font-medium">View all →</a>
            </div>
            {recentQuotes.length === 0 ? (
              <div className="px-5 py-10 text-center flex-1 flex flex-col items-center justify-center">
                <p className="text-sm text-gray-400">No quotes yet.</p>
                <a href="/engagements/new" className="mt-2 text-xs text-green-600 hover:text-green-700 font-medium">
                  Create a quote →
                </a>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50 flex-1">
                {recentQuotes.map(p => {
                  const { label, cls } = pill(p);
                  return (
                    <li key={p.id}>
                      <a href={`/quote/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{clientName(p)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(p.updated_at)}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 3. Action Needed */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Action Needed</h2>
              {/* "View all" only links to /actions-needed when there are AI drafts —
                  that page exclusively shows AI draft approvals, not sales signals */}
              {engDraftItems.length > 0 && (
                <a href="/actions-needed" className="text-xs text-green-600 hover:text-green-700 font-medium">View all →</a>
              )}
            </div>
            {topAttentionItems.length === 0 ? (
              <div className="px-5 py-10 text-center flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-400">Nothing needs attention right now.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50 flex-1">
                {topAttentionItems.map(item => {
                  const isAiDraft = item.key.startsWith('engdraft-');
                  return (
                    <li key={item.key} className="px-5 py-3.5">
                      {/* Label distinguishes blocking (reply required) from advisory (heads up) */}
                      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${isAiDraft ? 'text-blue-500' : 'text-amber-500'}`}>
                        {isAiDraft ? '● Reply required' : '○ Heads up'}
                      </p>
                      <p className="text-sm text-gray-700 leading-snug mb-1">{item.label}</p>
                      <a
                        href={item.actionHref}
                        className="text-xs text-green-600 hover:text-green-700 font-medium"
                      >
                        {item.actionLabel}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

        </div>

        {/* ── Stats strip ── */}
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
          <a href="/analytics" className="sm:ml-auto text-sm text-green-600 hover:text-green-700 font-medium">
            Full analytics →
          </a>
        </div>

      </div>
    </AppShell>
  );
}
