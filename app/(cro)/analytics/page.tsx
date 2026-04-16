import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import AppShell from '@shared/components/AppShell';
import { getPlan } from '@shared/lib/get-plan';
import { canAccess } from '@shared/lib/feature-flags';
import FeatureGate from '@shared/components/FeatureGate';
import {
  StudyWinRateChart,
  AssayWinRateChart,
  LossReasonsChart,
  MonthlyTrendChart,
  type StudyWinRate,
  type AssayWinRate,
  type LossReasonItem,
  type MonthlyTrend,
} from '@cro/components/AnalyticsCharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function shortMonth(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

const LOSS_LABELS: Record<string, string> = {
  price:          'Price too high',
  competitor:     'Competitor selected',
  timeline:       'Timeline too long',
  capability:     'Capability gap',
  no_response:    'No response',
  scope_mismatch: 'Scope mismatch',
  other:          'Other',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage() {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch CRO profile
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name')
    .eq('user_id', user.id)
    .single();

  if (!profile) redirect('/profile');

  // Plan gate
  const plan = await getPlan(profile.id);
  const analyticsAllowed = canAccess('analytics', plan) as boolean;

  // Fetch all proposals with RFP data + outcome
  const { data: rawProposals } = await supabase
    .from('proposals')
    .select('id, status, outcome, outcome_date, contract_value, loss_reason, created_at, rfps(parsed_summary)')
    .eq('cro_id', profile.id);

  const proposals = rawProposals ?? [];

  // ─── Analytics lock: require 3 sent proposals ────────────────────────────

  const sentCount = proposals.filter(p => p.status === 'complete').length;

  // ─── Summary metrics ─────────────────────────────────────────────────────

  const decidedOutcomes = ['won', 'lost', 'no_decision', 'withdrawn'];
  const decidedProposals = proposals.filter(p => decidedOutcomes.includes(p.outcome ?? ''));
  const wonProposals     = proposals.filter(p => p.outcome === 'won');
  const pendingCount     = proposals.filter(p => p.outcome === 'pending' || !p.outcome).length;

  const winRate = decidedProposals.length > 0
    ? Math.round((wonProposals.length / decidedProposals.length) * 100)
    : null;

  const totalContractValue = wonProposals.reduce((sum, p) => sum + ((p.contract_value as number) ?? 0), 0);
  const avgContractValue = wonProposals.filter(p => p.contract_value).length > 0
    ? totalContractValue / wonProposals.filter(p => p.contract_value).length
    : null;

  // ─── Win rate by study type ───────────────────────────────────────────────

  const studyGroups: Record<string, { won: number; total: number }> = {};
  for (const p of proposals) {
    if (!decidedOutcomes.includes(p.outcome ?? '')) continue;
    const rfpData = p.rfps as { parsed_summary?: { study_type?: string } } | null;
    const st = rfpData?.parsed_summary?.study_type;
    if (!st) continue;
    if (!studyGroups[st]) studyGroups[st] = { won: 0, total: 0 };
    studyGroups[st].total++;
    if (p.outcome === 'won') studyGroups[st].won++;
  }

  const studyWinRates: StudyWinRate[] = Object.entries(studyGroups)
    .filter(([, v]) => v.total >= 2)
    .map(([study_type, v]) => ({
      study_type,
      win_rate: Math.round((v.won / v.total) * 100),
      total: v.total,
    }))
    .sort((a, b) => b.win_rate - a.win_rate);

  // ─── Win rate by assay type ───────────────────────────────────────────────

  const assayGroups: Record<string, { won: number; total: number }> = {};
  for (const p of proposals) {
    if (!decidedOutcomes.includes(p.outcome ?? '')) continue;
    const rfpData = p.rfps as { parsed_summary?: { assay_types?: string[] } } | null;
    const assays: string[] = rfpData?.parsed_summary?.assay_types ?? [];
    for (const assay of assays) {
      if (!assayGroups[assay]) assayGroups[assay] = { won: 0, total: 0 };
      assayGroups[assay].total++;
      if (p.outcome === 'won') assayGroups[assay].won++;
    }
  }

  const assayWinRates: AssayWinRate[] = Object.entries(assayGroups)
    .filter(([, v]) => v.total >= 2)
    .map(([assay_type, v]) => ({
      assay_type,
      win_rate: Math.round((v.won / v.total) * 100),
      total: v.total,
    }))
    .sort((a, b) => b.win_rate - a.win_rate);

  // ─── Loss reasons ─────────────────────────────────────────────────────────

  const lostProposals = proposals.filter(p => p.outcome === 'lost');
  const lossReasonCounts: Record<string, number> = {};
  for (const p of lostProposals) {
    const r = (p.loss_reason as string) ?? 'other';
    lossReasonCounts[r] = (lossReasonCounts[r] ?? 0) + 1;
  }

  const lossReasonData: LossReasonItem[] = lostProposals.length >= 3
    ? Object.entries(lossReasonCounts).map(([k, v]) => ({
        name: LOSS_LABELS[k] ?? k,
        value: v,
      })).sort((a, b) => b.value - a.value)
    : [];

  // ─── Monthly trend (last 12 months) ──────────────────────────────────────

  const monthlyData: Record<string, { created: number; won: number }> = {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = shortMonth(d.toISOString());
    monthlyData[key] = { created: 0, won: 0 };
  }

  for (const p of proposals) {
    if (!p.created_at) continue;
    const key = shortMonth(p.created_at);
    if (!monthlyData[key]) continue;
    monthlyData[key].created++;
    if (p.outcome === 'won') monthlyData[key].won++;
  }

  const monthlyTrend: MonthlyTrend[] = Object.entries(monthlyData).map(([month, v]) => ({
    month,
    ...v,
  }));

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!analyticsAllowed) {
    return (
      <AppShell title="Analytics" navInLayout>
        <FeatureGate feature="analytics" plan={plan} featureLabel="Win/loss analytics" overlay>
          <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[['—','Overall win rate'],['—','Total won value'],['—','Avg contract value'],['0','Pending']].map(([v,l]) => (
                <div key={l} className="bg-white border border-gray-200 rounded-xl p-5">
                  <p className="text-2xl font-bold text-gray-300">{v}</p>
                  <p className="text-xs text-gray-300 mt-1">{l}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {['Win Rate by Study Type','Win Rate by Assay Type','Loss Reasons','Monthly Trend'].map(t => (
                <div key={t} className="bg-white border border-gray-200 rounded-xl p-6 h-40">
                  <p className="text-sm font-semibold text-gray-200 mb-3">{t}</p>
                  <div className="w-full h-16 bg-gray-100 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </FeatureGate>
      </AppShell>
    );
  }

  if (sentCount < 3) {
    return (
      <AppShell title="Analytics" navInLayout>
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="relative">
            {/* Greyed-out analytics preview */}
            <div className="opacity-25 select-none pointer-events-none flex flex-col gap-8" aria-hidden="true">
              {/* Placeholder cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[['—', 'Overall win rate'], ['—', 'Total won value'], ['—', 'Avg contract value'], ['0', 'Pending outcome']].map(([val, label]) => (
                  <div key={label} className="bg-white border border-gray-200 rounded-xl p-5">
                    <p className="text-2xl font-bold text-gray-400">{val}</p>
                    <p className="text-xs text-gray-400 mt-1">{label}</p>
                  </div>
                ))}
              </div>
              {/* Placeholder charts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {['Win Rate by Study Type', 'Win Rate by Assay Type'].map(t => (
                  <div key={t} className="bg-white border border-gray-200 rounded-xl p-6 h-48">
                    <p className="text-sm font-semibold text-gray-900 mb-4">{t}</p>
                    <div className="flex flex-col gap-3">
                      {[60, 45, 30].map(w => (
                        <div key={w} className="flex items-center gap-3">
                          <div className="w-24 h-2 bg-gray-200 rounded-full" />
                          <div className="h-2 bg-gray-200 rounded-full" style={{ width: `${w}%` }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {['Loss Reasons', 'Monthly Trend (last 12 months)'].map(t => (
                  <div key={t} className="bg-white border border-gray-200 rounded-xl p-6 h-48">
                    <p className="text-sm font-semibold text-gray-900 mb-4">{t}</p>
                    <div className="w-full h-24 bg-gray-100 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>

            {/* Unlock message overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
              <div className="bg-white border border-gray-200 rounded-2xl shadow-lg px-8 py-8 max-w-sm">
                <p className="text-base font-semibold text-gray-900 mb-2">
                  Analytics unlock after 3 sent proposals.
                </p>
                <p className="text-sm text-gray-500">
                  You&apos;ve sent{' '}
                  <span className="font-semibold text-gray-700">{sentCount}</span>
                  {' '}of{' '}
                  <span className="font-semibold text-gray-700">3</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Analytics" navInLayout>
      <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col gap-8">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Win rate */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className={`text-2xl font-bold ${winRate !== null ? (winRate >= 50 ? 'text-green-600' : 'text-red-500') : 'text-gray-400'}`}>
              {winRate !== null ? `${winRate}%` : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">Overall win rate</p>
            {decidedProposals.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{wonProposals.length} won / {decidedProposals.length} decided</p>
            )}
          </div>

          {/* Total contract value */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-2xl font-bold text-gray-900">
              {totalContractValue > 0 ? formatUSD(totalContractValue) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">Total won value</p>
          </div>

          {/* Average contract value */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-2xl font-bold text-gray-900">
              {avgContractValue !== null ? formatUSD(avgContractValue) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">Avg contract value</p>
          </div>

          {/* Pending */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
            <p className="text-xs text-gray-500 mt-1">Pending outcome</p>
          </div>
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Win Rate by Study Type</h2>
            <StudyWinRateChart data={studyWinRates} />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Win Rate by Assay Type</h2>
            <AssayWinRateChart data={assayWinRates} />
          </div>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Loss Reasons</h2>
            {lostProposals.length < 3 && (
              <p className="text-xs text-gray-400 mb-3">
                ({lostProposals.length} lost proposal{lostProposals.length !== 1 ? 's' : ''} — needs 3+ to display)
              </p>
            )}
            <LossReasonsChart data={lossReasonData} />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Monthly Trend (last 12 months)</h2>
            <MonthlyTrendChart data={monthlyTrend} />
          </div>
        </div>

      </div>
    </AppShell>
  );
}
