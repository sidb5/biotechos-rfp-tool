'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
  id:               string;
  cro_name:         string;
  cro_email:        string;
  stage:            string;
  brief_id:         string;
  quoted_amount:    number | null;
  quoted_currency:  string | null;
  quoted_timeline:  string | null;
  quote_valid_until: string | null;
  quote_notes:      string | null;
  rfp_internal_briefs: { title: string | null; rfp_context_notes: RfpNote[] } | null;
}

// ── Tagged item (unified across email + meeting sources) ──────────────────────
interface TaggedItem {
  text:   string;
  source: 'email' | 'meeting';
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
  quote_received:    'Quote received',
  awarded:           'Awarded',
  closed:            'Closed',
};

const STAGE_COLOR: Record<string, string> = {
  enquiry_sent:      'bg-blue-50 text-blue-700',
  response_received: 'bg-amber-50 text-amber-700',
  followup_draft:    'bg-gray-100 text-gray-500',
  followup_sent:     'bg-blue-50 text-blue-700',
  meeting_scheduled: 'bg-purple-50 text-purple-700',
  meeting_done:      'bg-purple-50 text-purple-700',
  rfp_draft:         'bg-blue-50 text-blue-700',
  rfp_sent:          'bg-indigo-50 text-indigo-700',
  quote_received:    'bg-teal-50 text-teal-700',
  awarded:           'bg-green-50 text-green-700',
  closed:            'bg-gray-100 text-gray-500',
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function Spinner({ color = 'blue' }: { color?: string }) {
  return (
    <svg className={`h-4 w-4 shrink-0 animate-spin text-${color}-500`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SourceTag({ source }: { source: 'email' | 'meeting' }) {
  return source === 'meeting' ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300 ml-1.5 align-middle">
      meeting
    </span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/60 text-gray-600 dark:bg-gray-700 dark:text-gray-300 ml-1.5 align-middle">
      email
    </span>
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
  const [showPasteModal, setShowPasteModal]   = useState(false);
  const [pastedResponse, setPastedResponse]   = useState('');
  const [pasteLoading, setPasteLoading]       = useState(false);
  const [pasteError, setPasteError]           = useState('');

  // AI followup
  const [followup, setFollowup]               = useState<FollowupOutput | null>(null);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError]     = useState('');

  // Draft reply editor
  const [draftSubject, setDraftSubject]       = useState('');
  const [draftBody, setDraftBody]             = useState('');
  const [draftMsgId, setDraftMsgId]           = useState<string | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());

  // Resolved gap tracking
  const [resolvedGapItems, setResolvedGapItems] = useState<Set<string>>(new Set());
  const [resolvingItem, setResolvingItem]       = useState<string | null>(null);

  // Message expansion — track toggled-from-default state
  // Presence means "flipped": auto-expand + toggled = collapsed; not-auto + toggled = expanded
  const [toggledMessages, setToggledMessages] = useState<Set<string>>(new Set());
  function toggleMsgExpand(id: string) {
    setToggledMessages(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const [sending, setSending]         = useState(false);
  const [sendError, setSendError]     = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);

  // Meeting invite — now a modal
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingSubject, setMeetingSubject]     = useState('');
  const [meetingBody, setMeetingBody]           = useState('');
  const [meetingMsgId, setMeetingMsgId]         = useState<string | null>(null);
  const [meetingLoading, setMeetingLoading]     = useState(false);
  const [meetingError, setMeetingError]         = useState('');
  const [meetingSent, setMeetingSent]           = useState(false);
  const [noSchedulingLink, setNoSchedulingLink] = useState(false);

  function closeMeetingModal() {
    setShowMeetingModal(false);
    if (!meetingSent) {
      setMeetingBody('');
      setMeetingSubject('');
      setMeetingMsgId(null);
      setMeetingError('');
      setNoSchedulingLink(false);
    }
  }

  // Meeting notes modal — same flow, different source tag
  const [showNotesModal, setShowNotesModal]     = useState(false);
  const [rawNotes, setRawNotes]                 = useState('');
  const [meetingDateInput, setMeetingDateInput] = useState('');
  const [attendeesInput, setAttendeesInput]     = useState('');
  const [notesLoading, setNotesLoading]         = useState(false);
  const [notesError, setNotesError]             = useState('');
  const [debrief, setDebrief]                   = useState<DebriefOutput | null>(null);
  const [debriefLoading, setDebriefLoading]     = useState(false);
  const [rfpNoted, setRfpNoted]                 = useState<Map<string, string>>(new Map());

  // Show-more for follow-up list
  const [showAllFollowup, setShowAllFollowup] = useState(false);

  // Items flagged to incorporate into the draft
  const [addedToDraft, setAddedToDraft]           = useState<Set<string>>(new Set());
  const [regeneratingDraft, setRegeneratingDraft] = useState(false);
  const [regenerateError, setRegenerateError]     = useState('');
  // Tracks resolved count at the time of last successful regen — suppresses amber banner until new resolutions
  const [resolvedAtLastRegen, setResolvedAtLastRegen] = useState(0);

  function addItemToDraft(text: string) {
    setAddedToDraft(prev => new Set(prev).add(text));
  }

  async function regenerateDraft() {
    if (!draftBody.trim()) return;
    setRegeneratingDraft(true);
    setRegenerateError('');
    try {
      const res = await fetch(`/api/biotech/engagements/${engagementId}/regenerate-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_subject: draftSubject,
          draft_body:    draftBody,
          extra_items:   Array.from(addedToDraft),
          cro_name:      engagement?.cro_name,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { draft_body: string; draft_subject: string };
      setDraftBody(data.draft_body);
      if (data.draft_subject) setDraftSubject(data.draft_subject);
      // Banners cleared: draft is now up to date
      setAddedToDraft(new Set());
      setResolvedAtLastRegen(resolvedGapItems.size);
    } catch {
      setRegenerateError('Regeneration failed — try again');
    } finally {
      setRegeneratingDraft(false);
    }
  }

  // Quote logging modal
  const [showQuoteModal, setShowQuoteModal]   = useState(false);
  const [quoteAmount, setQuoteAmount]         = useState('');
  const [quoteCurrency, setQuoteCurrency]     = useState('USD');
  const [quoteTimeline, setQuoteTimeline]     = useState('');
  const [quoteValidUntil, setQuoteValidUntil] = useState('');
  const [quoteNotes, setQuoteNotes]           = useState('');
  const [savingQuote, setSavingQuote]         = useState(false);
  const [quoteError, setQuoteError]           = useState('');

  async function handleSaveQuote() {
    if (!quoteAmount.trim() || !engagement) return;
    setSavingQuote(true); setQuoteError('');
    try {
      const res = await fetch(`/api/biotech/engagements/${engagementId}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoted_amount:    parseFloat(quoteAmount),
          quoted_currency:  quoteCurrency,
          quoted_timeline:  quoteTimeline,
          quote_valid_until: quoteValidUntil || null,
          quote_notes:      quoteNotes,
        }),
      });
      if (!res.ok) throw new Error('Failed to save quote');
      setShowQuoteModal(false);
      await loadThread();
    } catch {
      setQuoteError('Failed to save — please retry');
    } finally {
      setSavingQuote(false);
    }
  }

  // Delete + stage controls
  const [deleteConfirm, setDeleteConfirm]   = useState(false);
  const [deleting, setDeleting]             = useState(false);
  const [deleteError, setDeleteError]       = useState('');
  const [markingStage, setMarkingStage]     = useState<string | null>(null);
  const [markStageError, setMarkStageError] = useState('');

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadThread = useCallback(async () => {
    const [{ data: engData }, { data: msgData }, { data: meetingData }] = await Promise.all([
      supabase
        .from('cro_engagements')
        .select('id, cro_name, cro_email, stage, brief_id, quoted_amount, quoted_currency, quoted_timeline, quote_valid_until, quote_notes, rfp_internal_briefs(title, rfp_context_notes)')
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
      const savedNotes = ((engData as unknown as Engagement).rfp_internal_briefs?.rfp_context_notes ?? []) as RfpNote[];
      setRfpNoted(new Map(savedNotes.map(n => [n.text, n.id])));
    }
    if (msgData) {
      setMessages(msgData as Message[]);
      const existingFollowup = (msgData as Message[]).find(
        m => m.direction === 'outbound' && m.message_type === 'followup' && m.status === 'draft'
      );
      if (existingFollowup) {
        setDraftSubject(existingFollowup.subject ?? '');
        setDraftBody(existingFollowup.body ?? '');
        setDraftMsgId(existingFollowup.id);
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
      const existingMeeting = (msgData as Message[]).find(
        m => m.direction === 'outbound' && m.message_type === 'meeting_invite' && m.status === 'draft'
      );
      if (existingMeeting) {
        setMeetingSubject(existingMeeting.subject ?? '');
        setMeetingBody(existingMeeting.body ?? '');
        setMeetingMsgId(existingMeeting.id);
      }
    }
    if (meetingData?.ai_summary) {
      setDebrief(meetingData.ai_summary as DebriefOutput);
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

  // ── Handlers (all unchanged) ──────────────────────────────────────────────

  async function handleLogResponse() {
    if (!pastedResponse.trim()) return;
    setPasteLoading(true);
    setPasteError('');
    setFollowupLoading(true);
    try {
      const res  = await fetch(`/api/biotech/engagements/${engagementId}/inbound`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_text: pastedResponse.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPasteError((json.error as string) ?? 'Failed to save response');
        setPasteLoading(false); setFollowupLoading(false); return;
      }
      setShowPasteModal(false); setPastedResponse(''); setPasteLoading(false);
      await loadThread();
      if (json.followup) {
        setFollowup(json.followup as FollowupOutput);
        setDraftSubject((json.followup as FollowupOutput).draft_subject);
        setDraftBody((json.followup as FollowupOutput).draft_reply);
        setDraftMsgId(json.draft_message_id as string | null);
      } else if (json.ai_error) {
        setFollowupError(json.ai_error as string);
      }
    } catch {
      setPasteError('Network error — please try again'); setPasteLoading(false);
    }
    setFollowupLoading(false);
  }

  function toggleQuestion(idx: number) {
    if (!followup) return;
    const question = followup.suggested_questions[idx];
    setSelectedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
        setDraftBody(b => b.replace(`\n\n${question}`, '').replace(`${question}\n\n`, ''));
      } else {
        next.add(idx);
        setDraftBody(b => b.trimEnd() + `\n\n${question}`);
      }
      return next;
    });
  }

  async function handleSend() {
    if (!draftMsgId || !draftBody.trim()) return;
    setSending(true); setSendError('');
    const res  = await fetch(`/api/biotech/engagements/${engagementId}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: draftMsgId, subject: draftSubject, body: draftBody }),
    });
    const json = await res.json();
    if (!res.ok || !json.sent) {
      setSendError((json.error as string) ?? 'Send failed — please retry');
      setSending(false); return;
    }
    setSendSuccess(true); setSending(false);
    setFollowup(null); setResolvedGapItems(new Set());
    await loadThread();
  }

  async function toggleRfpNote(text: string, type: 'rfp_refinement' | 'open_question') {
    if (!engagement) return;
    if (rfpNoted.has(text)) {
      const noteId = rfpNoted.get(text)!;
      await fetch(`/api/biotech/briefs/${engagement.brief_id}/rfp-notes`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId }),
      });
      setRfpNoted(prev => { const m = new Map(prev); m.delete(text); return m; });
    } else {
      const res  = await fetch(`/api/biotech/briefs/${engagement.brief_id}/rfp-notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type, source_engagement_id: engagementId, source_cro_name: engagement.cro_name }),
      });
      const json = await res.json();
      if (res.ok && json.note_id) {
        setRfpNoted(prev => new Map(Array.from(prev).concat([[text, json.note_id as string]])));
      }
    }
  }

  async function toggleResolvedGap(itemText: string) {
    if (!draftMsgId) return;
    setResolvingItem(itemText);
    const willBeResolved = !resolvedGapItems.has(itemText);
    setResolvedGapItems(prev => {
      const next = new Set(prev);
      willBeResolved ? next.add(itemText) : next.delete(itemText);
      return next;
    });
    try {
      await fetch(`/api/biotech/engagements/${engagementId}/gap-resolve`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: draftMsgId, item_text: itemText, resolved: willBeResolved }),
      });
    } catch {
      setResolvedGapItems(prev => {
        const next = new Set(prev);
        willBeResolved ? next.delete(itemText) : next.add(itemText);
        return next;
      });
    }
    setResolvingItem(null);
  }

  async function handleDelete() {
    setDeleting(true); setDeleteError('');
    try {
      const res  = await fetch(`/api/biotech/engagements/${engagementId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        setDeleteError((json.error as string) ?? 'Failed to delete');
        setDeleting(false); setDeleteConfirm(false); return;
      }
      router.push('/biotech/engagements');
    } catch {
      setDeleteError('Network error — please retry');
      setDeleting(false); setDeleteConfirm(false);
    }
  }

  async function handleMarkStage(newStage: 'awarded' | 'closed' | 'rfp_sent') {
    setMarkingStage(newStage); setMarkStageError('');
    try {
      const res  = await fetch(`/api/biotech/engagements/${engagementId}/stage`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
      const json = await res.json();
      if (!res.ok) setMarkStageError((json.error as string) ?? 'Failed to update stage');
      else await loadThread();
    } catch {
      setMarkStageError('Network error — please retry');
    }
    setMarkingStage(null);
  }

  async function handleLogMeetingNotes() {
    if (!rawNotes.trim()) return;
    setNotesLoading(true); setNotesError(''); setDebriefLoading(true);
    try {
      const res  = await fetch(`/api/biotech/engagements/${engagementId}/meeting-notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: rawNotes.trim(), meeting_date: meetingDateInput || null, attendees: attendeesInput || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotesError((json.error as string) ?? 'Failed to save notes');
        setNotesLoading(false); setDebriefLoading(false); return;
      }
      setShowNotesModal(false); setRawNotes(''); setNotesLoading(false);
      await loadThread();
      if (json.debrief) setDebrief(json.debrief as DebriefOutput);
      else if (json.ai_error) setNotesError(json.ai_error as string);
    } catch {
      setNotesError('Network error — please try again'); setNotesLoading(false);
    }
    setDebriefLoading(false);
  }

  async function handleGenerateMeetingInvite() {
    setMeetingLoading(true); setMeetingError(''); setNoSchedulingLink(false);
    const res  = await fetch(`/api/biotech/engagements/${engagementId}/meeting-invite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    if (json.error === 'no_scheduling_link') { setNoSchedulingLink(true); setMeetingLoading(false); return; }
    if (!res.ok) { setMeetingError((json.error as string) ?? 'Failed to generate invite'); setMeetingLoading(false); return; }
    setMeetingSubject(json.subject as string);
    setMeetingBody(json.body as string);
    setMeetingMsgId(json.message_id as string);
    setMeetingLoading(false);
  }

  async function handleSendMeetingInvite() {
    if (!meetingMsgId || !meetingBody.trim()) return;
    setMeetingLoading(true); setMeetingError('');
    const res  = await fetch(`/api/biotech/engagements/${engagementId}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: meetingMsgId, subject: meetingSubject, body: meetingBody }),
    });
    const json = await res.json();
    if (!res.ok || !json.sent) {
      setMeetingError((json.error as string) ?? 'Send failed — please retry');
      setMeetingLoading(false); return;
    }
    setMeetingSent(true); setMeetingLoading(false);
    setShowMeetingModal(false);
    await loadThread();
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!engagement) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500 text-sm">
        Engagement not found.{' '}
        <a href="/biotech/engagements" className="ml-2 text-blue-400 hover:underline">Back</a>
      </div>
    );
  }

  const isEnquiryDraft     = engagement.stage === 'enquiry_draft';
  const canLogResponse     = ['enquiry_sent', 'followup_sent', 'meeting_scheduled',
                              'meeting_done', 'rfp_draft', 'rfp_sent'].includes(engagement.stage);
  const canScheduleMeeting = ['followup_sent', 'meeting_done', 'rfp_draft', 'rfp_sent'].includes(engagement.stage);
  const hasMeetingDraft    = !!meetingMsgId && !meetingSent;
  const canLogMeetingNotes = ['meeting_scheduled', 'meeting_done', 'rfp_draft', 'rfp_sent'].includes(engagement.stage);
  const canGoToRfp         = ['meeting_done', 'rfp_draft', 'rfp_sent'].includes(engagement.stage);
  const canLogQuote        = ['followup_sent', 'meeting_done', 'rfp_sent', 'quote_received'].includes(engagement.stage);
  const hasQuote           = engagement.stage === 'quote_received' && !!engagement.quoted_amount;
  const canMarkOutcome     = ['rfp_sent', 'rfp_draft', 'meeting_done', 'quote_received'].includes(engagement.stage);
  const canRevertOutcome   = ['awarded', 'closed'].includes(engagement.stage);
  const hasFollowupDraft   = engagement.stage === 'followup_draft' || (engagement.stage === 'meeting_done' && !!draftMsgId);
  const stageLabel         = STAGE_LABELS[engagement.stage] ?? engagement.stage;
  const stageColor         = STAGE_COLOR[engagement.stage] ?? 'bg-gray-100 text-gray-500';

  // Unified analysis: merge email followup + meeting debrief into tagged item lists
  const needsFollowupItems: (TaggedItem & { canResolve?: boolean })[] = [
    ...(followup?.gap_analysis.unaddressed ?? []).map(text => ({ text, source: 'email' as const, canResolve: true })),
    ...(followup?.gap_analysis.concerns    ?? []).map(text => ({ text, source: 'email' as const, canResolve: true })),
    ...(debrief?.new_concerns    ?? []).map(text => ({ text, source: 'meeting' as const })),
    ...(debrief?.open_questions  ?? []).map(text => ({ text, source: 'meeting' as const })),
  ];

  const confirmedItems: TaggedItem[] = [
    ...(followup?.gap_analysis.confirmed ?? []).map(text => ({ text, source: 'email' as const })),
    ...(debrief?.gaps_resolved           ?? []).map(text => ({ text, source: 'meeting' as const })),
  ];

  const rfpSuggestions: TaggedItem[] = [
    ...(debrief?.rfp_refinements ?? []).map(text => ({ text, source: 'meeting' as const })),
  ];

  const openNeedsFollowup = needsFollowupItems.filter(item =>
    item.source === 'email' ? !resolvedGapItems.has(item.text) : !addedToDraft.has(item.text)
  );

  // Show amber banner when user has resolved email items (draft may be stale)
  const showRegenerateBanner = resolvedGapItems.size > resolvedAtLastRegen && !!draftMsgId;

  const hasActionCard = followup || followupLoading || hasFollowupDraft || debrief || debriefLoading;

  // Thread: exclude drafts (they live in the action card above), latest at top
  const threadMessages = messages.filter(m => m.status !== 'draft');
  const reversedMessages = [...threadMessages].reverse();
  const latestMsgId      = threadMessages[threadMessages.length - 1]?.id;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-5xl px-5 py-10 space-y-6">

        {/* ── Header ── */}
        <header>
          <nav className="mb-1.5 text-xs text-gray-500">
            <a href="/biotech/dashboard" className="hover:text-gray-700 transition-colors">Dashboard</a>
            <span className="mx-1.5">/</span>
            <a href="/biotech/engagements" className="hover:text-gray-700 transition-colors">Engagements</a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-700">{engagement.cro_name}</span>
          </nav>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{engagement.cro_name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stageColor}`}>
                  {stageLabel}
                </span>
                <span className="text-xs text-gray-500">{engagement.cro_email}</span>
                {engagement.rfp_internal_briefs?.title && (
                  <a href={`/biotech/briefs/${engagement.brief_id}`}
                    className="text-xs text-blue-500 hover:text-blue-400 transition-colors">
                    Brief: {engagement.rfp_internal_briefs.title}
                  </a>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {canLogResponse && (
                <button onClick={() => setShowPasteModal(true)}
                  className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500">
                  + Log CRO response
                </button>
              )}
              {canScheduleMeeting && !hasMeetingDraft && !meetingSent && (
                <button onClick={() => setShowMeetingModal(true)}
                  className="shrink-0 rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600">
                  📅 Schedule meeting
                </button>
              )}
              {hasMeetingDraft && (
                <button onClick={() => setShowMeetingModal(true)}
                  className="shrink-0 rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100">
                  📅 Review meeting invite draft
                </button>
              )}
              {canLogMeetingNotes && (
                <button onClick={() => setShowNotesModal(true)}
                  className="shrink-0 rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600">
                  📋 {engagement.stage === 'meeting_done' ? 'Log another meeting' : 'Log meeting notes'}
                </button>
              )}
              {canGoToRfp && (
                <a href={`/biotech/briefs/${engagement.brief_id}/rfp`}
                  className="shrink-0 rounded-lg border border-blue-600/50 bg-blue-600/10 px-4 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-600/20 hover:text-blue-200">
                  📄 {engagement.stage === 'rfp_sent' ? 'View / Resend RFP' : 'Build RFP →'}
                </a>
              )}
              {canLogQuote && !hasQuote && (
                <button onClick={() => setShowQuoteModal(true)}
                  className="shrink-0 rounded-lg border border-teal-600/50 bg-teal-600/10 px-4 py-2 text-sm font-medium text-teal-300 transition-colors hover:bg-teal-600/20 hover:text-teal-200">
                  💰 Log quote received
                </button>
              )}
              {hasQuote && (
                <div className="flex items-center gap-2 rounded-lg border border-teal-600/40 bg-teal-900/20 px-4 py-2">
                  <span className="text-sm font-semibold text-teal-300">
                    {engagement.quoted_currency ?? 'USD'} {Number(engagement.quoted_amount).toLocaleString()}
                  </span>
                  {engagement.quoted_timeline && (
                    <span className="text-xs text-teal-500">· {engagement.quoted_timeline}</span>
                  )}
                  <button onClick={() => setShowQuoteModal(true)}
                    className="text-xs text-teal-500 hover:text-teal-300 transition-colors ml-1">
                    Edit
                  </button>
                </div>
              )}
              {canMarkOutcome && (
                <>
                  <button onClick={() => handleMarkStage('awarded')} disabled={markingStage !== null}
                    className="shrink-0 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50">
                    {markingStage === 'awarded' ? 'Saving…' : '🏆 Mark awarded'}
                  </button>
                  <button onClick={() => handleMarkStage('closed')} disabled={markingStage !== null}
                    className="shrink-0 rounded-lg bg-gray-100 border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-200 disabled:opacity-50">
                    {markingStage === 'closed' ? 'Saving…' : 'Mark closed'}
                  </button>
                </>
              )}
              {canRevertOutcome && (
                <button onClick={() => handleMarkStage('rfp_sent')} disabled={markingStage !== null}
                  className="shrink-0 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 disabled:opacity-50">
                  {markingStage === 'rfp_sent' ? 'Reverting…' : '↩ Revert to RFP sent'}
                </button>
              )}
              {markStageError && <p className="text-xs text-red-600">⚠ {markStageError}</p>}

              {isEnquiryDraft && (
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
                  {!deleteConfirm ? (
                    <button onClick={() => setDeleteConfirm(true)}
                      className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-red-300 hover:text-red-600">
                      Delete draft
                    </button>
                  ) : (
                    <>
                      <span className="text-xs text-gray-500 shrink-0">Delete this draft?</span>
                      <button onClick={handleDelete} disabled={deleting}
                        className="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50">
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button onClick={() => { setDeleteConfirm(false); setDeleteError(''); }} disabled={deleting}
                        className="shrink-0 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                        Cancel
                      </button>
                    </>
                  )}
                  {deleteError && <p className="text-xs text-red-600">⚠ {deleteError}</p>}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Enquiry not sent banner */}
        {isEnquiryDraft && (
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-amber-300">Enquiry not sent yet</p>
              <p className="text-xs text-amber-700 mt-0.5">
                The outreach email to {engagement.cro_name} hasn&apos;t been sent. Select CROs and send from the brief.
              </p>
            </div>
            <a href={`/biotech/briefs/${engagement.brief_id}`}
              className="shrink-0 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600">
              Back to brief →
            </a>
          </div>
        )}

        {/* ── ACTION CARD ── */}
        {hasActionCard && (
          <section className="rounded-2xl border border-gray-200 bg-gray-50 shadow-sm overflow-hidden">

            {/* Loading */}
            {(followupLoading || debriefLoading) && (
              <div className="px-6 py-5 flex items-center gap-3 text-sm text-gray-500">
                <Spinner color={debriefLoading ? 'purple' : 'blue'} />
                {debriefLoading ? 'Analysing meeting notes…' : 'Analysing response and drafting reply…'}
              </div>
            )}

            {followupError && (
              <div className="px-6 py-4 text-xs text-red-600 border-b border-gray-100">⚠ {followupError}</div>
            )}

            {/* Main content */}
            {(followup || debrief) && !followupLoading && !debriefLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">

                {/* ── LEFT: Analysis ── */}
                <div className="p-6 space-y-6">

                  {/* Needs follow-up */}
                  {openNeedsFollowup.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-800 dark:text-amber-300">
                          Needs follow-up
                        </span>
                        <span className="rounded-full bg-amber-200 text-amber-800 dark:bg-amber-700/50 dark:text-amber-200 text-[10px] font-semibold px-1.5 py-0.5">
                          {openNeedsFollowup.length}
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {(showAllFollowup ? openNeedsFollowup : openNeedsFollowup.slice(0, 5)).map((item, i) => {
                          const resolved  = item.source === 'email' && resolvedGapItems.has(item.text);
                          const inDraft   = addedToDraft.has(item.text);
                          return (
                            <li key={i} className={`flex items-start gap-2 transition-opacity ${resolved || inDraft ? 'opacity-40' : ''}`}>
                              <span className={`mt-0.5 shrink-0 text-xs ${item.source === 'email' ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}`}>
                                {item.source === 'email' ? '?' : '⚠'}
                              </span>
                              <span className={`flex-1 text-xs leading-relaxed ${resolved || inDraft ? 'line-through text-amber-400 dark:text-amber-600' : 'text-amber-900 dark:text-amber-100'}`}>
                                {item.text}
                                <SourceTag source={item.source} />
                              </span>
                              {/* Add to draft — all items */}
                              <button
                                onClick={() => addItemToDraft(item.text)}
                                disabled={inDraft}
                                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                  inDraft
                                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
                                    : 'text-amber-700 dark:text-amber-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                                }`}
                              >
                                {inDraft ? '✓ In draft' : '→ Draft'}
                              </button>
                              {/* Resolve — email items only */}
                              {item.canResolve && (
                                <button
                                  onClick={() => toggleResolvedGap(item.text)}
                                  disabled={resolvingItem === item.text}
                                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                    resolved
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                      : 'text-amber-700 dark:text-amber-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30'
                                  }`}
                                >
                                  {resolved ? '✓ Resolved' : 'Resolve'}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {openNeedsFollowup.length > 5 && (
                        <button
                          onClick={() => setShowAllFollowup(v => !v)}
                          className="text-[11px] text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 transition-colors mt-1"
                        >
                          {showAllFollowup
                            ? '↑ Show fewer'
                            : `↓ Show ${openNeedsFollowup.length - 5} more`}
                        </button>
                      )}
                    </div>
                  )}

                  {openNeedsFollowup.length === 0 && needsFollowupItems.length > 0 && (
                    <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-700/40 dark:bg-green-900/20 px-3 py-2.5 flex items-center gap-2 text-xs text-green-700 dark:text-green-300 font-medium">
                      <span>✓</span>
                      <span>All follow-up items resolved</span>
                    </div>
                  )}

                  {/* Confirmed — collapsed by default */}
                  {confirmedItems.length > 0 && (
                    <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-700/40 dark:bg-green-900/20 p-3">
                      <ConfirmedCollapsible items={confirmedItems} />
                    </div>
                  )}

                  {/* RFP scope updates — meeting refinements */}
                  {rfpSuggestions.length > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-700/40 dark:bg-blue-900/20 p-3 space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-blue-800 dark:text-blue-300">
                        RFP scope updates
                      </span>
                      <ul className="space-y-2">
                        {rfpSuggestions.map((item, i) => {
                          const saved = rfpNoted.has(item.text);
                          return (
                            <li key={i} className="flex items-start gap-2">
                              <span className="mt-0.5 shrink-0 text-xs text-blue-500 dark:text-blue-400">→</span>
                              <span className="flex-1 text-xs text-blue-900 dark:text-blue-100 leading-relaxed">
                                {item.text}
                                <SourceTag source={item.source} />
                              </span>
                              <button
                                onClick={() => toggleRfpNote(item.text, 'rfp_refinement')}
                                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                  saved
                                    ? 'bg-blue-200 text-blue-700 dark:bg-blue-800/50 dark:text-blue-200'
                                    : 'text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/40'
                                }`}
                              >
                                {saved ? '✓ Saved' : '+ Scope note'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {rfpNoted.size > 0 && (
                        <a href={`/biotech/briefs/${engagement?.brief_id}`}
                          className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors">
                          {rfpNoted.size} item{rfpNoted.size !== 1 ? 's' : ''} saved to RFP context · View brief →
                        </a>
                      )}
                    </div>
                  )}

                  {/* Suggested questions (secondary, collapsed) */}
                  {followup && followup.suggested_questions.length > 0 && (
                    <SuggestedQuestionsCollapsible
                      questions={followup.suggested_questions}
                      selected={selectedQuestions}
                      onToggle={toggleQuestion}
                    />
                  )}
                </div>

                {/* ── RIGHT: Draft reply / waiting state — always rendered when action card is visible ── */}
                <div className="p-6 space-y-4">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-600">
                      {followup || hasFollowupDraft ? 'Draft reply' : 'Next step'}
                    </span>

                    {/* Waiting state — persistent, shown whenever there's no draft to edit */}
                    {!followup && !hasFollowupDraft && (
                      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                        <div className={`rounded-full p-4 ${sendSuccess ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                          {sendSuccess ? (
                            <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="h-8 w-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {sendSuccess ? 'Follow-up sent' : 'Waiting for reply'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
                            Waiting for {engagement?.cro_name ?? 'CRO'} to reply. When they do, click <strong>+ Log CRO response</strong> above to continue the analysis.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Regenerate notice — shown when user has flagged items via → Draft */}
                    {(followup || hasFollowupDraft) && addedToDraft.size > 0 && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-center justify-between gap-3">
                        <p className="text-xs text-blue-700 leading-relaxed">
                          {addedToDraft.size} item{addedToDraft.size !== 1 ? 's' : ''} queued — regenerate to incorporate {addedToDraft.size !== 1 ? 'them' : 'it'} as proper sentences.
                        </p>
                        <button
                          onClick={regenerateDraft}
                          disabled={regeneratingDraft}
                          className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                        >
                          {regeneratingDraft ? 'Rewriting…' : '↺ Regenerate'}
                        </button>
                      </div>
                    )}
                    {regenerateError && <p className="text-xs text-red-600">⚠ {regenerateError}</p>}

                    {/* Editor + send button — only when a draft exists */}
                    {(followup || hasFollowupDraft) && (
                      <>
                        {/* Stale notice */}
                        {showRegenerateBanner && addedToDraft.size === 0 && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-center justify-between gap-3">
                            <p className="text-xs text-amber-700 leading-relaxed">
                              {resolvedGapItems.size - resolvedAtLastRegen} item{resolvedGapItems.size - resolvedAtLastRegen !== 1 ? 's' : ''} resolved — regenerate to clean up the draft.
                            </p>
                            <button
                              onClick={regenerateDraft}
                              disabled={regeneratingDraft}
                              className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
                            >
                              {regeneratingDraft ? 'Rewriting…' : '↺ Regenerate'}
                            </button>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-500">Subject</p>
                          <input type="text" value={draftSubject} onChange={e => setDraftSubject(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-500">Message</p>
                          <textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={12}
                            className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>

                        {sendError && <p className="text-xs text-red-600">⚠ {sendError}</p>}

                        <button onClick={handleSend} disabled={sending || !draftBody.trim() || !draftMsgId}
                          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400">
                          {sending ? 'Sending…' : 'Approve & Send →'}
                        </button>
                      </>
                    )}
                  </div>
              </div>
            )}
          </section>
        )}

        {/* ── THREAD — latest at top ── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600">Thread</h2>

          {messages.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              No messages yet in this engagement.
            </div>
          ) : (
            <div className="space-y-3">
              {reversedMessages.map(msg => {
                const isOut   = msg.direction === 'outbound';
                const isDraft = msg.status === 'draft';
                const isMeetingNote = msg.message_type === 'meeting_notes';
                const autoExpand    = isDraft || msg.id === latestMsgId;
                const toggled       = toggledMessages.has(msg.id);
                const isExpanded    = autoExpand ? !toggled : toggled;
                const bodyText      = msg.body ?? '';
                const needsToggle   = bodyText.length > 280;

                return (
                  <div key={msg.id} className={`rounded-xl border p-4 space-y-2 ${
                    isDraft       ? 'border-amber-800/30 bg-amber-950/20' :
                    isMeetingNote ? 'border-purple-100 bg-purple-50/50' :
                    isOut         ? 'border-blue-100 bg-blue-50' :
                                    'border-gray-200 bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          isDraft       ? 'bg-amber-50 text-amber-700' :
                          isMeetingNote ? 'bg-purple-100 text-purple-600' :
                          isOut         ? 'bg-blue-50 border border-blue-200 text-blue-600' :
                                          'bg-gray-100 text-gray-500'
                        }`}>
                          {isDraft ? 'Draft' : isMeetingNote ? 'Meeting notes' : isOut ? 'Sent' : 'Received'}
                        </span>
                        {!isMeetingNote && (
                          <span className="text-xs text-gray-500 capitalize">
                            {msg.message_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        {msg.ai_generated && (
                          <span className="text-[10px] text-gray-500">AI</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{fmt(msg.sent_at ?? msg.created_at)}</span>
                    </div>

                    {msg.subject && (
                      <p className="text-xs font-medium text-gray-700">Subject: {msg.subject}</p>
                    )}

                    <div>
                      <p className={`text-sm text-gray-800 whitespace-pre-wrap leading-relaxed ${!isExpanded ? 'line-clamp-4' : ''}`}>
                        {bodyText}
                      </p>
                      {needsToggle && (
                        <button onClick={() => toggleMsgExpand(msg.id)}
                          className="mt-1 text-[11px] text-gray-500 hover:text-gray-700 transition-colors">
                          {isExpanded ? '▴ Show less' : '▾ Show more'}
                        </button>
                      )}
                    </div>

                    {isOut && !isDraft && ['sent', 'delivered', 'bounced'].includes(msg.status) && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          msg.status === 'delivered' ? 'bg-green-500' :
                          msg.status === 'bounced'   ? 'bg-red-500' : 'bg-blue-500'
                        }`} />
                        <span className="text-[10px] text-gray-500 capitalize">{msg.status}</span>
                      </div>
                    )}
                    {isOut && !isDraft && msg.status === 'failed' && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] text-red-600">⚠ Send failed</span>
                        <a href={`/biotech/briefs/${engagement.brief_id}`}
                          className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors underline">
                          Go back to brief →
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* ── MODAL: Log CRO response ── */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 px-4 backdrop-blur"
          onClick={e => { if (e.target === e.currentTarget) { setShowPasteModal(false); setPasteError(''); } }}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Log CRO response</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Paste {engagement.cro_name}&apos;s email reply. AI will analyse it and draft a follow-up.
                </p>
              </div>
              <button onClick={() => { setShowPasteModal(false); setPasteError(''); }}
                className="text-gray-500 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
            </div>
            <textarea value={pastedResponse} onChange={e => setPastedResponse(e.target.value)}
              placeholder="Paste CRO's email response here…" rows={10} autoFocus
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            {pasteError && <p className="text-xs text-red-600">⚠ {pasteError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowPasteModal(false); setPasteError(''); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleLogResponse} disabled={pasteLoading || !pastedResponse.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500">
                {pasteLoading ? 'Saving & analysing…' : 'Save & analyse →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Log meeting notes ── */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 px-4 backdrop-blur"
          onClick={e => { if (e.target === e.currentTarget) { setShowNotesModal(false); setNotesError(''); } }}>
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Log meeting notes</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Paste your call notes or transcript. AI will analyse them — confirmed items, concerns, and RFP refinements will appear alongside your email analysis.
                  Any format accepted — bullets, prose, Otter.ai transcript, Zoom summary.
                </p>
              </div>
              <button onClick={() => { setShowNotesModal(false); setNotesError(''); }}
                className="text-gray-500 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Meeting date (optional)</label>
                <input type="date" value={meetingDateInput} onChange={e => setMeetingDateInput(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Attendees (optional)</label>
                <input type="text" value={attendeesInput} onChange={e => setAttendeesInput(e.target.value)}
                  placeholder="e.g. Dr. Chen (CRO), you"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </div>
            </div>
            <textarea value={rawNotes} onChange={e => setRawNotes(e.target.value)}
              placeholder="Paste meeting notes or call transcript here…" rows={14} autoFocus
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
            {notesError && <p className="text-xs text-red-600">⚠ {notesError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowNotesModal(false); setNotesError(''); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleLogMeetingNotes} disabled={notesLoading || !rawNotes.trim()}
                className="rounded-lg bg-purple-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500">
                {notesLoading ? 'Saving & analysing…' : 'Save & analyse →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Log quote ── */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 px-4 backdrop-blur"
          onClick={e => { if (e.target === e.currentTarget) { setShowQuoteModal(false); setQuoteError(''); } }}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Log quote from {engagement.cro_name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Record the price and timeline they quoted. No RFP needed.
                </p>
              </div>
              <button onClick={() => { setShowQuoteModal(false); setQuoteError(''); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Amount *</label>
                <input type="number" min="0" step="0.01" value={quoteAmount}
                  onChange={e => setQuoteAmount(e.target.value)} placeholder="e.g. 45000" autoFocus
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Currency</label>
                <select value={quoteCurrency} onChange={e => setQuoteCurrency(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500">
                  <option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AUD</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Timeline (optional)</label>
                <input type="text" value={quoteTimeline} onChange={e => setQuoteTimeline(e.target.value)}
                  placeholder="e.g. 8–10 weeks"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Valid until (optional)</label>
                <input type="date" value={quoteValidUntil} onChange={e => setQuoteValidUntil(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Notes (optional)</label>
              <textarea value={quoteNotes} onChange={e => setQuoteNotes(e.target.value)}
                placeholder="e.g. price includes GLP report, excludes histopathology" rows={3}
                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            </div>
            {quoteError && <p className="text-xs text-red-600">⚠ {quoteError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowQuoteModal(false); setQuoteError(''); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveQuote} disabled={savingQuote || !quoteAmount.trim()}
                className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400">
                {savingQuote ? 'Saving…' : 'Save quote →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Meeting invite ── */}
      {showMeetingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 px-4 backdrop-blur"
          onClick={e => { if (e.target === e.currentTarget) closeMeetingModal(); }}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Schedule a meeting</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  AI will draft a meeting request email with your booking link. Review and send.
                </p>
              </div>
              <button onClick={closeMeetingModal}
                className="text-gray-500 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
            </div>

            {noSchedulingLink && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                <p className="text-sm font-medium text-amber-700">Booking link not set</p>
                <p className="text-xs text-amber-700">
                  Add your Calendly or Cal.com booking URL in settings so the invite can include it.
                </p>
                <a href="/biotech/settings"
                  className="inline-block text-xs text-blue-500 hover:text-blue-400 transition-colors underline">
                  Open settings →
                </a>
              </div>
            )}

            {!meetingBody && !meetingLoading && !noSchedulingLink && (
              <>
                {meetingError && (
                  <p className="text-xs text-red-600 rounded-lg border border-red-800/40 bg-red-950/20 px-3 py-2">
                    ⚠ {meetingError}
                  </p>
                )}
                <button onClick={handleGenerateMeetingInvite}
                  className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2">
                  ✦ Generate invite draft →
                </button>
              </>
            )}

            {meetingLoading && (
              <div className="flex items-center gap-3 text-sm text-gray-500 py-2">
                <Spinner color="purple" />
                Drafting meeting invite…
              </div>
            )}

            {meetingBody && !meetingLoading && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-purple-700">
                    Review &amp; edit draft
                  </p>
                  <button
                    onClick={() => { setMeetingBody(''); setMeetingMsgId(null); setMeetingError(''); handleGenerateMeetingInvite(); }}
                    className="text-[10px] text-gray-500 hover:text-gray-600 transition-colors">
                    ↺ Re-draft
                  </button>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500">Subject</p>
                  <input type="text" value={meetingSubject} onChange={e => setMeetingSubject(e.target.value)}
                    disabled={meetingSent}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500">Message</p>
                  <textarea value={meetingBody} onChange={e => setMeetingBody(e.target.value)}
                    disabled={meetingSent} rows={9}
                    className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60" />
                </div>
                {meetingError && <p className="text-xs text-red-600">⚠ {meetingError}</p>}
                {!meetingSent && (
                  <button onClick={handleSendMeetingInvite}
                    disabled={meetingLoading || !meetingBody.trim() || !meetingMsgId}
                    className="w-full rounded-lg bg-purple-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500">
                    {meetingLoading ? 'Sending…' : 'Approve & Send invite →'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small sub-components to keep render readable ──────────────────────────────

function ConfirmedCollapsible({ items }: { items: TaggedItem[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-1">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-green-800 dark:text-green-300 hover:text-green-900 dark:hover:text-green-200 transition-colors">
        <span className="text-green-600 dark:text-green-400">✓</span>
        <span>Confirmed ({items.length})</span>
        <svg className={`h-3 w-3 text-green-600 dark:text-green-400 transition-transform ${open ? '' : '-rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="space-y-1.5 pt-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-green-900 dark:text-green-100">
              <span className="mt-0.5 shrink-0 text-green-600 dark:text-green-400">✓</span>
              <span className="flex-1">{item.text}<SourceTag source={item.source} /></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestedQuestionsCollapsible({
  questions, selected, onToggle
}: {
  questions: string[];
  selected: Set<number>;
  onToggle: (i: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-1">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-gray-600 hover:text-gray-800 transition-colors">
        <span>Suggested questions ({questions.length})</span>
        <svg className={`h-3 w-3 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="space-y-2 pt-1">
          <p className="text-[10px] text-gray-500">Check to insert into reply draft</p>
          {questions.map((q, i) => (
            <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
              <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-300 bg-white text-blue-500 focus:ring-blue-500" />
              <span className={`text-xs leading-relaxed transition-colors ${
                selected.has(i) ? 'text-blue-600' : 'text-gray-500 group-hover:text-gray-700'
              }`}>{q}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
