'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import type { FollowupOutput } from '@biotech/prompts/followup';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id:           string;
  direction:    'outbound' | 'inbound';
  message_type: string;
  subject:      string | null;
  body:         string | null;
  status:       string;
  sent_at:      string | null;
  created_at:   string;
  ai_generated: boolean;
}

interface Engagement {
  id:       string;
  cro_name: string;
  cro_email:string;
  stage:    string;
  brief_id: string;
  rfp_internal_briefs: { title: string | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  enquiry_sent:      'bg-blue-900/60 text-blue-300',
  response_received: 'bg-amber-900/50 text-amber-300',
  followup_draft:    'bg-gray-700 text-gray-400',
  followup_sent:     'bg-blue-900/60 text-blue-300',
  meeting_scheduled: 'bg-purple-900/50 text-purple-300',
  meeting_done:      'bg-purple-800/50 text-purple-200',
  rfp_sent:          'bg-blue-900/60 text-blue-300',
  awarded:           'bg-green-900/50 text-green-300',
  closed:            'bg-gray-800 text-gray-600',
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EngagementThreadPage() {
  const params        = useParams();
  const router        = useRouter();
  const engagementId  = params.id as string;

  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [messages, setMessages]     = useState<Message[]>([]);
  const [loading, setLoading]       = useState(true);

  // Inbound paste modal
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedResponse, setPastedResponse] = useState('');
  const [pasteLoading, setPasteLoading]     = useState(false);
  const [pasteError, setPasteError]         = useState('');

  // AI followup panel (Task 3.2)
  const [followup, setFollowup]             = useState<FollowupOutput | null>(null);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError]   = useState('');

  // Draft reply editor
  const [draftSubject, setDraftSubject]     = useState('');
  const [draftBody, setDraftBody]           = useState('');
  const [draftMsgId, setDraftMsgId]         = useState<string | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState('');
  const [sendSuccess, setSendSuccess]       = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadThread = useCallback(async () => {
    const [{ data: engData }, { data: msgData }] = await Promise.all([
      supabase
        .from('cro_engagements')
        .select('id, cro_name, cro_email, stage, brief_id, rfp_internal_briefs(title)')
        .eq('id', engagementId)
        .single(),
      supabase
        .from('engagement_messages')
        .select('id, direction, message_type, subject, body, status, sent_at, created_at, ai_generated')
        .eq('engagement_id', engagementId)
        .order('created_at', { ascending: true }),
    ]);

    if (engData) setEngagement(engData as Engagement);
    if (msgData) {
      setMessages(msgData as Message[]);
      // Restore any existing followup draft
      const existing = (msgData as Message[]).find(
        m => m.direction === 'outbound' && m.message_type === 'followup' && m.status === 'draft'
      );
      if (existing) {
        setDraftSubject(existing.subject ?? '');
        setDraftBody(existing.body ?? '');
        setDraftMsgId(existing.id);
      }
    }
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [engagementId]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      await loadThread();
    }
    void init();
  }, [loadThread, router]);

  // ── Log inbound response + trigger AI ────────────────────────────────────

  async function handleLogResponse() {
    if (!pastedResponse.trim()) return;
    setPasteLoading(true);
    setPasteError('');
    setFollowupLoading(true);

    try {
      const res  = await fetch(`/api/biotech/engagements/${engagementId}/inbound`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ response_text: pastedResponse.trim() }),
      });
      const json = await res.json();

      if (!res.ok) {
        setPasteError((json.error as string) ?? 'Failed to save response');
        setPasteLoading(false);
        setFollowupLoading(false);
        return;
      }

      // Close modal, refresh thread
      setShowPasteModal(false);
      setPastedResponse('');
      setPasteLoading(false);
      await loadThread();

      // Set AI followup results
      if (json.followup) {
        setFollowup(json.followup as FollowupOutput);
        setDraftSubject((json.followup as FollowupOutput).draft_subject);
        setDraftBody((json.followup as FollowupOutput).draft_reply);
        setDraftMsgId(json.draft_message_id as string | null);
      } else if (json.ai_error) {
        setFollowupError(json.ai_error as string);
      }
    } catch {
      setPasteError('Network error — please try again');
      setPasteLoading(false);
    }
    setFollowupLoading(false);
  }

  // ── Insert suggested question into draft body ─────────────────────────────

  function toggleQuestion(idx: number) {
    if (!followup) return;
    const question = followup.suggested_questions[idx];
    setSelectedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        // Remove from draft
        next.delete(idx);
        setDraftBody(b => b.replace(`\n\n${question}`, '').replace(`${question}\n\n`, ''));
      } else {
        // Append to draft
        next.add(idx);
        setDraftBody(b => b.trimEnd() + `\n\n${question}`);
      }
      return next;
    });
  }

  // ── Send followup ─────────────────────────────────────────────────────────

  async function handleSend() {
    if (!draftMsgId || !draftBody.trim()) return;
    setSending(true);
    setSendError('');

    const res  = await fetch(`/api/biotech/engagements/${engagementId}/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message_id: draftMsgId, subject: draftSubject, body: draftBody }),
    });
    const json = await res.json();

    if (!res.ok || !json.sent) {
      setSendError((json.error as string) ?? 'Send failed — please retry');
      setSending(false);
      return;
    }

    setSendSuccess(true);
    setSending(false);
    setFollowup(null);
    await loadThread();
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

  if (!engagement) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">
        Engagement not found.{' '}
        <a href="/biotech/engagements" className="ml-2 text-blue-400 hover:underline">Back</a>
      </div>
    );
  }

  const canLogResponse = ['enquiry_sent', 'followup_sent'].includes(engagement.stage);
  const hasFollowupDraft = engagement.stage === 'followup_draft';
  const stageLabel = STAGE_LABELS[engagement.stage] ?? engagement.stage;
  const stageColor = STAGE_COLOR[engagement.stage] ?? 'bg-gray-700 text-gray-400';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-5xl px-5 py-10 space-y-6">

        {/* Header */}
        <header>
          <nav className="mb-1.5 text-xs text-gray-600">
            <a href="/biotech/dashboard" className="hover:text-gray-400 transition-colors">Dashboard</a>
            <span className="mx-1.5">/</span>
            <a href="/biotech/engagements" className="hover:text-gray-400 transition-colors">Engagements</a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-400">{engagement.cro_name}</span>
          </nav>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-white">{engagement.cro_name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stageColor}`}>
                  {stageLabel}
                </span>
                <span className="text-xs text-gray-600">{engagement.cro_email}</span>
                {engagement.rfp_internal_briefs?.title && (
                  <a
                    href={`/biotech/briefs/${engagement.brief_id}`}
                    className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    Brief: {engagement.rfp_internal_briefs.title}
                  </a>
                )}
              </div>
            </div>

            {/* Context-sensitive action button */}
            {canLogResponse && (
              <button
                onClick={() => setShowPasteModal(true)}
                className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
              >
                + Log CRO response
              </button>
            )}
          </div>
        </header>

        {/* Main two-column layout when followup is active */}
        <div className={`grid gap-6 items-start ${(followup || followupLoading || hasFollowupDraft) ? 'grid-cols-1 lg:grid-cols-[1fr_400px]' : 'grid-cols-1'}`}>

          {/* ── Left: message thread ── */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Thread</h2>

            {messages.length === 0 ? (
              <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-6 py-10 text-center text-sm text-gray-600">
                No messages yet in this engagement.
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map(msg => {
                  const isOut = msg.direction === 'outbound';
                  const isDraft = msg.status === 'draft';

                  return (
                    <div
                      key={msg.id}
                      className={`rounded-xl border p-4 space-y-2 ${
                        isDraft
                          ? 'border-amber-800/30 bg-amber-950/20'
                          : isOut
                          ? 'border-blue-800/30 bg-blue-950/20'
                          : 'border-gray-700/60 bg-gray-900/60'
                      }`}
                    >
                      {/* Message header */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            isDraft     ? 'bg-amber-900/50 text-amber-300' :
                            isOut       ? 'bg-blue-900/50 text-blue-300' :
                                          'bg-gray-700 text-gray-400'
                          }`}>
                            {isDraft ? 'Draft' : isOut ? 'Sent' : 'Received'}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">
                            {msg.message_type.replace(/_/g, ' ')}
                          </span>
                          {msg.ai_generated && (
                            <span className="text-[10px] text-gray-700">AI</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-600">
                          {fmt(msg.sent_at ?? msg.created_at)}
                        </span>
                      </div>

                      {/* Subject */}
                      {msg.subject && (
                        <p className="text-xs font-medium text-gray-400">Subject: {msg.subject}</p>
                      )}

                      {/* Body */}
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {msg.body ?? ''}
                      </p>

                      {/* Delivery status */}
                      {isOut && !isDraft && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            msg.status === 'delivered' ? 'bg-green-500' :
                            msg.status === 'bounced'   ? 'bg-red-500' :
                            msg.status === 'sent'      ? 'bg-blue-500' :
                            msg.status === 'failed'    ? 'bg-red-600' :
                                                         'bg-gray-600'
                          }`} />
                          <span className="text-[10px] text-gray-600 capitalize">{msg.status}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* ── Right: AI followup panel (Task 3.2) ── */}
          {(followup || followupLoading || hasFollowupDraft) && (
            <aside className="space-y-4 lg:sticky lg:top-4">

              {/* Generating spinner */}
              {followupLoading && (
                <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 flex items-center gap-3 text-sm text-gray-500">
                  <svg className="h-4 w-4 shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analysing response and drafting reply…
                </div>
              )}

              {followupError && (
                <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 text-xs text-red-400">
                  ⚠ {followupError}
                </div>
              )}

              {followup && !followupLoading && (
                <>
                  {/* Gap analysis */}
                  <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Gap analysis</h3>

                    {followup.gap_analysis.confirmed.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-green-400 mb-1.5">✓ Confirmed</p>
                        <ul className="space-y-1">
                          {followup.gap_analysis.confirmed.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                              <span className="mt-0.5 shrink-0 text-green-600">✓</span>{item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {followup.gap_analysis.unaddressed.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-amber-400 mb-1.5">? Unaddressed</p>
                        <ul className="space-y-1">
                          {followup.gap_analysis.unaddressed.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                              <span className="mt-0.5 shrink-0 text-amber-600">?</span>{item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {followup.gap_analysis.concerns.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-red-400 mb-1.5">⚠ Concerns</p>
                        <ul className="space-y-1">
                          {followup.gap_analysis.concerns.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                              <span className="mt-0.5 shrink-0 text-red-600">⚠</span>{item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Suggested questions as checkboxes */}
                  {followup.suggested_questions.length > 0 && (
                    <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                        Suggested questions
                        <span className="ml-1.5 text-gray-600 font-normal normal-case">(check to insert into reply)</span>
                      </h3>
                      <div className="space-y-2">
                        {followup.suggested_questions.map((q, i) => (
                          <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={selectedQuestions.has(i)}
                              onChange={() => toggleQuestion(i)}
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                            />
                            <span className={`text-xs leading-relaxed transition-colors ${
                              selectedQuestions.has(i) ? 'text-blue-300' : 'text-gray-400 group-hover:text-gray-300'
                            }`}>
                              {q}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Draft reply editor — shown for followup_draft stage or after AI */}
              {(followup || hasFollowupDraft) && !followupLoading && (
                <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Draft reply</h3>

                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">Subject</p>
                    <input
                      type="text"
                      value={draftSubject}
                      onChange={e => setDraftSubject(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">Message</p>
                    <textarea
                      value={draftBody}
                      onChange={e => setDraftBody(e.target.value)}
                      rows={10}
                      className="w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {sendError && (
                    <p className="text-xs text-red-400">⚠ {sendError}</p>
                  )}
                  {sendSuccess && (
                    <p className="text-xs text-green-400">✓ Reply sent successfully</p>
                  )}

                  <button
                    onClick={handleSend}
                    disabled={sending || !draftBody.trim() || !draftMsgId}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
                  >
                    {sending ? 'Sending…' : 'Approve & Send →'}
                  </button>
                </div>
              )}
            </aside>
          )}
        </div>

      </div>

      {/* ── Paste modal ── */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Log CRO response</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Paste {engagement.cro_name}&apos;s email reply. AI will analyse it and draft a follow-up.
                </p>
              </div>
              <button
                onClick={() => { setShowPasteModal(false); setPasteError(''); }}
                className="text-gray-600 hover:text-gray-400 text-xl leading-none shrink-0"
              >×</button>
            </div>

            <textarea
              value={pastedResponse}
              onChange={e => setPastedResponse(e.target.value)}
              placeholder="Paste CRO's email response here…"
              rows={10}
              autoFocus
              className="w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            {pasteError && <p className="text-xs text-red-400">⚠ {pasteError}</p>}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowPasteModal(false); setPasteError(''); }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogResponse}
                disabled={pasteLoading || !pastedResponse.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
              >
                {pasteLoading ? 'Saving & analysing…' : 'Save & analyse →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
