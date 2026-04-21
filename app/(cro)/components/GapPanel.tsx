'use client';

import { useState, useEffect } from 'react';
import type { Gap } from '@cro/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GapPanelProps {
  proposalId: string;
  onReadyToGenerate: (gaps: Gap[]) => void;
}

interface SMEFormResult {
  form_id: string;
  token: string;
  access_code: string;
  open_until: string;
  cro_name: string;
}

interface FormQuestion {
  id: string;
  gap_id: string;
  question_text: string;
  answer: string | null;
  answered_by_name: string | null;
  answered_at: string | null;
}

interface FormStatus {
  id: string;
  token: string;
  status: string;
  access_code: string;
  open_until: string;
  sme_form_questions: FormQuestion[];
}

interface Recipient {
  id: number;
  name: string;
}

type PanelState = 'detecting' | 'found' | 'assigning' | 'none' | 'error' | 'sending' | 'sent';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Share Modal ───────────────────────────────────────────────────────────────

function ShareModal({
  formResult,
  recipientName,
  totalForms,
  formIndex,
  onNext,
  onClose,
}: {
  formResult: SMEFormResult;
  recipientName: string;
  totalForms: number;
  formIndex: number;
  onNext: () => void;
  onClose: () => void;
}) {
  const formUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/sme/${formResult.token}`;
  const [copied, setCopied] = useState(false);
  const expiryDate = formatDate(formResult.open_until);
  const isLast = formIndex === totalForms - 1;

  const suggestedMessage =
    `Hi${recipientName ? ` ${recipientName}` : ''}, could you fill in a few quick questions for our proposal?\n` +
    `${formUrl}\n\n` +
    `No login needed — takes about 5 min.\n` +
    `After ${expiryDate} you'll need this code: ${formResult.access_code}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  function openEmail() {
    const subject = encodeURIComponent('Quick questions for our proposal');
    const body = encodeURIComponent(suggestedMessage);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-gray-900">
            Form {formIndex + 1} of {totalForms}{recipientName ? ` — ${recipientName}` : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {totalForms > 1 && (
          <p className="text-xs text-gray-400 mb-4">
            {isLast ? 'Last form.' : `Share this link, then we\'ll show the next one.`}
          </p>
        )}

        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Form link</p>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="flex-1 text-sm text-gray-800 font-mono truncate">{formUrl}</span>
            <button
              onClick={copyUrl}
              className="shrink-0 px-2.5 py-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="mb-5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-xs font-semibold text-orange-700 mb-0.5">Access code</p>
          <p className="text-xl font-mono font-bold tracking-widest text-orange-900">{formResult.access_code}</p>
          <p className="text-xs text-orange-600 mt-1">Required after {expiryDate}. Share alongside the link.</p>
        </div>

        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Suggested message</p>
          <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg border border-gray-200 p-3 whitespace-pre-wrap font-sans leading-relaxed">
            {suggestedMessage}
          </pre>
        </div>

        <div className="flex gap-2">
          <button
            onClick={openEmail}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Open in email client
          </button>
          <button
            onClick={isLast ? onClose : onNext}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {isLast ? 'Done' : `Next form →`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function GapPanel({ proposalId, onReadyToGenerate }: GapPanelProps) {
  const [state, setState] = useState<PanelState>('detecting');
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [hasKnowledgeRepo, setHasKnowledgeRepo] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeForms, setActiveForms] = useState<FormStatus[]>([]);
  const [checkingAnswers, setCheckingAnswers] = useState(false);

  // Assignment state
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: 1, name: '' },
    { id: 2, name: '' },
  ]);
  // gap_id → recipient id (default 1)
  const [assignments, setAssignments] = useState<Record<string, number>>({});

  // Share modal queue: array of { formResult, recipientName }
  const [shareQueue, setShareQueue] = useState<{ formResult: SMEFormResult; recipientName: string }[]>([]);
  const [shareQueueIndex, setShareQueueIndex] = useState(0);

  useEffect(() => {
    checkExistingForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  async function checkExistingForm() {
    try {
      const res = await fetch(`/api/sme-forms/status?proposal_id=${proposalId}`);
      if (res.ok) {
        const data = await res.json();
        const forms: FormStatus[] = data.forms ?? [];
        const cachedGaps: Gap[] | null = data.detected_gaps ?? null;

        if (cachedGaps && cachedGaps.length > 0) {
          if (forms.length > 0) {
            setActiveForms(forms);
            setGaps(applyAnswers(cachedGaps, forms));
            setState('sent');
          } else {
            setGaps(cachedGaps);
            setState('found');
          }
          return;
        }

        if (forms.length > 0) {
          setActiveForms(forms);
          runDetection(forms);
          return;
        }
      }
    } catch { /* fall through */ }
    runDetection([]);
  }

  function applyAnswers(gapList: Gap[], forms: FormStatus[]): Gap[] {
    const answeredGapIds = new Set(
      forms.flatMap(f => f.sme_form_questions.filter(q => q.answer).map(q => q.gap_id))
    );
    return gapList.map(g =>
      answeredGapIds.has(g.gap_id) ? { ...g, status: 'answered' as const } : g
    );
  }

  async function runDetection(existingForms: FormStatus[]) {
    setState('detecting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/gap/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Gap analysis failed');
        setState('error');
        return;
      }
      const detectedGaps: Gap[] = data.gaps ?? [];
      setHasKnowledgeRepo(data.has_knowledge_repo ?? false);

      if (existingForms.length > 0) {
        setGaps(applyAnswers(detectedGaps, existingForms));
        setState(detectedGaps.length === 0 ? 'none' : 'sent');
      } else {
        setGaps(detectedGaps);
        setState(detectedGaps.length === 0 ? 'none' : 'found');
      }
    } catch {
      setErrorMsg('Network error — could not run gap analysis');
      setState('error');
    }
  }

  function enterAssigning() {
    // Default all pending gaps to recipient 1
    const pending = gaps.filter(g => g.status === 'pending');
    const defaults: Record<string, number> = {};
    for (const g of pending) defaults[g.gap_id] = 1;
    setAssignments(defaults);
    setState('assigning');
  }

  async function handleSendForms() {
    const pending = gaps.filter(g => g.status === 'pending');
    if (pending.length === 0) return;

    // Group gaps by recipient
    const activeRecipients = recipients.filter(r =>
      pending.some(g => (assignments[g.gap_id] ?? 1) === r.id)
    );
    if (activeRecipients.length === 0) return;

    setState('sending');
    const newForms: FormStatus[] = [];
    const queue: { formResult: SMEFormResult; recipientName: string }[] = [];

    for (const recipient of activeRecipients) {
      const recipientGaps = pending.filter(g => (assignments[g.gap_id] ?? 1) === recipient.id);
      if (recipientGaps.length === 0) continue;

      try {
        const res = await fetch('/api/sme-forms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposal_id: proposalId, gaps: recipientGaps }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error ?? 'Failed to create form');
          setState('found');
          return;
        }
        const result = data as SMEFormResult;
        queue.push({ formResult: result, recipientName: recipient.name });
        newForms.push({
          id: result.form_id,
          token: result.token,
          status: 'pending',
          access_code: result.access_code,
          open_until: result.open_until,
          sme_form_questions: recipientGaps.map(g => ({
            id: '',
            gap_id: g.gap_id,
            question_text: g.question_for_sme,
            answer: null,
            answered_by_name: null,
            answered_at: null,
          })),
        });
      } catch {
        setErrorMsg('Network error — could not create form');
        setState('found');
        return;
      }
    }

    setActiveForms(newForms);
    setShareQueue(queue);
    setShareQueueIndex(0);
    setState('sent');
  }

  async function handleCheckAnswers() {
    setCheckingAnswers(true);
    try {
      const res = await fetch(`/api/sme-forms/status?proposal_id=${proposalId}`);
      if (!res.ok) return;
      const data = await res.json();
      const forms: FormStatus[] = data.forms ?? [];
      if (forms.length > 0) {
        setActiveForms(forms);
        setGaps(prev => applyAnswers(prev, forms));
      }
    } finally {
      setCheckingAnswers(false);
    }
  }

  // Build answered lookup from all forms
  const answeredByGapId: Record<string, FormQuestion> = {};
  for (const form of activeForms) {
    for (const q of form.sme_form_questions) {
      if (q.answer) answeredByGapId[q.gap_id] = q;
    }
  }

  const displayGaps = gaps.map(g =>
    answeredByGapId[g.gap_id] ? { ...g, status: 'answered' as const } : g
  );

  const pendingCount  = displayGaps.filter(g => g.status === 'pending').length;
  const answeredCount = displayGaps.filter(g => g.status === 'answered').length;
  const allResolved   = pendingCount === 0 && displayGaps.length > 0;

  // ── Detecting ────────────────────────────────────────────────────────────────
  if (state === 'detecting') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex gap-0.5">
            {[0, 1, 2].map(d => (
              <span key={d} className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
            ))}
          </div>
          <span className="text-sm font-medium text-gray-700">Checking for data gaps…</span>
        </div>
        <p className="text-xs text-gray-400">
          Cross-referencing RFP requirements against your profile and knowledge repository
        </p>
      </div>
    );
  }

  // ── Sending ──────────────────────────────────────────────────────────────────
  if (state === 'sending') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5">
            {[0, 1, 2].map(d => (
              <span key={d} className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
            ))}
          </div>
          <span className="text-sm font-medium text-gray-700">Creating SME forms…</span>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-medium text-amber-900 mb-1">Gap analysis failed</p>
        <p className="text-xs text-amber-700 mb-3">{errorMsg}</p>
        <div className="flex gap-2">
          <button
            onClick={() => runDetection([])}
            className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
          >
            Retry analysis
          </button>
          <button
            onClick={() => onReadyToGenerate([])}
            className="px-3 py-1.5 text-xs font-semibold border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
          >
            Skip and draft anyway
          </button>
        </div>
      </div>
    );
  }

  // ── No gaps ──────────────────────────────────────────────────────────────────
  if (state === 'none') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-semibold text-green-900">No gaps found — ready to draft</p>
        </div>
        {!hasKnowledgeRepo && (
          <p className="text-xs text-green-700 mb-3">
            Add past proposals to{' '}
            <a href="/dashboard/knowledge-repo" className="underline hover:text-green-900">Knowledge Repo</a>
            {' '}to improve gap accuracy →
          </p>
        )}
        <button
          onClick={() => onReadyToGenerate([])}
          className="mt-2 px-4 py-2 text-sm font-bold bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors"
        >
          ✦ Generate full proposal →
        </button>
      </div>
    );
  }

  // ── Assigning ────────────────────────────────────────────────────────────────
  if (state === 'assigning') {
    const pendingGaps = gaps.filter(g => g.status === 'pending');
    const activeRecipientIds = new Set(recipients.map(r => r.id));

    return (
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-orange-900 mb-0.5">Assign questions to recipients</p>
          <p className="text-xs text-gray-500">Each recipient gets their own private link. You can send to up to 3 people.</p>
        </div>

        {/* Recipient slots */}
        <div className="flex flex-col gap-2">
          {recipients.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-orange-200 text-orange-800 text-xs font-bold flex items-center justify-center">
                {r.id}
              </span>
              <input
                type="text"
                placeholder={`Recipient ${r.id} name (e.g. Dr. Smith)`}
                value={r.name}
                onChange={e => setRecipients(prev => prev.map(x => x.id === r.id ? { ...x, name: e.target.value } : x))}
                className="flex-1 text-sm border border-orange-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
              {recipients.length > 1 && i === recipients.length - 1 && (
                <button
                  onClick={() => {
                    const removed = r.id;
                    setRecipients(prev => prev.filter(x => x.id !== removed));
                    setAssignments(prev => {
                      const next = { ...prev };
                      for (const key of Object.keys(next)) {
                        if (next[key] === removed) next[key] = 1;
                      }
                      return next;
                    });
                  }}
                  className="text-gray-300 hover:text-red-400 text-lg leading-none"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {recipients.length < 3 && (
            <button
              onClick={() => {
                const nextId = Math.max(...recipients.map(r => r.id)) + 1;
                setRecipients(prev => [...prev, { id: nextId, name: '' }]);
              }}
              className="text-xs text-orange-600 hover:text-orange-800 underline text-left"
            >
              + Add a third recipient
            </button>
          )}
        </div>

        {/* Question assignment list */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Questions ({pendingGaps.length})</p>
          {pendingGaps.map(gap => (
            <div key={gap.gap_id} className="rounded-lg border border-orange-200 bg-white px-3 py-2.5 flex items-start gap-3">
              {/* Recipient toggle */}
              <div className="flex gap-1 shrink-0 mt-0.5">
                {recipients.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setAssignments(prev => ({ ...prev, [gap.gap_id]: r.id }))}
                    className={`w-5 h-5 rounded-full text-[10px] font-bold transition-colors ${
                      (assignments[gap.gap_id] ?? 1) === r.id
                        ? 'bg-orange-500 text-white'
                        : 'bg-orange-100 text-orange-400 hover:bg-orange-200'
                    }`}
                  >
                    {r.id}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-800 leading-snug">{gap.question_for_sme}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{gap.suggested_recipient_role}</p>
              </div>
            </div>
          ))}
        </div>

        {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSendForms}
            className="w-full py-2.5 text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
          >
            Send {recipients.filter(r => activeRecipientIds.has(r.id)).length > 1
              ? `${recipients.length} forms`
              : 'form'} →
          </button>
          <button
            onClick={() => setState('found')}
            className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 underline"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Gaps found / Sent ────────────────────────────────────────────────────────
  const currentShare = shareQueue[shareQueueIndex] ?? null;

  return (
    <>
      {/* Share modal queue */}
      {currentShare && (
        <ShareModal
          formResult={currentShare.formResult}
          recipientName={currentShare.recipientName}
          totalForms={shareQueue.length}
          formIndex={shareQueueIndex}
          onNext={() => setShareQueueIndex(i => i + 1)}
          onClose={() => setShareQueue([])}
        />
      )}

      <div className={`rounded-xl border p-5 flex flex-col gap-4 ${
        allResolved ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'
      }`}>
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            {allResolved ? (
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-orange-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <p className={`text-sm font-semibold ${allResolved ? 'text-green-900' : 'text-orange-900'}`}>
              {allResolved
                ? `All ${displayGaps.length} gaps resolved — ready to draft`
                : state === 'sent' && answeredCount > 0
                ? `${answeredCount} of ${displayGaps.length} gaps answered`
                : `${pendingCount} gap${pendingCount > 1 ? 's' : ''} detected`}
            </p>
          </div>
          {state === 'sent' && pendingCount > 0 && (
            <p className="text-xs text-orange-600">{pendingCount} still pending SME response</p>
          )}
          {activeForms.length > 1 && state === 'sent' && (
            <p className="text-xs text-gray-500 mt-0.5">{activeForms.length} forms sent to different recipients</p>
          )}
          <button
            onClick={() => runDetection(activeForms)}
            className="text-[11px] text-gray-400 hover:text-gray-600 underline mt-1"
          >
            Regenerate analysis
          </button>
          {!hasKnowledgeRepo && state !== 'sent' && (
            <p className="text-xs text-orange-600 mt-1">
              Add past proposals to{' '}
              <a href="/dashboard/knowledge-repo" className="underline hover:text-orange-800">Knowledge Repo</a>
              {' '}to reduce false gaps →
            </p>
          )}
        </div>

        {/* Gap list */}
        <div className="flex flex-col gap-2">
          {displayGaps.map(gap => {
            const answered = answeredByGapId[gap.gap_id];
            return (
              <div
                key={gap.gap_id}
                className={`rounded-lg border px-3 py-2.5 text-xs ${
                  gap.status === 'answered' ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-2">
                  {gap.status === 'answered' ? (
                    <svg className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-orange-300 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 leading-snug">{gap.rfp_requirement}</p>
                    <p className="text-gray-500 mt-0.5">Missing: {gap.what_is_missing}</p>
                    {answered ? (
                      <p className="text-green-700 mt-0.5 font-medium">
                        ✓ {answered.answer}{gap.unit_hint ? ` ${gap.unit_hint}` : ''}
                        {answered.answered_by_name ? ` — ${answered.answered_by_name}` : ''}
                      </p>
                    ) : (
                      <p className="text-gray-400 mt-0.5 text-[11px]">{gap.suggested_recipient_role}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {allResolved ? (
            <button
              onClick={() => onReadyToGenerate(displayGaps)}
              className="w-full py-2.5 text-sm font-bold bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors"
            >
              ✦ Generate proposal with answers →
            </button>
          ) : state === 'sent' ? (
            <>
              <button
                onClick={handleCheckAnswers}
                disabled={checkingAnswers}
                className="w-full py-2.5 text-sm font-semibold border border-orange-300 text-orange-700 bg-white hover:bg-orange-50 rounded-xl transition-colors disabled:opacity-50"
              >
                {checkingAnswers ? 'Checking…' : '↺ Check for answers'}
              </button>
              {activeForms.length > 0 && (
                <button
                  onClick={() => {
                    const queue = activeForms.map((f, i) => ({
                      formResult: {
                        form_id: f.id,
                        token: f.token,
                        access_code: f.access_code,
                        open_until: f.open_until,
                        cro_name: '',
                      },
                      recipientName: recipients[i]?.name ?? '',
                    }));
                    setShareQueue(queue);
                    setShareQueueIndex(0);
                  }}
                  className="w-full py-2 text-xs font-medium text-orange-600 hover:text-orange-800 underline"
                >
                  {activeForms.length > 1 ? `Resend / view ${activeForms.length} links` : 'Resend / view link'}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={enterAssigning}
              className="w-full py-2.5 text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
            >
              Assign & send to SME →
            </button>
          )}

          {state === 'sent' && answeredCount > 0 && pendingCount > 0 && (
            <button
              onClick={() => onReadyToGenerate(displayGaps)}
              className="w-full py-2 text-xs font-medium text-orange-700 hover:text-orange-900 underline"
            >
              Generate with {answeredCount} available answer{answeredCount > 1 ? 's' : ''}
            </button>
          )}

          {(state === 'found' || (state === 'sent' && pendingCount > 0)) && (
            <>
              <button
                onClick={() => onReadyToGenerate([])}
                className="w-full py-2 text-xs font-medium text-gray-400 hover:text-gray-600 underline transition-colors"
              >
                Skip and draft anyway
              </button>
              <p className="text-[11px] text-gray-400 text-center">
                Skipping inserts [DATA NEEDED] placeholders where gap values would appear
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
