'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import type { FollowupOutput } from '@biotech/prompts/followup';

interface DebriefOutput {
  gaps_resolved:   string[];
  new_concerns:    string[];
  rfp_refinements: string[];
  open_questions:  string[];
}

interface RfpNote {
  id:                   string;
  text:                 string;
  type:                 'rfp_refinement' | 'open_question';
  source_engagement_id: string;
  source_cro_name:      string;
  added_at:             string;
}

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
  rfp_internal_briefs: { title: string | null; rfp_context_notes: RfpNote[] } | null;
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

  // Draft reply editor (followup)
  const [draftSubject, setDraftSubject]     = useState('');
  const [draftBody, setDraftBody]           = useState('');
  const [draftMsgId, setDraftMsgId]         = useState<string | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState('');
  const [sendSuccess, setSendSuccess]       = useState(false);

  // Meeting invite (Task 4.1)
  const [meetingSubject, setMeetingSubject]     = useState('');
  const [meetingBody, setMeetingBody]           = useState('');
  const [meetingMsgId, setMeetingMsgId]         = useState<string | null>(null);
  const [meetingLoading, setMeetingLoading]     = useState(false);
  const [meetingError, setMeetingError]         = useState('');
  const [meetingSent, setMeetingSent]           = useState(false);
  const [noSchedulingLink, setNoSchedulingLink] = useState(false);

  // Meeting notes + debrief (Tasks 5.1 & 5.2)
  const [showNotesModal, setShowNotesModal]     = useState(false);
  const [rawNotes, setRawNotes]                 = useState('');
  const [meetingDateInput, setMeetingDateInput] = useState('');
  const [attendeesInput, setAttendeesInput]     = useState('');
  const [notesLoading, setNotesLoading]         = useState(false);
  const [notesError, setNotesError]             = useState('');
  const [debrief, setDebrief]                   = useState<DebriefOutput | null>(null);
  const [debriefLoading, setDebriefLoading]     = useState(false);
  // Map of note text → saved note_id (persisted to brief's rfp_context_notes)
  const [rfpNoted, setRfpNoted]                 = useState<Map<string, string>>(new Map());

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadThread = useCallback(async () => {
    const [{ data: engData }, { data: msgData }, { data: meetingData }] = await Promise.all([
      supabase
        .from('cro_engagements')
        .select('id, cro_name, cro_email, stage, brief_id, rfp_internal_briefs(title, rfp_context_notes)')
        .eq('id', engagementId)
        .single(),
      supabase
        .from('engagement_messages')
        .select('id, direction, message_type, subject, body, status, sent_at, created_at, ai_generated')
        .eq('engagement_id', engagementId)
        .order('created_at', { ascending: true }),
      supabase
        .from('engagement_meetings')
        .select('ai_summary')
        .eq('engagement_id', engagementId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (engData) {
      setEngagement(engData as Engagement);
      // Restore + RFP selections from the brief's persisted notes
      const savedNotes = ((engData as Engagement).rfp_internal_briefs?.rfp_context_notes ?? []) as RfpNote[];
      setRfpNoted(new Map(savedNotes.map(n => [n.text, n.id])));
    }
    if (msgData) {
      setMessages(msgData as Message[]);
      // Restore any existing followup draft
      const existingFollowup = (msgData as Message[]).find(
        m => m.direction === 'outbound' && m.message_type === 'followup' && m.status === 'draft'
      );
      if (existingFollowup) {
        setDraftSubject(existingFollowup.subject ?? '');
        setDraftBody(existingFollowup.body ?? '');
        setDraftMsgId(existingFollowup.id);
      }
      // Restore any existing meeting invite draft
      const existingMeeting = (msgData as Message[]).find(
        m => m.direction === 'outbound' && m.message_type === 'meeting_invite' && m.status === 'draft'
      );
      if (existingMeeting) {
        setMeetingSubject(existingMeeting.subject ?? '');
        setMeetingBody(existingMeeting.body ?? '');
        setMeetingMsgId(existingMeeting.id);
      }
    }

    // Restore meeting debrief if already done
    if (meetingData?.ai_summary) {
      setDebrief(meetingData.ai_summary as DebriefOutput);
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

  // ── Toggle RFP note (persists to brief's rfp_context_notes) ─────────────

  async function toggleRfpNote(text: string, type: 'rfp_refinement' | 'open_question') {
    if (!engagement) return;

    if (rfpNoted.has(text)) {
      // Remove
      const noteId = rfpNoted.get(text)!;
      await fetch(`/api/biotech/briefs/${engagement.brief_id}/rfp-notes`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ note_id: noteId }),
      });
      setRfpNoted(prev => { const m = new Map(prev); m.delete(text); return m; });
    } else {
      // Add
      const res  = await fetch(`/api/biotech/briefs/${engagement.brief_id}/rfp-notes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text,
          type,
          source_engagement_id: engagementId,
          source_cro_name:      engagement.cro_name,
        }),
      });
      const json = await res.json();
      if (res.ok && json.note_id) {
        setRfpNoted(prev => new Map([...prev, [text, json.note_id as string]]));
      }
    }
  }

  // ── Submit meeting notes + trigger debrief ───────────────────────────────

  async function handleLogMeetingNotes() {
    if (!rawNotes.trim()) return;
    setNotesLoading(true);
    setNotesError('');
    setDebriefLoading(true);

    try {
      const res  = await fetch(`/api/biotech/engagements/${engagementId}/meeting-notes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          notes:        rawNotes.trim(),
          meeting_date: meetingDateInput || null,
          attendees:    attendeesInput   || null,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setNotesError((json.error as string) ?? 'Failed to save notes');
        setNotesLoading(false);
        setDebriefLoading(false);
        return;
      }

      setShowNotesModal(false);
      setRawNotes('');
      setNotesLoading(false);
      await loadThread();

      if (json.debrief) {
        setDebrief(json.debrief as DebriefOutput);
      } else if (json.ai_error) {
        setNotesError(json.ai_error as string);
      }
    } catch {
      setNotesError('Network error — please try again');
      setNotesLoading(false);
    }
    setDebriefLoading(false);
  }

  // ── Generate meeting invite ───────────────────────────────────────────────

  async function handleGenerateMeetingInvite() {
    setMeetingLoading(true);
    setMeetingError('');
    setNoSchedulingLink(false);

    const res  = await fetch(`/api/biotech/engagements/${engagementId}/meeting-invite`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json();

    if (json.error === 'no_scheduling_link') {
      setNoSchedulingLink(true);
      setMeetingLoading(false);
      return;
    }
    if (!res.ok) {
      setMeetingError((json.error as string) ?? 'Failed to generate invite');
      setMeetingLoading(false);
      return;
    }
    setMeetingSubject(json.subject as string);
    setMeetingBody(json.body as string);
    setMeetingMsgId(json.message_id as string);
    setMeetingLoading(false);
  }

  // ── Send meeting invite ───────────────────────────────────────────────────

  async function handleSendMeetingInvite() {
    if (!meetingMsgId || !meetingBody.trim()) return;
    setMeetingLoading(true);
    setMeetingError('');

    const res  = await fetch(`/api/biotech/engagements/${engagementId}/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message_id: meetingMsgId, subject: meetingSubject, body: meetingBody }),
    });
    const json = await res.json();

    if (!res.ok || !json.sent) {
      setMeetingError((json.error as string) ?? 'Send failed — please retry');
      setMeetingLoading(false);
      return;
    }

    setMeetingSent(true);
    setMeetingLoading(false);
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

  const isEnquiryDraft      = engagement.stage === 'enquiry_draft';
  const canLogResponse      = ['enquiry_sent', 'followup_sent'].includes(engagement.stage);
  const hasFollowupDraft    = engagement.stage === 'followup_draft';
  const canScheduleMeeting  = engagement.stage === 'followup_sent';
  const hasMeetingDraft     = !!meetingMsgId && !meetingSent;
  const canLogMeetingNotes  = engagement.stage === 'meeting_scheduled';
  const hasDebrief          = !!debrief || debriefLoading || engagement.stage === 'meeting_done';
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

            {/* Context-sensitive action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {canLogResponse && (
                <button
                  onClick={() => setShowPasteModal(true)}
                  className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
                >
                  + Log CRO response
                </button>
              )}
              {canScheduleMeeting && !hasMeetingDraft && (
                <button
                  onClick={handleGenerateMeetingInvite}
                  disabled={meetingLoading}
                  className="shrink-0 rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:opacity-50"
                >
                  {meetingLoading ? 'Generating…' : '📅 Schedule meeting'}
                </button>
              )}
              {canLogMeetingNotes && (
                <button
                  onClick={() => setShowNotesModal(true)}
                  className="shrink-0 rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600"
                >
                  📋 Log meeting notes
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Enquiry not yet sent — nudge user back to CRO selection */}
        {isEnquiryDraft && (
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-amber-300">Enquiry not sent yet</p>
              <p className="text-xs text-amber-700 mt-0.5">
                The outreach email to {engagement.cro_name} hasn&apos;t been sent. Select CROs and send from the brief.
              </p>
            </div>
            <a
              href={`/biotech/briefs/${engagement.brief_id}`}
              className="shrink-0 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            >
              Back to brief →
            </a>
          </div>
        )}

        {/* Main two-column layout when right panel is active */}
        <div className={`grid gap-6 items-start ${(followup || followupLoading || hasFollowupDraft || canScheduleMeeting || hasMeetingDraft || hasDebrief) ? 'grid-cols-1 lg:grid-cols-[1fr_400px]' : 'grid-cols-1'}`}>

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

                      {/* Delivery status — only for sent/delivered/bounced messages */}
                      {isOut && !isDraft && ['sent', 'delivered', 'bounced'].includes(msg.status) && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            msg.status === 'delivered' ? 'bg-green-500' :
                            msg.status === 'bounced'   ? 'bg-red-500' :
                                                         'bg-blue-500'
                          }`} />
                          <span className="text-[10px] text-gray-600 capitalize">{msg.status}</span>
                        </div>
                      )}
                      {/* Failed send — show retry link */}
                      {isOut && !isDraft && msg.status === 'failed' && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[10px] text-red-400">⚠ Send failed</span>
                          <a
                            href={`/biotech/briefs/${engagement.brief_id}`}
                            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors underline"
                          >
                            Go back to brief →
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* ── Right: meeting invite panel (Task 4.1) ── */}
          {(canScheduleMeeting || hasMeetingDraft) && (
            <aside className="space-y-4 lg:sticky lg:top-4">

              {/* No scheduling link configured */}
              {noSchedulingLink && (
                <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 space-y-2">
                  <p className="text-sm font-medium text-amber-300">Booking link not set</p>
                  <p className="text-xs text-amber-700">
                    Add your Calendly or Cal.com booking URL in settings so the invite can include it.
                  </p>
                  <a
                    href="/biotech/settings"
                    className="inline-block text-xs text-blue-400 hover:text-blue-300 transition-colors underline"
                  >
                    Open settings →
                  </a>
                </div>
              )}

              {/* Generating spinner */}
              {meetingLoading && (
                <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 flex items-center gap-3 text-sm text-gray-500">
                  <svg className="h-4 w-4 shrink-0 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Drafting meeting invite…
                </div>
              )}

              {meetingError && (
                <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 text-xs text-red-400">
                  ⚠ {meetingError}
                </div>
              )}

              {/* Draft editor */}
              {meetingBody && !meetingLoading && (
                <div className="rounded-xl border border-purple-800/30 bg-purple-950/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-purple-300">
                      📅 Meeting invite draft
                    </h3>
                    {/* Re-draft button */}
                    <button
                      onClick={() => { setMeetingBody(''); setMeetingMsgId(null); handleGenerateMeetingInvite(); }}
                      className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      Re-draft
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">Subject</p>
                    <input
                      type="text"
                      value={meetingSubject}
                      onChange={e => setMeetingSubject(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">Message</p>
                    <textarea
                      value={meetingBody}
                      onChange={e => setMeetingBody(e.target.value)}
                      rows={9}
                      className="w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

                  {meetingError && <p className="text-xs text-red-400">⚠ {meetingError}</p>}
                  {meetingSent  && <p className="text-xs text-green-400">✓ Meeting invite sent — stage updated to &quot;Meeting scheduled&quot;</p>}

                  <button
                    onClick={handleSendMeetingInvite}
                    disabled={meetingLoading || !meetingBody.trim() || !meetingMsgId || meetingSent}
                    className="w-full rounded-lg bg-purple-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
                  >
                    {meetingLoading ? 'Sending…' : 'Approve & Send invite →'}
                  </button>
                </div>
              )}

              {/* Prompt to generate if no draft yet and no error */}
              {!meetingBody && !meetingLoading && !noSchedulingLink && !meetingError && (
                <div className="rounded-xl border border-purple-800/20 bg-purple-950/10 p-5 text-center space-y-3">
                  <p className="text-sm text-purple-300 font-medium">Ready to schedule a call?</p>
                  <p className="text-xs text-gray-600">
                    AI will draft a short meeting request with your booking link.
                  </p>
                  <button
                    onClick={handleGenerateMeetingInvite}
                    className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600"
                  >
                    Generate invite →
                  </button>
                </div>
              )}
            </aside>
          )}

          {/* ── Right: meeting debrief panel (Tasks 5.1 & 5.2) ── */}
          {hasDebrief && (
            <aside className="space-y-4 lg:sticky lg:top-4">

              {debriefLoading && (
                <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 flex items-center gap-3 text-sm text-gray-500">
                  <svg className="h-4 w-4 shrink-0 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analysing meeting notes…
                </div>
              )}

              {debrief && !debriefLoading && (
                <>
                  <div className="rounded-xl border border-purple-800/30 bg-purple-950/10 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-purple-400">Meeting debrief</p>
                  </div>

                  {/* Gaps resolved */}
                  {debrief.gaps_resolved.length > 0 && (
                    <div className="rounded-xl border border-green-800/30 bg-green-950/10 p-4 space-y-2">
                      <p className="text-[11px] font-semibold text-green-400 uppercase tracking-wide">✓ Confirmed in meeting</p>
                      <ul className="space-y-1.5">
                        {debrief.gaps_resolved.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                            <span className="mt-0.5 shrink-0 text-green-600">✓</span>{item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* New concerns */}
                  {debrief.new_concerns.length > 0 && (
                    <div className="rounded-xl border border-red-800/30 bg-red-950/10 p-4 space-y-2">
                      <p className="text-[11px] font-semibold text-red-400 uppercase tracking-wide">⚠ New concerns</p>
                      <ul className="space-y-1.5">
                        {debrief.new_concerns.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                            <span className="mt-0.5 shrink-0 text-red-600">⚠</span>{item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* RFP refinements — shape what gets written in the RFP */}
                  {debrief.rfp_refinements.length > 0 && (
                    <div className="rounded-xl border border-blue-800/30 bg-blue-950/10 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide">📝 RFP refinements</p>
                        <span className="text-[10px] text-gray-600">Changes to write into RFP</span>
                      </div>
                      <ul className="space-y-2">
                        {debrief.rfp_refinements.map((item, i) => {
                          const noted = rfpNoted.has(item);
                          return (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                              <span className="mt-0.5 shrink-0 text-blue-600">→</span>
                              <span className="flex-1">{item}</span>
                              <button
                                onClick={() => toggleRfpNote(item, 'rfp_refinement')}
                                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${noted ? 'bg-blue-900/60 text-blue-300' : 'text-gray-600 hover:text-blue-400'}`}
                                title={noted ? 'Remove from RFP notes' : 'Save to RFP notes'}
                              >
                                {noted ? '✓ Saved' : '+ RFP'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Open questions — become [TO BE SPECIFIED] gaps in the RFP */}
                  {debrief.open_questions.length > 0 && (
                    <div className="rounded-xl border border-amber-800/30 bg-amber-950/10 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">❓ Still open</p>
                        <span className="text-[10px] text-gray-600">Gaps in the RFP</span>
                      </div>
                      <ul className="space-y-2">
                        {debrief.open_questions.map((item, i) => {
                          const noted = rfpNoted.has(item);
                          return (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                              <span className="mt-0.5 shrink-0 text-amber-600">?</span>
                              <span className="flex-1">{item}</span>
                              <button
                                onClick={() => toggleRfpNote(item, 'open_question')}
                                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${noted ? 'bg-amber-900/60 text-amber-300' : 'text-gray-600 hover:text-amber-400'}`}
                                title={noted ? 'Remove from RFP notes' : 'Flag as RFP gap'}
                              >
                                {noted ? '✓ Flagged' : '+ RFP'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {rfpNoted.size > 0 && (
                    <div className="rounded-lg bg-gray-800/60 px-3 py-2 flex items-center justify-between">
                      <p className="text-[11px] text-gray-500">
                        {rfpNoted.size} item{rfpNoted.size !== 1 ? 's' : ''} saved to brief RFP context
                      </p>
                      <a
                        href={`/biotech/briefs/${engagement?.brief_id}`}
                        className="text-[11px] text-blue-500 hover:text-blue-400 transition-colors"
                      >
                        View brief →
                      </a>
                    </div>
                  )}
                </>
              )}

              {/* Prompt to log notes when meeting_done but no debrief loaded */}
              {engagement.stage === 'meeting_done' && !debrief && !debriefLoading && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 text-center text-sm text-gray-600">
                  Meeting notes were saved but AI analysis is not available.
                </div>
              )}
            </aside>
          )}

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

      {/* ── Meeting notes modal (Task 5.1) ── */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Log meeting notes</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Paste your call notes or transcript. AI will analyse them and produce a debrief.
                  Any format accepted — bullets, prose, Otter.ai transcript, Zoom summary.
                </p>
              </div>
              <button
                onClick={() => { setShowNotesModal(false); setNotesError(''); }}
                className="text-gray-600 hover:text-gray-400 text-xl leading-none shrink-0"
              >×</button>
            </div>

            {/* Optional metadata */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Meeting date (optional)</label>
                <input
                  type="date"
                  value={meetingDateInput}
                  onChange={e => setMeetingDateInput(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Attendees (optional)</label>
                <input
                  type="text"
                  value={attendeesInput}
                  onChange={e => setAttendeesInput(e.target.value)}
                  placeholder="e.g. Dr. Chen (CRO), you"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            <textarea
              value={rawNotes}
              onChange={e => setRawNotes(e.target.value)}
              placeholder="Paste meeting notes or call transcript here…"
              rows={14}
              autoFocus
              className="w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />

            {notesError && <p className="text-xs text-red-400">⚠ {notesError}</p>}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowNotesModal(false); setNotesError(''); }}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogMeetingNotes}
                disabled={notesLoading || !rawNotes.trim()}
                className="rounded-lg bg-purple-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
              >
                {notesLoading ? 'Saving & analysing…' : 'Save & analyse →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
