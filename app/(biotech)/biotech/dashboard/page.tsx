'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Brief {
  id: string;
  title: string | null;
  classification: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Engagement {
  id: string;
  cro_name: string;
  stage: string;
  updated_at: string;
  brief_id: string;
  rfp_internal_briefs: { title: string | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  enquiry_draft:      'Draft',
  enquiry_sent:       'Enquiry sent',
  response_received:  'Response received',
  followup_draft:     'Follow-up draft',
  followup_sent:      'Follow-up sent',
  meeting_scheduled:  'Meeting scheduled',
  meeting_done:       'Meeting done',
  rfp_draft:          'RFP draft',
  rfp_sent:           'RFP sent',
  awarded:            'Awarded',
  closed:             'Closed',
};

const STAGE_COLOR: Record<string, string> = {
  enquiry_draft:      'bg-gray-700 text-gray-300',
  enquiry_sent:       'bg-blue-900/60 text-blue-300',
  response_received:  'bg-amber-900/50 text-amber-300',
  followup_draft:     'bg-gray-700 text-gray-300',
  followup_sent:      'bg-blue-900/60 text-blue-300',
  meeting_scheduled:  'bg-purple-900/50 text-purple-300',
  meeting_done:       'bg-purple-900/60 text-purple-300',
  rfp_draft:          'bg-gray-700 text-gray-300',
  rfp_sent:           'bg-blue-900/60 text-blue-300',
  awarded:            'bg-green-900/50 text-green-300',
  closed:             'bg-gray-800 text-gray-500',
};

const CLASSIFICATION_COLOR: Record<string, string> = {
  tox:         'bg-red-900/40 border-red-700/40 text-red-300',
  pk:          'bg-cyan-900/40 border-cyan-700/40 text-cyan-300',
  efficacy:    'bg-green-900/40 border-green-700/40 text-green-300',
  in_vitro:    'bg-amber-900/40 border-amber-700/40 text-amber-300',
  combination: 'bg-purple-900/40 border-purple-700/40 text-purple-300',
  other:       'bg-gray-800 border-gray-700 text-gray-400',
};

function timeAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days  = Math.floor(ms / 86_400_000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30)  return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BiotechDashboard() {
  const router = useRouter();

  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Derive display name from metadata or email
      const meta = user.user_metadata;
      const name =
        meta?.full_name ||
        meta?.name ||
        (user.email?.split('@')[0] ?? '');
      setUserName(name);

      // Load briefs + recent engagements in parallel
      const [briefsRes, engagementsRes] = await Promise.all([
        supabase
          .from('rfp_internal_briefs')
          .select('id, title, classification, status, created_at, updated_at')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(6),
        supabase
          .from('cro_engagements')
          .select('id, cro_name, stage, updated_at, brief_id, rfp_internal_briefs(title)')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(8),
      ]);

      if (briefsRes.data)      setBriefs(briefsRes.data as Brief[]);
      if (engagementsRes.data) setEngagements(engagementsRes.data as Engagement[]);
      setLoading(false);
    }

    void load();
  }, [router]);

  // ── Loading ───────────────────────────────────────────────────────────────

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

  const activeEngagements = engagements.filter(
    e => !['awarded', 'closed'].includes(e.stage)
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-5xl px-5 py-10 space-y-10">

        {/* ── Header ── */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-500 mb-1">
              BiotechOS — CRO Engagement Pipeline
            </p>
            <h1 className="text-3xl font-bold text-white">
              {userName ? `Welcome back, ${userName.split(' ')[0]}` : 'Dashboard'}
            </h1>
            <p className="mt-1.5 text-sm text-gray-400">
              Find, brief, and engage CROs — without exposing your IP.
            </p>
          </div>
          <a
            href="/biotech/briefs/new"
            className="shrink-0 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-950"
          >
            + New Brief
          </a>
        </header>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Active briefs',       value: briefs.length },
            { label: 'Active engagements',  value: activeEngagements.length },
            { label: 'Awaiting response',   value: engagements.filter(e => e.stage === 'enquiry_sent').length },
            { label: 'At RFP stage',        value: engagements.filter(e => ['rfp_draft', 'rfp_sent'].includes(e.stage)).length },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-xl border border-gray-700/60 bg-gray-900/60 px-5 py-4"
            >
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* ── Recent briefs ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
              Study briefs
            </h2>
            <a
              href="/biotech/briefs"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all →
            </a>
          </div>

          {briefs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 px-8 py-12 text-center">
              <p className="text-gray-500 text-sm mb-4">
                No study briefs yet. Start by dumping everything you know about your next preclinical study.
              </p>
              <a
                href="/biotech/briefs/new"
                className="inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Create first brief →
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {briefs.map(brief => {
                const clsColor = brief.classification
                  ? CLASSIFICATION_COLOR[brief.classification] ?? CLASSIFICATION_COLOR.other
                  : CLASSIFICATION_COLOR.other;

                return (
                  <a
                    key={brief.id}
                    href={`/biotech/briefs/${brief.id}`}
                    className="group rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 transition-all hover:border-blue-700/60 hover:bg-gray-900"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors line-clamp-1">
                        {brief.title ?? 'Untitled brief'}
                      </span>
                      {brief.classification && (
                        <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wide rounded-full border px-2 py-0.5 ${clsColor}`}>
                          {brief.classification}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600">Updated {timeAgo(brief.updated_at)}</p>
                  </a>
                );
              })}

              {/* New brief card */}
              <a
                href="/biotech/briefs/new"
                className="group rounded-xl border border-dashed border-gray-700 bg-gray-900/20 p-4 transition-all hover:border-blue-600/40 hover:bg-gray-900/40 flex items-center justify-center gap-2 text-gray-600 hover:text-blue-400"
              >
                <span className="text-lg font-light">+</span>
                <span className="text-sm">New brief</span>
              </a>
            </div>
          )}
        </section>

        {/* ── Recent engagements ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
              CRO engagements
            </h2>
            {engagements.length > 0 && (
              <a
                href="/biotech/engagements"
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                View all →
              </a>
            )}
          </div>

          {engagements.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-6 py-8 text-center text-sm text-gray-600">
              No CRO engagements yet. Create a brief, select CROs, and send your first capability enquiry.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">CRO</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Brief</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Stage</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {engagements.map((eng, i) => {
                    const stageLabel = STAGE_LABELS[eng.stage] ?? eng.stage;
                    const stageColor = STAGE_COLOR[eng.stage] ?? 'bg-gray-700 text-gray-400';
                    const briefTitle = eng.rfp_internal_briefs?.title ?? 'Untitled brief';

                    return (
                      <tr
                        key={eng.id}
                        className={`transition-colors hover:bg-gray-800/40 cursor-pointer ${i < engagements.length - 1 ? 'border-b border-gray-800' : ''}`}
                        onClick={() => router.push(`/biotech/briefs/${eng.brief_id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-200">{eng.cro_name}</td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell max-w-[200px] truncate">{briefTitle}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${stageColor}`}>
                            {stageLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-right text-xs">{timeAgo(eng.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Quick nav ── */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              href:  '/biotech/briefs/new',
              title: 'New study brief',
              desc:  'Dump everything you know — private vault, never shared without your approval.',
              color: 'hover:border-blue-700/60',
              icon:  (
                <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M12 4v16m8-8H4" />
                </svg>
              ),
            },
            {
              href:  '/biotech/briefs',
              title: 'All briefs',
              desc:  'View, archive, and manage your study briefs.',
              color: 'hover:border-gray-600',
              icon:  (
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              ),
            },
            {
              href:  '/biotech/engagements',
              title: 'Engagement pipeline',
              desc:  'Track all active CRO conversations across your briefs.',
              color: 'hover:border-purple-700/60',
              icon:  (
                <svg className="h-5 w-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
              ),
            },
          ].map(card => (
            <a
              key={card.href}
              href={card.href}
              className={`group rounded-xl border border-gray-700/60 bg-gray-900/40 p-5 transition-all ${card.color}`}
            >
              <div className="mb-3">{card.icon}</div>
              <h3 className="text-sm font-semibold text-gray-200 mb-1 group-hover:text-white transition-colors">
                {card.title}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
            </a>
          ))}
        </section>

      </div>
    </div>
  );
}
