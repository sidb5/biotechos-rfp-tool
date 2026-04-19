'use client';

// /engagements/[id] — CRO engagement thread + AI draft approval
//
// Shows the full message thread for a CRO-initiated engagement.
// When an AI draft is waiting (status='draft', ai_generated=true),
// shows an approval card: editable textarea + Approve & send / Dismiss.
//
// For native-mode engagements: shows a banner instead of the approval card.

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter }                     from 'next/navigation';
import { supabase }                                 from '@shared/lib/supabase';

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
  id:           string;
  cro_name:     string;
  cro_email:    string;
  stage:        string;
  capture_mode: 'assisted' | 'native';
  initiator:    string;
}

interface LinkedProposal {
  id:          string;
  biotech_name: string | null;
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

const STAGE_COLORS: Record<string, string> = {
  enquiry_sent:      'bg-blue-100 text-blue-700',
  response_received: 'bg-amber-100 text-amber-700',
  followup_sent:     'bg-blue-100 text-blue-700',
  meeting_scheduled: 'bg-purple-100 text-purple-700',
  meeting_done:      'bg-purple-100 text-purple-700',
  rfp_sent:          'bg-indigo-100 text-indigo-700',
  awarded:           'bg-green-100 text-green-700',
  closed:            'bg-gray-100 text-gray-500',
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function CroEngagementPage() {
  const params        = useParams();
  const router        = useRouter();
  const engagementId  = params.id as string;

  const [engagement, setEngagement]       = useState<Engagement | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [loading, setLoading]             = useState(true);
  const [linkedProposal, setLinkedProposal] = useState<LinkedProposal | null>(null);

  // AI draft approval state
  const [aiDraft, setAiDraft]             = useState<Message | null>(null);
  const [aiDraftBody, setAiDraftBody]     = useState('');
  const [aiDraftSubject, setAiDraftSubject] = useState('');
  const [approving, setApproving]         = useState(false);
  const [dismissing, setDismissing]       = useState(false);
  const [approveError, setApproveError]   = useState('');
  const [approveSent, setApproveSent]     = useState(false);

  // User-composed follow-up state
  const [composeBody, setComposeBody]       = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError]     = useState('');
  const [composeSent, setComposeSent]       = useState(false);

  const loadThread = useCallback(async () => {
    const [{ data: engData }, { data: msgData }] = await Promise.all([
      supabase
        .from('cro_engagements')
        .select('id, cro_name, cro_email, stage, capture_mode, initiator')
        .eq('id', engagementId)
        .single(),
      supabase
        .from('engagement_messages')
        .select('id, direction, message_type, subject, body, status, sent_at, created_at, ai_generated')
        .eq('engagement_id', engagementId)
        .order('created_at', { ascending: true }),
    ]);

    if (engData) {
      setEngagement(engData as Engagement);
      // Pre-fill a sensible follow-up subject if compose box hasn't been touched
      setComposeSubject(prev => prev || `Following up — ${(engData as Engagement).cro_name}`);

      // Look up the proposal linked to this engagement so we can offer "Back to proposal"
      const { data: proposalData } = await supabase
        .from('proposals')
        .select('id, rfps(biotech_name)')
        .eq('engagement_id', engagementId)
        .maybeSingle();
      if (proposalData) {
        const rfp = proposalData.rfps as { biotech_name?: string | null } | null;
        setLinkedProposal({
          id: proposalData.id,
          biotech_name: rfp?.biotech_name ?? null,
        });
      }
    }
    if (msgData) {
      setMessages(msgData as Message[]);

      // Find pending AI draft (most recent)
      const pending = (msgData as Message[]).find(
        m => m.direction === 'outbound' && m.status === 'draft' && m.ai_generated
      );
      if (pending) {
        setAiDraft(pending);
        setAiDraftBody(pending.body ?? '');
        setAiDraftSubject(pending.subject ?? 'Re: (your message)');
      } else {
        setAiDraft(null);
      }
    }
    setLoading(false);
  }, [engagementId]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      await loadThread();
    }
    void init();
  }, [loadThread, router]);

  async function handleApproveAndSend() {
    if (!aiDraft || !aiDraftBody.trim()) return;
    setApproving(true); setApproveError(''); setApproveSent(false);
    try {
      const res  = await fetch(`/api/cro/engagements/${engagementId}/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message_id: aiDraft.id, subject: aiDraftSubject, body: aiDraftBody }),
      });
      const json = await res.json();
      if (!res.ok || !json.sent) {
        setApproveError((json.error as string) ?? 'Send failed — please retry');
        setApproving(false); return;
      }
      setApproveSent(true); setApproving(false);
      await loadThread();
    } catch {
      setApproveError('Network error — please retry');
      setApproving(false);
    }
  }

  async function handleComposeSend() {
    if (!composeSubject.trim() || !composeBody.trim()) return;
    setComposeSending(true); setComposeError(''); setComposeSent(false);
    try {
      const res  = await fetch(`/api/cro/engagements/${engagementId}/compose`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subject: composeSubject.trim(), body: composeBody.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.sent) {
        setComposeError((json.error as string) ?? 'Send failed — please retry');
        setComposeSending(false); return;
      }
      setComposeSent(true);
      setComposeBody('');
      setComposeSending(false);
      await loadThread();
      // Reset sent indicator after 5s
      setTimeout(() => setComposeSent(false), 5000);
    } catch {
      setComposeError('Network error — please retry');
      setComposeSending(false);
    }
  }

  async function handleDismiss() {
    if (!aiDraft) return;
    setDismissing(true); setApproveError('');
    const { error } = await supabase
      .from('engagement_messages')
      .update({ status: 'dismissed' })
      .eq('id', aiDraft.id);
    if (error) {
      setApproveError('Failed to dismiss — please retry');
      setDismissing(false); return;
    }
    setDismissing(false);
    await loadThread();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!engagement) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Engagement not found.{' '}
        <a href="/dashboard" className="ml-2 text-blue-500 hover:underline">Back to dashboard</a>
      </div>
    );
  }

  const stageLabel = STAGE_LABELS[engagement.stage] ?? engagement.stage;
  const stageColor = STAGE_COLORS[engagement.stage] ?? 'bg-gray-100 text-gray-500';

  // Thread: exclude dismissed and draft messages — they show in the action card
  const threadMessages = messages.filter(m => m.status !== 'draft' && m.status !== 'dismissed');
  const reversedThread = [...threadMessages].reverse();

  // Find the latest inbound message (to show "replying to" in the approval card)
  const latestInbound = [...messages]
    .reverse()
    .find(m => m.direction === 'inbound');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-4xl px-5 py-10 space-y-6">

        {/* Header */}
        <header>
          <nav className="mb-1.5 text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
            {linkedProposal ? (
              <>
                <a href="/requests" className="hover:text-gray-700 transition-colors">Quotes &amp; Proposals</a>
                <span>/</span>
                <a href={`/quote/${linkedProposal.id}`} className="hover:text-gray-700 transition-colors">
                  {linkedProposal.biotech_name ?? 'Proposal'}
                </a>
                <span>/</span>
                <span className="text-gray-700">Conversation</span>
              </>
            ) : (
              <>
                <a href="/dashboard" className="hover:text-gray-700 transition-colors">Dashboard</a>
                <span>/</span>
                <span className="text-gray-700">{engagement.cro_name}</span>
              </>
            )}
          </nav>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{engagement.cro_name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stageColor}`}>
                  {stageLabel}
                </span>
                <span className="text-xs text-gray-500">{engagement.cro_email}</span>
              </div>
            </div>
            {linkedProposal && (
              <a
                href={`/quote/${linkedProposal.id}`}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                ← Back to proposal
              </a>
            )}
          </div>
        </header>

        {/* Native mode banner */}
        {engagement.capture_mode === 'native' && (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 flex items-center gap-3 shadow-sm">
            <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">Native mode</span> — client replies land in your inbox directly. The app does not capture replies for this engagement.
            </p>
          </div>
        )}

        {/* AI Draft Approval Card */}
        {aiDraft && !approveSent && engagement.capture_mode === 'assisted' && (
          <section className="rounded-2xl border border-blue-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-blue-100 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">AI</span>
              <h2 className="text-sm font-semibold text-blue-900">Reply draft ready for review</h2>
              <span className="ml-auto text-xs text-blue-500 font-medium">AI-generated</span>
            </div>

            {/* Show the inbound message being replied to */}
            {latestInbound && (
              <div className="px-6 py-4 bg-gray-50 border-b border-blue-100">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
                  Replying to
                </p>
                <p className="text-xs font-medium text-gray-700">{latestInbound.subject ?? '(no subject)'}</p>
                <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap line-clamp-4">
                  {latestInbound.body ?? '(no body)'}
                </p>
              </div>
            )}

            {/* Editable draft */}
            <div className="px-6 py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Subject</label>
                <input
                  type="text"
                  value={aiDraftSubject}
                  onChange={e => setAiDraftSubject(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  Draft reply <span className="text-gray-400 font-normal">(edit before sending)</span>
                </label>
                <textarea
                  value={aiDraftBody}
                  onChange={e => setAiDraftBody(e.target.value)}
                  rows={10}
                  className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {approveError && (
              <div className="px-6 pb-2">
                <p className="text-xs text-red-600">⚠ {approveError}</p>
              </div>
            )}

            <div className="px-6 pb-5 flex items-center gap-3 justify-between">
              <button
                onClick={handleDismiss}
                disabled={dismissing || approving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                {dismissing ? 'Dismissing…' : 'Dismiss'}
              </button>
              <button
                onClick={handleApproveAndSend}
                disabled={!aiDraftBody.trim() || approving || dismissing}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
              >
                {approving ? 'Sending…' : 'Approve & send →'}
              </button>
            </div>
          </section>
        )}

        {/* Approve success toast */}
        {approveSent && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 flex items-center gap-3">
            <span className="text-green-600">✓</span>
            <p className="text-sm text-green-800 font-medium">Reply sent to {engagement.cro_name}</p>
          </div>
        )}

        {/* Message thread */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Thread ({threadMessages.length})
          </h2>
          {threadMessages.length === 0 && (
            <p className="text-sm text-gray-400 italic">No messages yet.</p>
          )}
          {reversedThread.map(msg => {
            const isOutbound = msg.direction === 'outbound';
            return (
              <div key={msg.id}
                className={`rounded-xl border p-4 space-y-2 ${
                  isOutbound
                    ? 'border-blue-100 bg-blue-50'
                    : 'border-gray-200 bg-white shadow-sm'
                }`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold ${isOutbound ? 'text-blue-700' : 'text-gray-700'}`}>
                    {isOutbound ? 'You' : engagement.cro_name}
                  </span>
                  {msg.ai_generated && (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                      AI draft
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-gray-400">{fmt(msg.sent_at ?? msg.created_at)}</span>
                </div>
                {msg.subject && (
                  <p className="text-xs font-medium text-gray-600">{msg.subject}</p>
                )}
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.body ?? ''}</p>
              </div>
            );
          })}
        </section>

        {/* Compose follow-up */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center gap-2">
            <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-800">
              {threadMessages.length === 0 ? 'Send a message' : 'Send a follow-up'}
            </h2>
            <span className="ml-auto text-xs text-gray-400">To: {engagement.cro_email}</span>
          </div>

          <div className="px-6 py-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Subject</label>
              <input
                type="text"
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
                placeholder="Subject"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Message</label>
              <textarea
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                rows={6}
                placeholder={`Write your message to ${engagement.cro_name}…`}
                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {composeError && (
            <div className="px-6 pb-2">
              <p className="text-xs text-red-600">⚠ {composeError}</p>
            </div>
          )}

          <div className="px-6 pb-5 flex items-center justify-between gap-3">
            <div>
              {composeSent && (
                <p className="text-xs text-green-700 font-medium">✓ Message sent</p>
              )}
            </div>
            <button
              onClick={handleComposeSend}
              disabled={composeSending || !composeSubject.trim() || !composeBody.trim()}
              className="rounded-lg bg-gray-800 hover:bg-gray-700 px-6 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              {composeSending ? 'Sending…' : 'Send →'}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
