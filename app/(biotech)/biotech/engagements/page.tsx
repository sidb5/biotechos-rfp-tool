'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';

interface Engagement {
  id: string;
  cro_name: string;
  cro_email: string;
  stage: string;
  updated_at: string;
  brief_id: string;
  rfp_internal_briefs: { title: string | null } | null;
}

const STAGE_LABELS: Record<string, string> = {
  enquiry_draft:     'Draft',
  enquiry_sent:      'Enquiry sent',
  response_received: 'Response received',
  followup_draft:    'Follow-up draft',
  followup_sent:     'Follow-up sent',
  meeting_scheduled: 'Meeting scheduled',
  meeting_done:      'Meeting done',
  rfp_draft:         'RFP draft',
  rfp_sent:          'RFP sent',
  awarded:           'Awarded',
  closed:            'Closed',
};

const STAGE_COLOR: Record<string, string> = {
  enquiry_draft:     'bg-gray-700 text-gray-400',
  enquiry_sent:      'bg-blue-900/60 text-blue-300',
  response_received: 'bg-amber-900/50 text-amber-300',
  followup_draft:    'bg-gray-700 text-gray-400',
  followup_sent:     'bg-blue-900/60 text-blue-300',
  meeting_scheduled: 'bg-purple-900/50 text-purple-300',
  meeting_done:      'bg-purple-900/60 text-purple-300',
  rfp_draft:         'bg-gray-700 text-gray-400',
  rfp_sent:          'bg-blue-900/60 text-blue-300',
  awarded:           'bg-green-900/50 text-green-300',
  closed:            'bg-gray-800 text-gray-600',
};

const NEXT_ACTION: Record<string, string> = {
  enquiry_draft:     'Send enquiry',
  enquiry_sent:      'Log response',
  response_received: 'Draft reply',
  followup_draft:    'Review reply',
  followup_sent:     'Log response',
  meeting_scheduled: 'Log meeting notes',
  meeting_done:      'Generate RFP',
  rfp_draft:         'Review RFP',
  rfp_sent:          'Awaiting decision',
  awarded:           'Awarded ✓',
  closed:            'Closed',
};

type FilterTab = 'all' | 'active' | 'awaiting' | 'meeting' | 'rfp' | 'closed';

function timeAgo(iso: string): string {
  const ms   = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  const hrs  = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hrs < 24)   return `${hrs}h ago`;
  if (days < 30)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function matchesTab(stage: string, tab: FilterTab): boolean {
  switch (tab) {
    case 'all':      return true;
    case 'active':   return !['awarded', 'closed'].includes(stage);
    case 'awaiting': return ['enquiry_sent', 'followup_sent'].includes(stage);
    case 'meeting':  return ['meeting_scheduled', 'meeting_done'].includes(stage);
    case 'rfp':      return ['rfp_draft', 'rfp_sent'].includes(stage);
    case 'closed':   return ['awarded', 'closed'].includes(stage);
    default:         return true;
  }
}

export default function EngagementsPage() {
  const router = useRouter();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<FilterTab>('active');
  const [groupByBrief, setGroupByBrief] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data } = await supabase
        .from('cro_engagements')
        .select('id, cro_name, cro_email, stage, updated_at, brief_id, rfp_internal_briefs(title)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (data) setEngagements(data as Engagement[]);
      setLoading(false);
    }
    void load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const filtered = engagements.filter(e => matchesTab(e.stage, tab));

  // Group by brief if toggled
  const groups: Record<string, { title: string; items: Engagement[] }> = {};
  if (groupByBrief) {
    for (const e of filtered) {
      const title = e.rfp_internal_briefs?.title ?? 'Untitled brief';
      if (!groups[e.brief_id]) groups[e.brief_id] = { title, items: [] };
      groups[e.brief_id].items.push(e);
    }
  }

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'active',   label: 'Active' },
    { key: 'awaiting', label: 'Awaiting response' },
    { key: 'meeting',  label: 'Meeting' },
    { key: 'rfp',      label: 'RFP stage' },
    { key: 'closed',   label: 'Closed' },
  ];

  function renderTable(items: Engagement[]) {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left">
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">CRO</th>
            {!groupByBrief && (
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Brief</th>
            )}
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Stage</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden md:table-cell">Next action</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((eng, i) => (
            <tr
              key={eng.id}
              onClick={() => router.push(`/biotech/engagements/${eng.id}`)}
              className={`cursor-pointer transition-colors hover:bg-gray-800/40 ${i < items.length - 1 ? 'border-b border-gray-800' : ''}`}
            >
              <td className="px-4 py-3">
                <p className="font-medium text-gray-200">{eng.cro_name}</p>
                <p className="text-xs text-gray-600">{eng.cro_email}</p>
              </td>
              {!groupByBrief && (
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell max-w-[180px] truncate text-xs">
                  {eng.rfp_internal_briefs?.title ?? 'Untitled brief'}
                </td>
              )}
              <td className="px-4 py-3">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STAGE_COLOR[eng.stage] ?? 'bg-gray-700 text-gray-400'}`}>
                  {STAGE_LABELS[eng.stage] ?? eng.stage}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                {NEXT_ACTION[eng.stage] ?? '—'}
              </td>
              <td className="px-4 py-3 text-xs text-gray-600 text-right">{timeAgo(eng.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-5xl px-5 py-10 space-y-6">

        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <nav className="mb-1.5 text-xs text-gray-600">
              <a href="/biotech/dashboard" className="hover:text-gray-400 transition-colors">Dashboard</a>
              <span className="mx-1.5">/</span>
              <span className="text-gray-400">Engagements</span>
            </nav>
            <h1 className="text-2xl font-semibold text-white">CRO engagements</h1>
            <p className="mt-1 text-sm text-gray-400">
              {engagements.length} total engagement{engagements.length !== 1 ? 's' : ''} across all briefs
            </p>
          </div>
          <button
            onClick={() => setGroupByBrief(v => !v)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              groupByBrief
                ? 'border-blue-600/40 bg-blue-600/10 text-blue-300'
                : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            {groupByBrief ? '≡ Flat view' : '⊞ Group by brief'}
          </button>
        </header>

        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-gray-800 pb-px">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
              {t.key !== 'all' && (
                <span className="ml-1.5 text-xs text-gray-600">
                  {engagements.filter(e => matchesTab(e.stage, t.key)).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-6 py-12 text-center text-sm text-gray-600">
            {engagements.length === 0
              ? 'No engagements yet. Create a brief and send your first capability enquiry.'
              : 'No engagements match this filter.'}
          </div>
        ) : groupByBrief ? (
          <div className="space-y-6">
            {Object.entries(groups).map(([briefId, group]) => (
              <div key={briefId}>
                <div className="flex items-center gap-3 mb-2">
                  <a
                    href={`/biotech/briefs/${briefId}`}
                    className="text-sm font-medium text-gray-300 hover:text-blue-400 transition-colors"
                  >
                    {group.title}
                  </a>
                  <span className="text-xs text-gray-600">{group.items.length} CRO{group.items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 overflow-hidden">
                  {renderTable(group.items)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 overflow-hidden">
            {renderTable(filtered)}
          </div>
        )}

      </div>
    </div>
  );
}
