'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';

interface CroEngagement {
  id:       string;
  cro_name: string;
  stage:    string;
}

interface Brief {
  id: string;
  title: string | null;
  classification: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  cro_engagements: CroEngagement[];
}

const CLASSIFICATION_COLOR: Record<string, string> = {
  tox:         'bg-red-900/40 border-red-700/40 text-red-300',
  pk:          'bg-cyan-900/40 border-cyan-700/40 text-cyan-300',
  efficacy:    'bg-green-900/40 border-green-700/40 text-green-300',
  in_vitro:    'bg-amber-900/40 border-amber-700/40 text-amber-300',
  combination: 'bg-purple-900/40 border-purple-700/40 text-purple-300',
  other:       'bg-gray-800 border-gray-700 text-gray-400',
};

// Dot colour per stage — conveys health at a glance
const STAGE_DOT: Record<string, string> = {
  enquiry_draft:     'bg-gray-500',
  enquiry_sent:      'bg-blue-400',
  response_received: 'bg-amber-400',
  followup_draft:    'bg-amber-500',
  followup_sent:     'bg-blue-400',
  meeting_scheduled: 'bg-purple-400',
  meeting_done:      'bg-purple-500',
  rfp_draft:         'bg-blue-300',
  rfp_sent:          'bg-blue-300',
  awarded:           'bg-green-400',
  closed:            'bg-gray-600',
};

const STAGE_LABEL: Record<string, string> = {
  enquiry_draft:     'Draft',
  enquiry_sent:      'Enquiry sent',
  response_received: 'Response in',
  followup_draft:    'Follow-up draft',
  followup_sent:     'Follow-up sent',
  meeting_scheduled: 'Meeting',
  meeting_done:      'Meeting done',
  rfp_draft:         'RFP draft',
  rfp_sent:          'RFP sent',
  awarded:           'Awarded',
  closed:            'Closed',
};

function timeAgo(isoString: string): string {
  const ms   = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(ms / 86_400_000);
  const hrs  = Math.floor(ms / 3_600_000);
  const mins = Math.floor(ms / 60_000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hrs < 24)   return `${hrs}h ago`;
  if (days < 30)  return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Inline strip of CRO chips — each chip is clickable and links to the thread
function CroChips({ engagements, briefId }: { engagements: CroEngagement[]; briefId: string }) {
  if (engagements.length === 0) {
    return (
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="text-[11px] text-gray-700 italic">No CROs contacted yet</span>
        <span className="text-[11px] text-gray-700">—</span>
        <a
          href={`/biotech/briefs/${briefId}`}
          className="text-[11px] text-blue-500 hover:text-blue-400 transition-colors"
          onClick={e => e.stopPropagation()}
        >
          Select CROs →
        </a>
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
      {engagements.map(eng => (
        <a
          key={eng.id}
          href={`/biotech/engagements/${eng.id}`}
          title={`${eng.cro_name} — ${STAGE_LABEL[eng.stage] ?? eng.stage}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-700/60 bg-gray-800/80 px-2.5 py-1 text-[11px] font-medium text-gray-300 transition-colors hover:border-blue-700/60 hover:text-blue-300"
        >
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STAGE_DOT[eng.stage] ?? 'bg-gray-500'}`} />
          <span className="truncate max-w-[120px]">{eng.cro_name}</span>
          <span className="text-gray-600 font-normal">·</span>
          <span className="text-gray-500 font-normal">{STAGE_LABEL[eng.stage] ?? eng.stage}</span>
        </a>
      ))}
      {/* Add more CROs shortcut */}
      <a
        href={`/biotech/briefs/${briefId}`}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-700 px-2.5 py-1 text-[11px] text-gray-600 transition-colors hover:border-blue-700/40 hover:text-blue-400"
        title="Add another CRO to this brief"
      >
        + CRO
      </a>
    </div>
  );
}

export default function BriefsListPage() {
  const router = useRouter();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data } = await supabase
        .from('rfp_internal_briefs')
        .select('id, title, classification, status, created_at, updated_at, cro_engagements(id, cro_name, stage)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (data) setBriefs(data as Brief[]);
      setLoading(false);
    }
    void load();
  }, [router]);

  async function toggleArchive(brief: Brief, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setArchiving(brief.id);
    const newStatus = brief.status === 'active' ? 'archived' : 'active';
    await supabase
      .from('rfp_internal_briefs')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', brief.id);
    setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: newStatus } : b));
    setArchiving(null);
  }

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

  const active   = briefs.filter(b => b.status === 'active');
  const archived = briefs.filter(b => b.status === 'archived');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-4xl px-5 py-10 space-y-8">

        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <nav className="mb-1.5 text-xs text-gray-600">
              <a href="/biotech/dashboard" className="hover:text-gray-400 transition-colors">Dashboard</a>
              <span className="mx-1.5">/</span>
              <span className="text-gray-400">Briefs</span>
            </nav>
            <h1 className="text-2xl font-semibold text-white">Study briefs</h1>
            <p className="mt-1 text-sm text-gray-400">
              {active.length} active{archived.length > 0 ? `, ${archived.length} archived` : ''}
            </p>
          </div>
          <a
            href="/biotech/briefs/new"
            className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            + New Brief
          </a>
        </header>

        {/* Empty state */}
        {briefs.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 px-8 py-16 text-center">
            <p className="text-gray-500 text-sm mb-4">
              No briefs yet. Create one to start finding and engaging CROs.
            </p>
            <a
              href="/biotech/briefs/new"
              className="inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              Create first brief →
            </a>
          </div>
        )}

        {/* Active briefs */}
        {active.length > 0 && (
          <section className="space-y-3">
            {active.map(brief => {
              const clsColor = brief.classification
                ? CLASSIFICATION_COLOR[brief.classification] ?? CLASSIFICATION_COLOR.other
                : null;

              return (
                <div
                  key={brief.id}
                  className="group rounded-xl border border-gray-700/60 bg-gray-900/60 px-5 py-4 transition-all hover:border-blue-700/50 hover:bg-gray-900"
                >
                  {/* Top row: title + archive */}
                  <div className="flex items-start justify-between gap-4">
                    <a href={`/biotech/briefs/${brief.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-medium text-gray-100 group-hover:text-blue-300 transition-colors">
                          {brief.title ?? 'Untitled brief'}
                        </span>
                        {clsColor && (
                          <span className={`text-[10px] font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 ${clsColor}`}>
                            {brief.classification}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">Updated {timeAgo(brief.updated_at)}</p>
                    </a>
                    <button
                      onClick={e => toggleArchive(brief, e)}
                      disabled={archiving === brief.id}
                      className="shrink-0 text-xs text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40 px-2 py-1"
                    >
                      Archive
                    </button>
                  </div>

                  {/* CRO engagement chips — the key visual that explains the relationship */}
                  <CroChips engagements={brief.cro_engagements ?? []} briefId={brief.id} />
                </div>
              );
            })}
          </section>
        )}

        {/* Archived briefs */}
        {archived.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 pt-2">Archived</h2>
            {archived.map(brief => (
              <div
                key={brief.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900/20 px-5 py-4 opacity-50 hover:opacity-70 transition-opacity"
              >
                <a href={`/biotech/briefs/${brief.id}`} className="flex-1 min-w-0">
                  <span className="text-sm text-gray-400">
                    {brief.title ?? 'Untitled brief'}
                  </span>
                  <p className="text-xs text-gray-700 mt-1">{timeAgo(brief.updated_at)}</p>
                </a>
                <button
                  onClick={e => toggleArchive(brief, e)}
                  disabled={archiving === brief.id}
                  className="shrink-0 text-xs text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40 px-2 py-1"
                >
                  Restore
                </button>
              </div>
            ))}
          </section>
        )}

      </div>
    </div>
  );
}
