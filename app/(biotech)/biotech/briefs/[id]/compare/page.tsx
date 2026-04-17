'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import type { CompareResult, RankedBid } from '@biotech/api/biotech/briefs/[id]/compare/route';

// ── Types ────────────────────────────────────────────────────────────────────

interface Engagement {
  id: string;
  cro_name: string;
  cro_email: string;
  stage: string;
  quoted_amount: number | null;
  quoted_currency: string | null;
  quoted_timeline: string | null;
  quote_notes: string | null;
  quote_valid_until: string | null;
}

interface Brief {
  id: string;
  title: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  rfp_sent:       'RFP sent',
  quote_received: 'Quote received',
  awarded:        'Awarded',
  closed:         'Closed',
};

function fmtAmount(amount: number | null, currency: string | null) {
  if (!amount) return null;
  return `${currency ?? 'USD'} ${amount.toLocaleString()}`;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-green-100 text-green-800 border-green-200'
    : score >= 50 ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-red-100 text-red-800 border-red-200';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {score}/100
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const params  = useParams();
  const briefId = params.id as string;

  const [brief, setBrief]               = useState<Brief | null>(null);
  const [engagements, setEngagements]   = useState<Engagement[]>([]);
  const [loading, setLoading]           = useState(true);
  const [ranking, setRanking]           = useState<CompareResult | null>(null);
  const [rankLoading, setRankLoading]   = useState(false);
  const [rankError, setRankError]       = useState('');
  const [awarding, setAwarding]         = useState<string | null>(null);
  const [awardError, setAwardError]     = useState('');
  const [awarded, setAwarded]           = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: briefData }, { data: engData }] = await Promise.all([
        supabase
          .from('rfp_internal_briefs')
          .select('id, title')
          .eq('id', briefId)
          .single(),
        supabase
          .from('cro_engagements')
          .select('id, cro_name, cro_email, stage, quoted_amount, quoted_currency, quoted_timeline, quote_notes, quote_valid_until')
          .eq('brief_id', briefId)
          .in('stage', ['rfp_sent', 'quote_received', 'awarded', 'closed'])
          .order('cro_name'),
      ]);
      if (briefData) setBrief(briefData as Brief);
      if (engData)   {
        setEngagements(engData as Engagement[]);
        const a = (engData as Engagement[]).find(e => e.stage === 'awarded');
        if (a) setAwarded(a.id);
      }
      setLoading(false);
    }
    load();
  }, [briefId]);

  const runRanking = useCallback(async () => {
    if (engagements.length < 2) return;
    setRankLoading(true);
    setRankError('');
    try {
      const bids = engagements.map(e => ({
        engagement_id:   e.id,
        cro_name:        e.cro_name,
        stage:           e.stage,
        quoted_amount:   e.quoted_amount,
        quoted_currency: e.quoted_currency,
        quoted_timeline: e.quoted_timeline,
        quote_notes:     e.quote_notes,
      }));
      const res = await fetch(`/api/biotech/briefs/${briefId}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Ranking failed');
      setRanking(json as CompareResult);
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'AI ranking failed — please try again');
    } finally {
      setRankLoading(false);
    }
  }, [engagements, briefId]);

  async function handleAward(engagementId: string) {
    setAwarding(engagementId);
    setAwardError('');
    try {
      const res = await fetch(`/api/biotech/engagements/${engagementId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'awarded' }),
      });
      if (!res.ok) throw new Error('Award failed');
      setAwarded(engagementId);
      setEngagements(prev => prev.map(e => ({
        ...e,
        stage: e.id === engagementId ? 'awarded' : e.stage,
      })));
    } catch {
      setAwardError('Failed to award — please retry');
    } finally {
      setAwarding(null);
    }
  }

  // ── Loading / empty states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center">
        <p className="text-gray-500">Brief not found.</p>
        <a href="/biotech/briefs" className="mt-4 inline-block text-sm text-blue-600 hover:underline">← Back to briefs</a>
      </div>
    );
  }

  const activeEngagements = engagements.filter(e => !['closed'].includes(e.stage));

  if (activeEngagements.length < 2) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center space-y-4">
        <p className="text-2xl font-semibold text-gray-900">Not enough bids yet</p>
        <p className="text-gray-500 text-sm">
          You need at least 2 CROs at RFP sent or quote received stage to compare.
        </p>
        <a href={`/biotech/briefs/${briefId}`}
          className="inline-block rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          ← Back to brief
        </a>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  const rankedMap = new Map<string, RankedBid>(
    ranking?.ranked.map(r => [r.engagement_id, r]) ?? []
  );
  const sortedEngagements = ranking
    ? [...engagements].sort((a, b) => {
        const ra = rankedMap.get(a.id)?.rank ?? 999;
        const rb = rankedMap.get(b.id)?.rank ?? 999;
        return ra - rb;
      })
    : engagements;

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 space-y-8">

      {/* Header */}
      <header>
        <nav className="mb-1.5 text-xs text-gray-500">
          <a href="/biotech/briefs" className="hover:text-gray-700 transition-colors">Briefs</a>
          <span className="mx-1.5">/</span>
          <a href={`/biotech/briefs/${briefId}`} className="hover:text-gray-700 transition-colors">{brief.title}</a>
          <span className="mx-1.5">/</span>
          <span className="text-gray-700">Compare bids</span>
        </nav>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Compare bids</h1>
            <p className="text-sm text-gray-500 mt-1">{engagements.length} CROs in contention</p>
          </div>
          <button
            onClick={runRanking}
            disabled={rankLoading}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
            {rankLoading ? <><Spinner /> Ranking…</> : ranking ? '↺ Re-rank with AI' : '✦ Rank with AI'}
          </button>
        </div>
      </header>

      {rankError && (
        <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-4 py-3">⚠ {rankError}</p>
      )}

      {/* AI Summary */}
      {ranking && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-900/20 px-5 py-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-700 dark:text-blue-300">AI Summary</p>
          <p className="text-sm text-blue-900 dark:text-blue-100">{ranking.summary}</p>
          {ranking.suggested_winner_id && (
            <p className="text-sm text-blue-800 dark:text-blue-200 pt-1 border-t border-blue-200 dark:border-blue-700/40">
              <span className="font-semibold">Recommended: </span>
              {engagements.find(e => e.id === ranking.suggested_winner_id)?.cro_name ?? 'Unknown'}
              {' — '}{ranking.suggested_winner_rationale}
            </p>
          )}
        </div>
      )}

      {/* Award error */}
      {awardError && (
        <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-4 py-3">⚠ {awardError}</p>
      )}

      {/* Bid cards */}
      <div className="space-y-4">
        {sortedEngagements.map((eng, i) => {
          const ranked     = rankedMap.get(eng.id);
          const isAwarded  = eng.stage === 'awarded' || awarded === eng.id;
          const isSuggested = ranking?.suggested_winner_id === eng.id;
          const rankNum    = ranked?.rank ?? null;

          return (
            <div key={eng.id}
              className={`rounded-xl border bg-white shadow-sm overflow-hidden dark:bg-gray-900
                ${isAwarded ? 'border-green-300 dark:border-green-700/50'
                  : isSuggested ? 'border-blue-300 dark:border-blue-700/50'
                  : 'border-gray-200 dark:border-gray-700/50'}`}>

              {/* Card header */}
              <div className={`px-5 py-3 flex items-center justify-between gap-3
                ${isAwarded ? 'bg-green-50 dark:bg-green-900/20'
                  : isSuggested ? 'bg-blue-50 dark:bg-blue-900/20'
                  : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {rankNum !== null && (
                    <span className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold
                      ${rankNum === 1 ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {rankNum}
                    </span>
                  )}
                  {!rankNum && (
                    <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-400 text-xs font-medium dark:bg-gray-800">
                      {i + 1}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{eng.cro_name}</span>
                      {isAwarded && (
                        <span className="rounded-full bg-green-100 border border-green-200 text-green-700 text-[10px] font-semibold px-2 py-0.5 dark:bg-green-900/30 dark:border-green-700/40 dark:text-green-300">
                          🏆 Awarded
                        </span>
                      )}
                      {isSuggested && !isAwarded && (
                        <span className="rounded-full bg-blue-100 border border-blue-200 text-blue-700 text-[10px] font-semibold px-2 py-0.5 dark:bg-blue-900/30 dark:border-blue-700/40 dark:text-blue-300">
                          ✦ AI pick
                        </span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400">{STAGE_LABEL[eng.stage] ?? eng.stage}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {ranked && <ScoreBadge score={ranked.score} />}
                  {!isAwarded && (
                    <button
                      onClick={() => handleAward(eng.id)}
                      disabled={awarding === eng.id || !!awarded}
                      className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-green-700/50 dark:bg-green-900/20 dark:text-green-300">
                      {awarding === eng.id ? 'Awarding…' : '🏆 Award this CRO'}
                    </button>
                  )}
                </div>
              </div>

              {/* Card body */}
              <div className="px-5 py-4 space-y-4">

                {/* Quote details */}
                <div className="flex flex-wrap gap-4 text-sm">
                  {fmtAmount(eng.quoted_amount, eng.quoted_currency) ? (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Price</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {fmtAmount(eng.quoted_amount, eng.quoted_currency)}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Price</p>
                      <p className="text-gray-400 dark:text-gray-500 text-sm italic">Not yet quoted</p>
                    </div>
                  )}
                  {eng.quoted_timeline && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Timeline</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{eng.quoted_timeline}</p>
                    </div>
                  )}
                  {eng.quote_valid_until && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Valid until</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{eng.quote_valid_until}</p>
                    </div>
                  )}
                </div>

                {eng.quote_notes && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 border-l-2 border-gray-200 dark:border-gray-700 pl-3 italic">
                    {eng.quote_notes}
                  </p>
                )}

                {/* AI ranking detail */}
                {ranked && (
                  <div className="rounded-lg border border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">&ldquo;{ranked.headline}&rdquo;</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ranked.strengths.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-green-700 dark:text-green-400">Strengths</p>
                          <ul className="space-y-0.5">
                            {ranked.strengths.map((s, j) => (
                              <li key={j} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5">
                                <span className="text-green-500 shrink-0">✓</span>{s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {ranked.risks.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">Risks</p>
                          <ul className="space-y-0.5">
                            {ranked.risks.map((r, j) => (
                              <li key={j} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5">
                                <span className="text-amber-500 shrink-0">⚠</span>{r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
                      {ranked.recommendation}
                    </p>
                  </div>
                )}

                {/* Link to engagement */}
                <div className="flex justify-end">
                  <a href={`/biotech/engagements/${eng.id}`}
                    className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 transition-colors">
                    View engagement →
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
