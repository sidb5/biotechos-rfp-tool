'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import { SECTION_KEYS, type SectionKey } from '@biotech/prompts/rfp';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Brief {
  id:    string;
  title: string | null;
}

interface RfpDoc {
  id:                 string;
  rfp_id:             string;
  completeness_score: number;
  updated_at:         string;
  [key: string]:      unknown;
}

interface Engagement {
  id:        string;
  cro_name:  string;
  cro_email: string;
  stage:     string;
}

type SendStatus = 'idle' | 'sent' | 'failed';

// All stages where it makes sense to send (or resend) an RFP.
// Excludes only enquiry_draft (never contacted) and enquiry_sent (too early).
// rfp_sent is intentionally included so users can resend if needed.
const ELIGIBLE_STAGES = new Set([
  'response_received',
  'followup_draft',
  'followup_sent',
  'meeting_scheduled',
  'meeting_done',
  'rfp_draft',
  'rfp_sent',
  'awarded',
]);

const STAGE_LABELS: Record<string, string> = {
  response_received:  'Responded',
  followup_draft:     'Followup draft',
  followup_sent:      'Followup sent',
  meeting_scheduled:  'Meeting scheduled',
  meeting_done:       'Meeting done ✓',
  rfp_draft:          'RFP draft',
  rfp_sent:           'RFP already sent',
  awarded:            'Awarded',
};

const STAGE_COLORS: Record<string, string> = {
  meeting_done:       'bg-purple-900/30 text-purple-300 border-purple-700/40',
  rfp_draft:          'bg-blue-900/30 text-blue-300 border-blue-700/40',
  rfp_sent:           'bg-green-900/30 text-green-300 border-green-700/40',
  awarded:            'bg-green-900/50 text-green-200 border-green-700/60',
  meeting_scheduled:  'bg-indigo-900/30 text-indigo-300 border-indigo-700/40',
  followup_sent:      'bg-amber-900/30 text-amber-300 border-amber-700/40',
  default:            'bg-gray-800/60 text-gray-400 border-gray-700',
};

function stageColor(stage: string) {
  return STAGE_COLORS[stage] ?? STAGE_COLORS.default;
}

function completenessColor(score: number) {
  if (score >= 80) return { ring: '#22c55e', text: 'text-green-400', label: 'Ready to send', bg: 'border-green-700/40 bg-green-900/20' };
  if (score >= 50) return { ring: '#f59e0b', text: 'text-amber-400', label: 'Gaps remain',   bg: 'border-amber-700/40 bg-amber-900/20' };
  return             { ring: '#ef4444', text: 'text-red-400',   label: 'Incomplete',   bg: 'border-red-700/40 bg-red-900/20' };
}

function countSections(rfpDoc: RfpDoc): { filled: number; withGaps: number } {
  let filled = 0; let withGaps = 0;
  for (const key of SECTION_KEYS) {
    const t = (rfpDoc[key as SectionKey] as string | null) ?? '';
    if (t.length > 50) {
      filled++;
      if (t.includes('[TO BE SPECIFIED]')) withGaps++;
    }
  }
  return { filled, withGaps };
}

// ── Confirmation Modal ────────────────────────────────────────────────────────

function ConfirmModal({
  rfpId,
  cros,
  score,
  onConfirm,
  onCancel,
  sending,
}: {
  rfpId:     string;
  cros:      Engagement[];
  score:     number;
  onConfirm: () => void;
  onCancel:  () => void;
  sending:   boolean;
}) {
  const { label: scoreLabel, text: scoreText } = completenessColor(score);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl p-7">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 text-xl">
            📤
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Send {rfpId}?</h2>
            <p className="text-sm text-gray-500 mt-0.5">This will email the full RFP to the selected CROs.</p>
          </div>
        </div>

        {/* Recipients */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4 mb-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Recipients ({cros.length})
          </p>
          {cros.map(c => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-200 font-medium">{c.cro_name}</span>
              <span className="text-gray-500 text-xs">{c.cro_email}</span>
            </div>
          ))}
        </div>

        {/* Score warning */}
        {score < 80 && (
          <div className={`rounded-xl border px-4 py-3 mb-5 ${completenessColor(score).bg}`}>
            <p className={`text-sm font-medium ${scoreText}`}>
              {score < 60 ? '⚠ Completeness score is low' : 'ℹ Completeness score below 80'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {scoreLabel}. The RFP contains [TO BE SPECIFIED] placeholders.
              CROs will see these gaps.{score < 60 ? ' Consider returning to the editor first.' : ''}
            </p>
          </div>
        )}

        {/* IP warning */}
        <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 px-4 py-3 mb-5">
          <p className="text-xs text-indigo-300 font-medium">🔒 This RFP discloses full study scope</p>
          <p className="text-xs text-indigo-700 mt-1">
            Unlike early enquiries, this document contains your full technical requirements.
            Only send to CROs you have screened and trust under NDA.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={sending}
            className="flex-1 rounded-xl border border-gray-700 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={sending}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending…
              </>
            ) : (
              'Send RFP'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RfpSendPage() {
  const params  = useParams();
  const router  = useRouter();
  const briefId = params.id as string;

  const [brief, setBrief]               = useState<Brief | null>(null);
  const [rfpDoc, setRfpDoc]             = useState<RfpDoc | null>(null);
  const [engagements, setEngagements]   = useState<Engagement[]>([]);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [sending, setSending]           = useState(false);
  const [sendResults, setSendResults]   = useState<Record<string, SendStatus>>({});
  const [done, setDone]                 = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const [{ data: briefData }, { data: rfpData }, { data: engsData }] = await Promise.all([
      supabase.from('rfp_internal_briefs').select('id, title').eq('id', briefId).single(),
      supabase.from('rfp_documents').select('*').eq('brief_id', briefId).maybeSingle(),
      supabase.from('cro_engagements').select('id, cro_name, cro_email, stage')
        .eq('brief_id', briefId).eq('user_id', user.id).neq('stage', 'enquiry_draft'),
    ]);

    if (briefData) setBrief(briefData as Brief);
    if (rfpData)   setRfpDoc(rfpData as RfpDoc);

    const eligible = (engsData ?? []).filter(e => ELIGIBLE_STAGES.has(e.stage));
    setEngagements(eligible as Engagement[]);

    // Default: pre-select meeting_done and rfp_draft CROs (most likely targets).
    // rfp_sent CROs are NOT pre-selected — user must explicitly opt in to resend.
    const defaultSelected = new Set(
      eligible.filter(e => e.stage === 'meeting_done' || e.stage === 'rfp_draft').map(e => e.id)
    );
    setSelected(defaultSelected);

    setLoading(false);
  }, [briefId, router]);

  useEffect(() => { void load(); }, [load]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll()   { setSelected(new Set(engagements.map(e => e.id))); }
  function selectNone()  { setSelected(new Set()); }

  async function handleSend() {
    if (selected.size === 0) return;
    setSending(true);

    try {
      const res  = await fetch(`/api/biotech/briefs/${briefId}/rfp/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ engagement_ids: Array.from(selected) }),
      });

      const json = await res.json() as {
        results?: { engagement_id: string; cro_name: string; sent: boolean; error?: string }[];
        error?:   string;
      };

      if (!res.ok && !json.results) {
        // Hard failure — mark all selected as failed
        const failed: Record<string, SendStatus> = {};
        Array.from(selected).forEach(id => { failed[id] = 'failed'; });
        setSendResults(failed);
      } else {
        const map: Record<string, SendStatus> = {};
        for (const r of json.results ?? []) {
          map[r.engagement_id] = r.sent ? 'sent' : 'failed';
        }
        setSendResults(map);
      }
      setDone(true);
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

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

  if (!rfpDoc) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">📄</p>
          <h1 className="text-lg font-semibold text-white mb-2">No RFP generated yet</h1>
          <p className="text-sm text-gray-500 mb-6">Generate the RFP document before sending.</p>
          <a
            href={`/biotech/briefs/${briefId}/rfp`}
            className="inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            ← Go to RFP Editor
          </a>
        </div>
      </div>
    );
  }

  const score  = rfpDoc.completeness_score ?? 0;
  const { label: scoreLabel, text: scoreText, bg: scoreBg } = completenessColor(score);
  const { filled, withGaps } = countSections(rfpDoc);
  const selectedEngagements  = engagements.filter(e => selected.has(e.id));

  return (
    <>
      {showConfirm && (
        <ConfirmModal
          rfpId={rfpDoc.rfp_id}
          cros={selectedEngagements}
          score={score}
          onConfirm={handleSend}
          onCancel={() => setShowConfirm(false)}
          sending={sending}
        />
      )}

      <div className="min-h-screen bg-gray-950 text-gray-100">
        <div className="mx-auto max-w-3xl px-5 py-8 space-y-6">

          {/* ── Breadcrumb + Header ── */}
          <header>
            <nav className="mb-2 text-xs text-gray-600">
              <a href="/biotech/dashboard" className="hover:text-gray-400 transition-colors">Dashboard</a>
              <span className="mx-1.5">/</span>
              <a href="/biotech/briefs" className="hover:text-gray-400 transition-colors">Briefs</a>
              <span className="mx-1.5">/</span>
              <a href={`/biotech/briefs/${briefId}`} className="hover:text-gray-400 transition-colors">
                {brief?.title ?? 'Brief'}
              </a>
              <span className="mx-1.5">/</span>
              <a href={`/biotech/briefs/${briefId}/rfp`} className="hover:text-gray-400 transition-colors">RFP</a>
              <span className="mx-1.5">/</span>
              <span className="text-gray-400">Send</span>
            </nav>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-semibold text-white">Send RFP</h1>
                <p className="mt-1 text-sm text-gray-500">
                  {rfpDoc.rfp_id} · {brief?.title ?? 'Study brief'}
                </p>
              </div>
              <a
                href={`/biotech/briefs/${briefId}/rfp/print`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-1.5 rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors"
              >
                🖨 Preview / Print
              </a>
            </div>
          </header>

          {/* ── RFP summary card ── */}
          <div className={`rounded-xl border p-5 ${scoreBg}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
                  Document readiness
                </p>
                <p className={`text-3xl font-bold ${scoreText}`}>{score}<span className="text-base font-normal text-gray-500">/100</span></p>
                <p className={`text-sm font-medium mt-1 ${scoreText}`}>{scoreLabel}</p>
              </div>
              <div className="text-right text-sm space-y-1">
                <p className="text-gray-400"><span className="text-white font-semibold">{filled}</span> / {SECTION_KEYS.length} sections filled</p>
                {withGaps > 0 && (
                  <p className="text-amber-400">{withGaps} section{withGaps !== 1 ? 's' : ''} have [TO BE SPECIFIED] gaps</p>
                )}
                <p className="text-gray-600 text-xs">
                  Last updated {new Date(rfpDoc.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>
            {score < 60 && (
              <div className="mt-4 rounded-lg border border-red-800/40 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                ⚠ Completeness score below 60 — strongly consider resolving gaps before sending.{' '}
                <a href={`/biotech/briefs/${briefId}/rfp`} className="underline hover:text-red-300">Return to editor →</a>
              </div>
            )}
          </div>

          {/* ── CRO selection ── */}
          <div className="rounded-xl border border-gray-700 bg-gray-900/40 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/60">
              <div>
                <h2 className="text-sm font-semibold text-white">Select Recipients</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {engagements.length} eligible CRO{engagements.length !== 1 ? 's' : ''} ·{' '}
                  {selected.size} selected
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <button onClick={selectAll}  className="text-blue-400 hover:text-blue-300 transition-colors">All</button>
                <span className="text-gray-700">·</span>
                <button onClick={selectNone} className="text-gray-500 hover:text-gray-300 transition-colors">None</button>
              </div>
            </div>

            {engagements.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-gray-600 text-sm">No eligible CROs found for this brief.</p>
                <p className="text-gray-700 text-xs mt-1">
                  CROs must have at least responded to your enquiry before receiving an RFP.
                </p>
                <a
                  href={`/biotech/briefs/${briefId}`}
                  className="mt-4 inline-block text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  ← Go to brief to manage CROs
                </a>
              </div>
            ) : (
              <ul className="divide-y divide-gray-800/60">
                {engagements.map(eng => {
                  const sendStatus = sendResults[eng.id];
                  return (
                    <li key={eng.id} className="flex items-center gap-4 px-5 py-4">
                      {/* Checkbox */}
                      {!done ? (
                        <button
                          onClick={() => toggleSelect(eng.id)}
                          className={`h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                            selected.has(eng.id)
                              ? 'border-blue-500 bg-blue-600'
                              : 'border-gray-600 bg-transparent'
                          }`}
                        >
                          {selected.has(eng.id) && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 10">
                              <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      ) : (
                        <div className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-xs ${
                          sendStatus === 'sent'   ? 'bg-green-600 text-white' :
                          sendStatus === 'failed' ? 'bg-red-600 text-white'   :
                                                    'bg-gray-700 text-gray-500'
                        }`}>
                          {sendStatus === 'sent' ? '✓' : sendStatus === 'failed' ? '✗' : '—'}
                        </div>
                      )}

                      {/* CRO info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{eng.cro_name}</p>
                        <p className="text-xs text-gray-500 truncate">{eng.cro_email}</p>
                      </div>

                      {/* Stage badge + resend notice */}
                      <div className="flex flex-col items-end gap-1">
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${stageColor(eng.stage)}`}>
                          {STAGE_LABELS[eng.stage] ?? eng.stage}
                        </span>
                        {(eng.stage === 'rfp_sent' || eng.stage === 'awarded') && (
                          <span className="text-[10px] text-gray-600">ℹ resend</span>
                        )}
                      </div>

                      {/* Send status */}
                      {sendStatus && (
                        <span className={`shrink-0 text-xs font-medium ${
                          sendStatus === 'sent'   ? 'text-green-400' :
                          sendStatus === 'failed' ? 'text-red-400'   :
                                                    'text-gray-500'
                        }`}>
                          {sendStatus === 'sent' ? '✓ Sent' : '✗ Failed'}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── Actions ── */}
          {!done ? (
            <div className="flex items-center justify-between gap-4">
              <a
                href={`/biotech/briefs/${briefId}/rfp`}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                ← Back to editor
              </a>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={selected.size === 0}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
              >
                Send to {selected.size > 0 ? `${selected.size} CRO${selected.size !== 1 ? 's' : ''}` : 'selected CROs'} →
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-green-700/40 bg-green-950/20 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="text-green-400 text-xl leading-none mt-0.5">✓</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-300">RFP send complete</p>
                  <p className="text-xs text-green-700 mt-1">
                    {Object.values(sendResults).filter(s => s === 'sent').length} sent ·{' '}
                    {Object.values(sendResults).filter(s => s === 'failed').length} failed
                  </p>
                </div>
                <a
                  href={`/biotech/engagements`}
                  className="shrink-0 text-xs text-green-400 hover:text-green-300 transition-colors underline"
                >
                  View engagements →
                </a>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
