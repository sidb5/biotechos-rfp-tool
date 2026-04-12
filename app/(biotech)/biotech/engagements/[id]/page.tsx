'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

interface GapAnalysis {
  confirmed:   string[];
  unaddressed: string[];
  concerns:    string[];
}

interface MessageAiMetadata {
  gap_analysis?:   GapAnalysis;
  resolved_items?: string[];
}

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
  ai_metadata?: MessageAiMetadata | null;
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
  rfp_draft:         'bg-blue-900/40 text-blue-300',
  rfp_sent:          'bg-indigo-900/60 text-indigo-300',
  awarded:           'bg-green-900/50 text-green-300',
  closed:            'bg-gray-800 text-gray-600',
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ── Collapsible panel used in the right sidebar ───────────────────────────────

function CollapsiblePanel({
  title,
  badge,
  defaultOpen = true,
  borderClass  = 'border-gray-700/60',
  bgClass      = 'bg-gray-900/60',
  titleClass   = 'text-gray-400',
  children,
}: {
  title:        string;
  badge?:       string | number;
  defaultOpen?: boolean;
  borderClass?: string;
  bgClass?:     string;
  titleClass?:  string;
  children:     React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left gap-2"
      >
        <span className={`text-[11px] font-semibold uppercase tracking-widest ${titleClass}`}>
          {title}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {badge !== undefined && (
            <span className="text-[10px] text-gray-600 font-normal">({badge})</span>
          )}
          <svg
            className={`h-3 w-3 text-gray-600 transition-transform duration-150 ${open ? 'rotate-0' : '-rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  );
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

  // Task 3.3 — resolved gap tracking
  const [resolvedGapItems, setResolvedGapItems] = useState<Set<string>>(new Set());
  const [resolvingItem, setResolvingItem]       = useState<string | null>(null);

  // Compact thread — track which messages the user has expanded beyond 4 lines
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  function toggleMsgExpand(id: string) {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState('');
  const [sendSuccess, setSendSuccess]       = useState(false);

  // Meeting invite (Task 4.1)
  const [showMeetingPanel, setShowMeetingPanel] = useState(false); // panel visible (not auto-gen)
  const [meetingSubject, setMeetingSubject]     = useState('');
  const [meetingBody, setMeetingBody]           = useState('');
  const [meetingMsgId, setMeetingMsgId]         = useState<string | null>(null);
  const [meetingLoading, setMeetingLoading]     = useState(false);
  const [meetingError, setMeetingError]         = useState('');
  const [meetingSent, setMeetingSent]           = useState(false);
  const [noSchedulingLink, setNoSchedulingLink] = useState(false);

  function closeMeetingPanel() {
    setShowMeetingPanel(false);
    // Only clear if not yet sent — preserve sent state for display in thread
    if (!meetingSent) {
      setMeetingBody('');
      setMeetingSubject('');
      setMeetingMsgId(null);
      setMeetingError('');
      setNoSchedulingLink(false);
    }
  }

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
        .select('id, direction, message_type, subject, body, status, sent_at, created_at, ai_generated, ai_metadata')
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
      setEngagement(engData as unknown as Engagement);
      // Restore + RFP selections from the brief's persisted notes
      const savedNotes = ((engData as unknown as Engagement).rfp_internal_briefs?.rfp_context_notes ?? []) as RfpNote[];
      setRfpNoted(new Map(savedNotes.map(n => [n.text, n.id])));
    }
    if (msgData) {
      setMessages(msgData as Message[]);
      // Restore any existing followup draft + its gap analysis
      const existingFollowup = (msgData as Message[]).find(
        m => m.direction === 'outbound' && m.message_type === 'followup' && m.status === 'draft'
      );
      if (existingFollowup) {
        setDraftSubject(existingFollowup.subject ?? '');
        setDraftBody(existingFollowup.body ?? '');
        setDraftMsgId(existingFollowup.id);
        // Restore gap analysis from ai_metadata (persisted when draft was created)
        const meta = existingFollowup.ai_metadata as MessageAiMetadata | null;
        if (meta?.gap_analysis) {
          setFollowup(prev => prev ?? {
            gap_analysis:        meta.gap_analysis!,
            draft_subject:       existingFollowup.subject ?? '',
            draft_reply:         existingFollowup.body    ?? '',
            suggested_questions: [],
          } as FollowupOutput);
        }
        if (meta?.resolved_items) {
          setResolvedGapItems(new Set(meta.resolved_items));
        }
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
    setResolvedGapItems(new Set());
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
        setRfpNoted(prev => new Map(Array.from(prev).concat([[text, json.note_id as string]])));
      }
    }
  }

  // ── Toggle gap item resolved (Task 3.3) ──────────────────────────────────

  async function toggleResolvedGap(itemText: string) {
    if (!draftMsgId) return;
    setResolvingItem(itemText);

    const isCurrentlyResolved = resolvedGapItems.has(itemText);
    const willBeResolved = !isCurrentlyResolved;

    // Optimistic update
    setResolvedGapItems(prev => {
      const next = new Set(prev);
      willBeResolved ? next.add(itemText) : next.delete(itemText);
      return next;
    });

    try {
      await fetch(`/api/biotech/engagements/${engagementId}/gap-resolve`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message_id: draftMsgId,
          item_text:  itemText,
          resolved:   willBeResolved,
        }),
      });
    } catch {
      // Rollback on failure
      setResolvedGapItems(prev => {
        const next = new Set(prev);
        willBeResolved ? next.delete(itemText) : next.add(itemText);
        return next;
      });
    }
    setResolvingItem(null);
  }

  // ── Delete draft engagement ──────────────────────────────────────────────

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [deleteError, setDeleteError]     = useState('');

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      const res  = await fetch(`/api/biotech/engagements/${engagementId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        setDeleteError((json.error as string) ?? 'Failed to delete');
        setDeleting(false);
        setDeleteConfirm(false);
        return;
      }
      // Redirect to engagements list after deletion
      router.push('/biotech/engagements');
    } catch {
      setDeleteError('Network error — please retry');
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  // ── Mark engagement outcome (awarded / closed) ───────────────────────────

  const [markingStage, setMarkingStage] = useState<string | null>(null);
  const [markStageError, setMarkStageError] = useState('');

  async function handleMarkStage(newStage: 'awarded' | 'closed' | 'rfp_sent') {
    setMarkingStage(newStage);
    setMarkStageError('');
    try {
      const res = await fetch(`/api/biotech/engagements/${engagementId}/stage`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stage: newStage }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMarkStageError((json.error as string) ?? 'Failed to update stage');
      } else {
        await loadThread();
      }
    } catch {
      setMarkStageError('Network error — please retry');
    }
    setMarkingStage(null);
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
  // Can log a CRO response at any active stage — including after RFP sent (loopback)
  const canLogResponse      = ['enquiry_sent', 'followup_sent', 'meeting_scheduled',
                               'meeting_done', 'rfp_draft', 'rfp_sent'].includes(engagement.stage);
  // Followup draft panel shows whenever a draft exists or we're in that stage
  const hasFollowupDraft    = engagement.stage === 'followup_draft'
    || (engagement.stage === 'meeting_done' && !!draftMsgId);
  // Can schedule a meeting after followups, after a previous meeting, or even after RFP sent
  const canScheduleMeeting  = ['followup_sent', 'meeting_done', 'rfp_draft', 'rfp_sent'].includes(engagement.stage);
  const hasMeetingDraft     = !!meetingMsgId && !meetingSent;
  // Can log meeting notes when a meeting is scheduled OR to log a second/follow-up meeting
  const canLogMeetingNotes  = ['meeting_scheduled', 'meeting_done', 'rfp_draft', 'rfp_sent'].includes(engagement.stage);
  const hasDebrief          = !!debrief || debriefLoading || engagement.stage === 'meeting_done';
  // Show RFP shortcut at meeting_done and beyond
  const canGoToRfp          = ['meeting_done', 'rfp_draft', 'rfp_sent'].includes(engagement.stage);
  // Can mark as awarded or closed at terminal stages
  const canMarkOutcome      = ['rfp_sent', 'rfp_draft', 'meeting_done'].includes(engagement.stage);
  // Can revert from an outcome back to rfp_sent (undo mis-click)
  const canRevertOutcome    = ['awarded', 'closed'].includes(engagement.stage);
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
              {canScheduleMeeting && !hasMeetingDraft && !meetingSent && (
                <button
                  onClick={() => setShowMeetingPanel(true)}
                  className="shrink-0 rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600"
                >
                  📅 Schedule meeting
                </button>
              )}
              {canLogMeetingNotes && (
                <button
                  onClick={() => setShowNotesModal(true)}
                  className="shrink-0 rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600"
                >
                  📋 {engagement.stage === 'meeting_done' ? 'Log another meeting' : 'Log meeting notes'}
                </button>
              )}
              {canGoToRfp && (
                <a
                  href={`/biotech/briefs/${engagement.brief_id}/rfp`}
                  className="shrink-0 rounded-lg border border-blue-600/50 bg-blue-600/10 px-4 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-600/20 hover:text-blue-200"
                >
                  📄 {engagement.stage === 'rfp_sent' ? 'View / Resend RFP' : 'Build RFP →'}
                </a>
              )}
              {canMarkOutcome && (
                <>
                  <button
                    onClick={() => handleMarkStage('awarded')}
                    disabled={markingStage !== null}
                    className="shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                  >
                    {markingStage === 'awarded' ? 'Saving…' : '🏆 Mark awarded'}
                  </button>
                  <button
                    onClick={() => handleMarkStage('closed')}
                    disabled={markingStage !== null}
                    className="shrink-0 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200 disabled:opacity-50"
                  >
                    {markingStage === 'closed' ? 'Saving…' : 'Mark closed'}
                  </button>
                </>
              )}
              {canRevertOutcome && (
                <button
                  onClick={() => handleMarkStage('rfp_sent')}
                  disabled={markingStage !== null}
                  className="shrink-0 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-gray-500 hover:text-gray-300 disabled:opacity-50"
                  title="Revert to RFP sent — undo outcome mark"
                >
                  {markingStage === 'rfp_sent' ? 'Reverting…' : '↩ Revert to RFP sent'}
                </button>
              )}
              {markStageError && (
                <p className="text-xs text-red-400">⚠ {markStageError}</p>
              )}

              {/* Delete draft — only available before the enquiry is sent */}
              {isEnquiryDraft && (
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-800">
                  {!deleteConfirm ? (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-red-800 hover:text-red-400"
                    >
                      Delete draft
                    </button>
                  ) : (
                    <>
                      <span className="text-xs text-gray-500 shrink-0">Delete this draft?</span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                      >
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => { setDeleteConfirm(false); setDeleteError(''); }}
                        disabled={deleting}
                        className="shrink-0 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {deleteError && <p className="text-xs text-red-400">⚠ {deleteError}</p>}
                </div>
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
        <div className={`grid gap-6 items-start ${(followup || followupLoading || hasFollowupDraft || showMeetingPanel || hasMeetingDraft || hasDebrief) ? 'grid-cols-1 lg:grid-cols-[1fr_400px]' : 'grid-cols-1'}`}>

          {/* ── Left: message thread ── */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Thread</h2>

            {/* ── "Still need to know" card (Task 3.3) ── */}
            {followup?.gap_analysis && (() => {
              const openItems = [
                ...followup.gap_analysis.unaddressed,
                ...followup.gap_analysis.concerns,
              ].filter(item => !resolvedGapItems.has(item));
              if (openItems.length === 0) return null;
              return (
                <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                      ⚠ Still need to know ({openItems.length})
                    </p>
                    <p className="text-[10px] text-gray-600">Mark resolved in gap analysis →</p>
                  </div>
                  <ul className="space-y-1">
                    {openItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                        <span className="mt-0.5 shrink-0">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

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

                      {/* Body — compact (4 lines) with Show more toggle */}
                      {(() => {
                        const bodyText = msg.body ?? '';
                        // Draft messages and the latest message start expanded
                        const autoExpand = isDraft || msg.id === messages[messages.length - 1]?.id;
                        const isExpanded = autoExpand || expandedMessages.has(msg.id);
                        const needsToggle = bodyText.length > 280 && !autoExpand;
                        return (
                          <div>
                            <p className={`text-sm text-gray-300 whitespace-pre-wrap leading-relaxed ${
                              !isExpanded ? 'line-clamp-4' : ''
                            }`}>
                              {bodyText}
                            </p>
                            {needsToggle && (
                              <button
                                onClick={() => toggleMsgExpand(msg.id)}
                                className="mt-1 text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
                              >
                                {isExpanded ? '▴ Show less' : '▾ Show more'}
                              </button>
                            )}
                          </div>
                        );
                      })()}

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

          {/* ── Right: consolidated sticky panel ── */}
          {(showMeetingPanel || hasMeetingDraft || hasDebrief || followup || followupLoading || hasFollowupDraft) && (
            <aside className="space-y-3 lg:sticky lg:top-4 max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">

          {/* ══ Meeting invite ══ */}
          {(showMeetingPanel || hasMeetingDraft) && (<div className="space-y-3">

              {/* Panel header with cancel */}
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-purple-400">
                  📅 Meeting invite
                </h3>
                {!meetingSent && (
                  <button
                    onClick={closeMeetingPanel}
                    className="text-xs text-gray-600 hover:text-gray-300 transition-colors border border-gray-700 hover:border-gray-500 rounded px-2 py-1"
                  >
                    ✕ Cancel
                  </button>
                )}
              </div>

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

              {/* Step 1: Generate prompt — shown before generating */}
              {!meetingBody && !meetingLoading && !noSchedulingLink && (
                <div className="rounded-xl border border-purple-800/30 bg-purple-950/10 p-5 space-y-4">
                  <div>
                    <p className="text-sm text-gray-300 font-medium mb-1">AI-draft a meeting request</p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Claude will write a short professional meeting request email
                      with your booking link included. You can edit it before sending.
                    </p>
                  </div>
                  {meetingError && (
                    <p className="text-xs text-red-400 rounded-lg border border-red-800/40 bg-red-950/20 px-3 py-2">
                      ⚠ {meetingError}
                    </p>
                  )}
                  <button
                    onClick={handleGenerateMeetingInvite}
                    className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-950"
                  >
                    ✦ Generate invite draft →
                  </button>
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

              {/* Step 2: Draft editor — shown after generation */}
              {meetingBody && !meetingLoading && (
                <div className="rounded-xl border border-purple-800/30 bg-purple-950/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-purple-400">
                      Review &amp; edit draft
                    </p>
                    <button
                      onClick={() => { setMeetingBody(''); setMeetingMsgId(null); setMeetingError(''); handleGenerateMeetingInvite(); }}
                      className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      ↺ Re-draft
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">Subject</p>
                    <input
                      type="text"
                      value={meetingSubject}
                      onChange={e => setMeetingSubject(e.target.value)}
                      disabled={meetingSent}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">Message</p>
                    <textarea
                      value={meetingBody}
                      onChange={e => setMeetingBody(e.target.value)}
                      disabled={meetingSent}
                      rows={9}
                      className="w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>

                  {meetingError && <p className="text-xs text-red-400">⚠ {meetingError}</p>}
                  {meetingSent  && (
                    <p className="text-xs text-green-400">
                      ✓ Meeting invite sent — stage updated to &quot;Meeting scheduled&quot;
                    </p>
                  )}

                  {!meetingSent && (
                    <button
                      onClick={handleSendMeetingInvite}
                      disabled={meetingLoading || !meetingBody.trim() || !meetingMsgId}
                      className="w-full rounded-lg bg-purple-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
                    >
                      {meetingLoading ? 'Sending…' : 'Approve & Send invite →'}
                    </button>
                  )}
                </div>
              )}
          </div>)}

          {/* ══ Meeting debrief ══ */}
          {hasDebrief && (<div className="space-y-3">

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
                  {/* Section label */}
                  <div className="px-1 pt-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500">Meeting debrief</p>
                  </div>

                  {/* ✓ Confirmed in meeting */}
                  {debrief.gaps_resolved.length > 0 && (
                    <CollapsiblePanel
                      title="✓ Confirmed in meeting"
                      badge={debrief.gaps_resolved.length}
                      defaultOpen={true}
                      borderClass="border-green-800/30"
                      bgClass="bg-green-950/10"
                      titleClass="text-green-400"
                    >
                      <ul className="space-y-1.5">
                        {debrief.gaps_resolved.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                            <span className="mt-0.5 shrink-0 text-green-600">✓</span>{item}
                          </li>
                        ))}
                      </ul>
                    </CollapsiblePanel>
                  )}

                  {/* ⚠ New concerns */}
                  {debrief.new_concerns.length > 0 && (
                    <CollapsiblePanel
                      title="⚠ New concerns"
                      badge={debrief.new_concerns.length}
                      defaultOpen={true}
                      borderClass="border-red-800/30"
                      bgClass="bg-red-950/10"
                      titleClass="text-red-400"
                    >
                      <ul className="space-y-1.5">
                        {debrief.new_concerns.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                            <span className="mt-0.5 shrink-0 text-red-600">⚠</span>{item}
                          </li>
                        ))}
                      </ul>
                    </CollapsiblePanel>
                  )}

                  {/* 📝 RFP refinements */}
                  {debrief.rfp_refinements.length > 0 && (
                    <CollapsiblePanel
                      title="📝 RFP refinements"
                      badge={debrief.rfp_refinements.length}
                      defaultOpen={true}
                      borderClass="border-blue-800/30"
                      bgClass="bg-blue-950/10"
                      titleClass="text-blue-400"
                    >
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
                              >
                                {noted ? '✓ Saved' : '+ RFP'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </CollapsiblePanel>
                  )}

                  {/* ❓ Still open */}
                  {debrief.open_questions.length > 0 && (
                    <CollapsiblePanel
                      title="❓ Still open"
                      badge={debrief.open_questions.length}
                      defaultOpen={true}
                      borderClass="border-amber-800/30"
                      bgClass="bg-amber-950/10"
                      titleClass="text-amber-400"
                    >
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
                              >
                                {noted ? '✓ Flagged' : '+ RFP'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </CollapsiblePanel>
                  )}

                  {rfpNoted.size > 0 && (
                    <div className="rounded-lg bg-gray-800/60 px-3 py-2 flex items-center justify-between">
                      <p className="text-[11px] text-gray-500">
                        {rfpNoted.size} item{rfpNoted.size !== 1 ? 's' : ''} saved to RFP context
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

              {engagement.stage === 'meeting_done' && !debrief && !debriefLoading && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 text-center text-xs text-gray-600">
                  Meeting notes saved — AI analysis not available.
                </div>
              )}
          </div>)}

          {/* ══ AI followup ══ */}
          {(followup || followupLoading || hasFollowupDraft) && (<div className="space-y-3">

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
                  {/* Gap analysis — collapsible */}
                  <CollapsiblePanel
                    title="Gap analysis"
                    badge={[...followup.gap_analysis.unaddressed, ...followup.gap_analysis.concerns].filter(i => !resolvedGapItems.has(i)).length || undefined}
                    defaultOpen={true}
                  >
                    {followup.gap_analysis.confirmed.length > 0 && (
                      <div className="mb-2">
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
                        <ul className="space-y-1.5">
                          {followup.gap_analysis.unaddressed.map((item, i) => {
                            const resolved = resolvedGapItems.has(item);
                            return (
                              <li key={i} className={`flex items-start gap-2 text-xs transition-opacity ${resolved ? 'opacity-40' : ''}`}>
                                <span className="mt-0.5 shrink-0 text-amber-600">?</span>
                                <span className={`flex-1 ${resolved ? 'line-through text-gray-600' : 'text-gray-400'}`}>{item}</span>
                                <button
                                  onClick={() => toggleResolvedGap(item)}
                                  disabled={resolvingItem === item}
                                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                    resolved
                                      ? 'bg-green-900/40 text-green-400 hover:bg-gray-800'
                                      : 'text-gray-600 hover:text-green-400'
                                  }`}
                                  title={resolved ? 'Mark unresolved' : 'Mark resolved'}
                                >
                                  {resolved ? '✓ Resolved' : 'Resolve'}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {followup.gap_analysis.concerns.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-red-400 mb-1.5">⚠ Concerns</p>
                        <ul className="space-y-1.5">
                          {followup.gap_analysis.concerns.map((item, i) => {
                            const resolved = resolvedGapItems.has(item);
                            return (
                              <li key={i} className={`flex items-start gap-2 text-xs transition-opacity ${resolved ? 'opacity-40' : ''}`}>
                                <span className="mt-0.5 shrink-0 text-red-600">⚠</span>
                                <span className={`flex-1 ${resolved ? 'line-through text-gray-600' : 'text-gray-400'}`}>{item}</span>
                                <button
                                  onClick={() => toggleResolvedGap(item)}
                                  disabled={resolvingItem === item}
                                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                    resolved
                                      ? 'bg-green-900/40 text-green-400 hover:bg-gray-800'
                                      : 'text-gray-600 hover:text-green-400'
                                  }`}
                                  title={resolved ? 'Mark unresolved' : 'Mark resolved'}
                                >
                                  {resolved ? '✓ Resolved' : 'Resolve'}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </CollapsiblePanel>

                  {/* Suggested questions */}
                  {followup.suggested_questions.length > 0 && (
                    <CollapsiblePanel
                      title="Suggested questions"
                      badge={followup.suggested_questions.length}
                      defaultOpen={false}
                    >
                      <p className="text-[10px] text-gray-600 mb-2">Check to insert into reply</p>
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
                    </CollapsiblePanel>
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
          </div>)}

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
