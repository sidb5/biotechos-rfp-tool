'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import {
  SAFE_FIELD_LABELS,
  ALWAYS_EXCLUDED_LABELS,
} from '@biotech/prompts/enquiry';
import type { ExtractedData } from '@biotech/prompts/extract-brief';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CROItem {
  id: string;
  name: string;
  email: string | null;
  isManual: boolean;
}

type DraftStatus = 'generating' | 'ready' | 'sending' | 'sent' | 'error';
type BulkStatus  = 'idle' | 'generating' | 'ready' | 'sending';

interface DraftState {
  subject:       string;
  body:          string;
  status:        DraftStatus;
  engagementId?: string;
  messageId?:    string;
  errorMsg?:     string;
}

interface BriefMeta {
  title: string;
  extracted_data: ExtractedData | null;
}

interface UserSettings {
  sender_display_name: string | null;
  sender_email:        string | null;
  company_name:        string | null;
  response_deadline_days: number | null;
}

// Saved draft shape returned by GET /api/biotech/briefs/[id]/enquiry
interface SavedDraft {
  cro_email:     string;
  cro_name:      string;
  engagement_id: string;
  message_id:    string;
  subject:       string;
  body:          string;
  status:        string;
  stage:         string;
}

// ── Generation helper ─────────────────────────────────────────────────────────

async function generateDraft(
  briefId: string,
  cro: CROItem,
  opts: { includeBudget: boolean; deadlineDays: number; companyName: string | null }
): Promise<
  | { subject: string; body: string; engagement_id: string; message_id: string }
  | { error: string }
> {
  try {
    const res = await fetch(`/api/biotech/briefs/${briefId}/enquiry`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        cro_id:         cro.isManual ? null : cro.id,
        cro_name:       cro.name,
        cro_email:      cro.email,
        include_budget: opts.includeBudget,
        deadline_days:  opts.deadlineDays,
        sender_company: opts.companyName,
      }),
    });
    const json = await res.json();
    if (!res.ok) return { error: (json.error as string) ?? 'Generation failed' };
    return {
      subject:       json.subject       as string,
      body:          json.body          as string,
      engagement_id: json.engagement_id as string,
      message_id:    json.message_id    as string,
    };
  } catch {
    return { error: 'Network error — check your connection' };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EnquiryPage() {
  const params  = useParams();
  const briefId = params.id as string;

  const [cros, setCros]               = useState<CROItem[]>([]);
  const [brief, setBrief]             = useState<BriefMeta | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [authEmail, setAuthEmail]     = useState<string>('');
  const [dataLoaded, setDataLoaded]   = useState(false);
  const [noSelection, setNoSelection] = useState(false);

  // Individual mode draft state
  const [drafts, setDrafts]           = useState<Record<string, DraftState>>({});
  const [activeCroId, setActiveCroId] = useState<string | null>(null);

  const [includeBudget, setIncludeBudget] = useState(false);
  const [deadlineDays, setDeadlineDays]   = useState(10);
  const [optionsDirty, setOptionsDirty]   = useState(false);

  // Send mode: 'bulk' = one template for all CROs (default); 'individual' = custom per CRO
  const [sendMode, setSendMode] = useState<'bulk' | 'individual'>('bulk');

  // Bulk send state
  const [bulkSubject, setBulkSubject]   = useState('');
  const [bulkBody, setBulkBody]         = useState('');
  const [bulkStatus, setBulkStatus]     = useState<BulkStatus>('idle');
  const [bulkError, setBulkError]       = useState('');
  const [bulkProgress, setBulkProgress] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});

  const initialised = useRef(false);

  // ── Load: session storage + brief + settings + saved drafts ──────────────

  useEffect(() => {
    async function load() {
      // 1. Session storage
      const raw = sessionStorage.getItem(`brief_${briefId}_selection`);
      if (!raw) { setNoSelection(true); setDataLoaded(true); return; }

      let sel: {
        cros:   Array<{ id: string; name: string; email: string | null }>;
        manual: Array<{ id: string; name: string; email: string }>;
      };
      try { sel = JSON.parse(raw); }
      catch { setNoSelection(true); setDataLoaded(true); return; }

      const combined: CROItem[] = [
        ...sel.cros.map(c => ({ id: c.id, name: c.name, email: c.email, isManual: false })),
        ...sel.manual.map(m => ({ id: m.id, name: m.name, email: m.email, isManual: true })),
      ];
      if (combined.length === 0) { setNoSelection(true); setDataLoaded(true); return; }

      setCros(combined);
      setActiveCroId(combined[0].id);

      // 2. Auth + brief + settings in parallel
      const [briefRes, userRes] = await Promise.all([
        supabase
          .from('rfp_internal_briefs')
          .select('title, extracted_data')
          .eq('id', briefId)
          .single(),
        supabase.auth.getUser(),
      ]);

      if (briefRes.data) setBrief(briefRes.data as BriefMeta);

      let settings: UserSettings | null = null;
      let effectiveDeadline = 10;

      if (userRes.data.user) {
        setAuthEmail(userRes.data.user.email ?? '');
        try {
          const { data } = await supabase
            .from('biotech_user_settings')
            .select('sender_display_name, sender_email, company_name, response_deadline_days')
            .eq('user_id', userRes.data.user.id)
            .maybeSingle();
          if (data) {
            settings = data as UserSettings;
            if (settings.response_deadline_days) {
              effectiveDeadline = settings.response_deadline_days;
              setDeadlineDays(settings.response_deadline_days);
            }
          }
        } catch { /* table not yet created */ }
      }
      if (settings) setUserSettings(settings);

      // 3. Fetch saved drafts from DB — keyed by email|name to avoid same-email collision
      let savedDrafts: SavedDraft[] = [];
      try {
        const res = await fetch(`/api/biotech/briefs/${briefId}/enquiry`);
        if (res.ok) {
          const json = await res.json();
          savedDrafts = (json.drafts ?? []) as SavedDraft[];
        }
      } catch { /* ignore */ }

      // Key: `${email}|${name}` — two companies sharing an email stay separate
      const savedByKey: Record<string, SavedDraft> = {};
      for (const d of savedDrafts) {
        const k = `${d.cro_email}|${d.cro_name}`;
        savedByKey[k] = d;
      }

      setDataLoaded(true);

      if (initialised.current) return;
      initialised.current = true;

      // 4. Populate initial draft state from saved DB records
      const initial: Record<string, DraftState> = {};
      for (const cro of combined) {
        const key   = `${cro.email}|${cro.name}`;
        const saved = cro.email ? savedByKey[key] : undefined;
        if (saved) {
          initial[cro.id] = {
            subject:      saved.subject,
            body:         saved.body,
            status:       saved.status === 'sent' ? 'sent' : 'ready',
            engagementId: saved.engagement_id,
            messageId:    saved.message_id,
          };
        } else {
          // Placeholder — generation deferred until individual mode is activated
          initial[cro.id] = { subject: '', body: '', status: 'generating' };
        }
      }
      setDrafts(initial);

      // Auto-activate first CRO that still needs action
      const firstActionable = combined.find(c => {
        const key   = `${c.email}|${c.name}`;
        const saved = c.email ? savedByKey[key] : undefined;
        return !saved || saved.status !== 'sent';
      });
      if (firstActionable) setActiveCroId(firstActionable.id);

      // 5. Auto-generate — ONLY in individual mode (default is 'bulk' so this is skipped on mount)
      //    sendMode is captured from closure; on initial mount it is 'bulk' → no generation.
      const needGeneration = combined.filter(c => !c.email || !savedByKey[`${c.email}|${c.name}`]);
      if (needGeneration.length === 0) return;

      // sendMode is read from the closure at effect invocation time.
      // On first mount sendMode === 'bulk', so we skip auto-generation.
      // When the user switches to individual, handleSwitchToIndividual triggers generation instead.
    }

    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefId]);

  // ── Switch to individual mode — triggers generation for CROs without drafts ─

  async function handleSwitchToIndividual() {
    setSendMode('individual');
    const opts = {
      includeBudget,
      deadlineDays,
      companyName: userSettings?.company_name ?? null,
    };
    // Generate only for CROs that don't have a saved draft yet
    const pending = cros.filter(c => {
      const d = drafts[c.id];
      return !d || d.status === 'generating';
    });
    if (pending.length === 0) return;

    await Promise.all(
      pending.map(async cro => {
        const result = await generateDraft(briefId, cro, opts);
        setDrafts(prev => ({
          ...prev,
          [cro.id]: 'error' in result
            ? { subject: '', body: '', status: 'error', errorMsg: result.error }
            : {
                subject:      result.subject,
                body:         result.body,
                status:       'ready',
                engagementId: result.engagement_id,
                messageId:    result.message_id,
              },
        }));
      })
    );
  }

  // ── Regenerate all (individual mode) ─────────────────────────────────────

  async function handleRegenerateAll() {
    setOptionsDirty(false);
    const opts = {
      includeBudget,
      deadlineDays,
      companyName: userSettings?.company_name ?? null,
    };

    setDrafts(prev => {
      const next = { ...prev };
      cros.forEach(c => {
        if (next[c.id]?.status !== 'sent') {
          next[c.id] = { subject: '', body: '', status: 'generating' };
        }
      });
      return next;
    });

    await Promise.all(
      cros
        .filter(c => drafts[c.id]?.status !== 'sent')
        .map(async cro => {
          const result = await generateDraft(briefId, cro, opts);
          setDrafts(prev => ({
            ...prev,
            [cro.id]: 'error' in result
              ? { subject: '', body: '', status: 'error', errorMsg: result.error }
              : {
                  subject:      result.subject,
                  body:         result.body,
                  status:       'ready',
                  engagementId: result.engagement_id,
                  messageId:    result.message_id,
                },
          }));
        })
    );
  }

  async function handleRedraft(cro: CROItem) {
    setDrafts(prev => ({
      ...prev,
      [cro.id]: { subject: '', body: '', status: 'generating' },
    }));
    const result = await generateDraft(briefId, cro, {
      includeBudget,
      deadlineDays,
      companyName: userSettings?.company_name ?? null,
    });
    setDrafts(prev => ({
      ...prev,
      [cro.id]: 'error' in result
        ? { subject: '', body: '', status: 'error', errorMsg: result.error }
        : {
            subject:      result.subject,
            body:         result.body,
            status:       'ready',
            engagementId: result.engagement_id,
            messageId:    result.message_id,
          },
    }));
  }

  // ── Bulk template generation ──────────────────────────────────────────────

  async function handleGenerateBulkTemplate() {
    setBulkStatus('generating');
    setBulkError('');
    try {
      const res = await fetch(`/api/biotech/briefs/${briefId}/enquiry`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          cro_id:         null,
          cro_name:       '{{CRO_NAME}}',    // placeholder — substituted on send
          cro_email:      'template@placeholder.invalid',
          include_budget: includeBudget,
          deadline_days:  deadlineDays,
          sender_company: userSettings?.company_name ?? null,
          template_only:  true,              // skip DB save
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBulkError((json.error as string) ?? 'Generation failed — please retry');
        setBulkStatus('idle');
        return;
      }
      setBulkSubject(json.subject as string);
      setBulkBody(json.body as string);
      setBulkStatus('ready');
    } catch {
      setBulkError('Network error — please check your connection');
      setBulkStatus('idle');
    }
  }

  // ── Bulk send all ─────────────────────────────────────────────────────────

  async function handleSendBulk() {
    if (!bulkBody.trim() || !bulkSubject.trim()) return;
    setBulkStatus('sending');

    const targets = cros.filter(c => c.email && bulkProgress[c.id] !== 'sent');

    await Promise.all(
      targets.map(async cro => {
        setBulkProgress(prev => ({ ...prev, [cro.id]: 'sending' }));
        try {
          // Substitute {{CRO_NAME}} with the actual CRO name
          const personalizedBody = bulkBody.replace(/\{\{CRO_NAME\}\}/g, cro.name);

          // 1. Create engagement + message (skip AI — use our template body)
          const engRes = await fetch(`/api/biotech/briefs/${briefId}/enquiry`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              cro_id:           cro.isManual ? null : cro.id,
              cro_name:         cro.name,
              cro_email:        cro.email,
              sender_company:   userSettings?.company_name ?? null,
              override_body:    personalizedBody,
              override_subject: bulkSubject,
            }),
          });
          const engJson = await engRes.json();
          if (!engRes.ok) throw new Error((engJson.error as string) ?? 'Failed to save engagement');

          // 2. Send via Resend
          const sendRes = await fetch(`/api/biotech/briefs/${briefId}/engagements`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              engagement_id: engJson.engagement_id as string,
              message_id:    engJson.message_id    as string,
              cro_email:     cro.email,
              subject:       bulkSubject,
              body:          personalizedBody,
            }),
          });
          const sendJson = await sendRes.json();
          if (!sendRes.ok) throw new Error((sendJson.error as string) ?? 'Send failed');

          setBulkProgress(prev => ({ ...prev, [cro.id]: 'sent' }));
        } catch (err) {
          console.error('[bulk-send]', cro.name, err);
          setBulkProgress(prev => ({ ...prev, [cro.id]: 'error' }));
        }
      })
    );

    setBulkStatus('ready');
  }

  // ── Individual send ───────────────────────────────────────────────────────

  async function handleSend(cro: CROItem) {
    const draft = drafts[cro.id];
    if (!draft || draft.status !== 'ready' || !cro.email) return;
    if (!draft.engagementId || !draft.messageId) return;

    setDrafts(prev => ({ ...prev, [cro.id]: { ...prev[cro.id], status: 'sending' } }));

    try {
      const res = await fetch(`/api/biotech/briefs/${briefId}/engagements`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          engagement_id: draft.engagementId,
          message_id:    draft.messageId,
          cro_email:     cro.email,
          subject:       draft.subject,
          body:          draft.body,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setDrafts(prev => ({
          ...prev,
          [cro.id]: {
            ...prev[cro.id],
            status:   'error',
            errorMsg: (json.error as string) ?? 'Send failed — please retry',
          },
        }));
        return;
      }

      setDrafts(prev => ({
        ...prev,
        [cro.id]: {
          ...prev[cro.id],
          status:   'sent',
          errorMsg: json.warning as string | undefined,
        },
      }));
    } catch {
      setDrafts(prev => ({
        ...prev,
        [cro.id]: { ...prev[cro.id], status: 'error', errorMsg: 'Network error — please retry' },
      }));
    }
  }

  async function handleSendAll() {
    const pending = cros.filter(c => drafts[c.id]?.status === 'ready' && c.email);
    for (const cro of pending) await handleSend(cro);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeCro   = cros.find(c => c.id === activeCroId) ?? null;
  const activeDraft = activeCroId ? (drafts[activeCroId] ?? null) : null;
  const sentCount  = Object.values(drafts).filter(d => d.status === 'sent').length;
  const readyCount = cros.filter(c => drafts[c.id]?.status === 'ready' && c.email).length;
  const allSent    = cros.length > 0 && sentCount === cros.length;

  const bulkSentCount  = Object.values(bulkProgress).filter(v => v === 'sent').length;
  const bulkErrorCount = Object.values(bulkProgress).filter(v => v === 'error').length;
  const allBulkSent    = cros.length > 0 && bulkSentCount === cros.length;

  const effectiveReplyTo       = userSettings?.sender_email || authEmail;
  const usingAuthEmailFallback = !userSettings?.sender_email && !!authEmail;

  const includedFieldLabels = useMemo(() => {
    if (!brief?.extracted_data) return [];
    const ext = brief.extracted_data as Record<string, { tag: string; value: string | null } | undefined>;
    return (Object.keys(SAFE_FIELD_LABELS) as (keyof typeof SAFE_FIELD_LABELS)[])
      .filter(key => {
        if (key === 'budget_range' && !includeBudget) return false;
        const field = ext[key];
        return field && field.tag !== 'MISSING' && field.value !== null;
      })
      .map(key => SAFE_FIELD_LABELS[key]);
  }, [brief, includeBudget]);

  // ── Spinner ───────────────────────────────────────────────────────────────

  if (!dataLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (noSelection) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 text-gray-500">
        <p className="text-sm">No CROs selected.</p>
        <a href={`/biotech/briefs/${briefId}`} className="text-sm text-blue-600 hover:underline">
          ← Back to CRO selection
        </a>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">

      {/* PRIVATE banner */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2.5 backdrop-blur">
        <span className="shrink-0 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
          PRIVATE
        </span>
        <p className="text-xs text-amber-600">
          Review each draft before sending — compound, MOA, and indication are never included.
          Nothing is sent until you click &ldquo;Approve &amp; Send.&rdquo;
        </p>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-10 space-y-8">

        {/* Header */}
        <header>
          <nav className="mb-1.5 text-xs text-gray-500">
            <a href="/biotech/briefs" className="hover:text-gray-700 transition-colors">Briefs</a>
            <span className="mx-1.5">/</span>
            <a href={`/biotech/briefs/${briefId}`} className="hover:text-gray-700 transition-colors">
              {brief?.title ?? 'Brief'}
            </a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-700">Capability enquiry</span>
          </nav>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Capability enquiry drafts</h1>
              <p className="mt-1 text-sm text-gray-500">
                AI-drafted IP-safe outreach for {cros.length} CRO{cros.length !== 1 ? 's' : ''}.
                Drafts are saved automatically — edits persist across sessions.
              </p>
            </div>
            {(sentCount > 0 || bulkSentCount > 0) && (
              <span className="text-sm text-gray-500 shrink-0">
                <span className="text-green-600 font-semibold">
                  {sendMode === 'bulk' ? bulkSentCount : sentCount}
                </span>
                {' '}/ {cros.length} sent
              </span>
            )}
          </div>
        </header>

        {/* Step label */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">
            Step 3 — Review &amp; send IP-safe capability enquiries
          </span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* ── Send mode toggle ── */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 shrink-0">Send mode:</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setSendMode('bulk')}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                sendMode === 'bulk'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              Bulk (same template)
            </button>
            <button
              onClick={handleSwitchToIndividual}
              className={`px-4 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                sendMode === 'individual'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              Individual (custom per CRO)
            </button>
          </div>
          {sendMode === 'bulk' && (
            <p className="text-xs text-gray-500">
              One template with <code className="text-amber-600">{'{{CRO_NAME}}'}</code> — substituted on send
            </p>
          )}
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">

          {/* ── Left panel ── */}
          <aside className="space-y-4">

            {/* Draft options */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Draft options</h2>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-700">Include budget range</span>
                <button
                  role="switch"
                  aria-checked={includeBudget}
                  onClick={() => { setIncludeBudget(v => !v); setOptionsDirty(true); }}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white ${includeBudget ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${includeBudget ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label htmlFor="deadline-sel" className="text-sm text-gray-700">Response deadline</label>
                <select
                  id="deadline-sel"
                  value={deadlineDays}
                  onChange={e => { setDeadlineDays(Number(e.target.value)); setOptionsDirty(true); }}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {[5, 7, 10, 14, 20].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>

              {optionsDirty && sendMode === 'individual' && (
                <button
                  onClick={handleRegenerateAll}
                  className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  ↺ Regenerate all with new options
                </button>
              )}
              {optionsDirty && sendMode === 'bulk' && bulkStatus === 'ready' && (
                <button
                  onClick={handleGenerateBulkTemplate}
                  className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  ↺ Regenerate template with new options
                </button>
              )}
            </div>

            {/* IP protection checklist */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">IP protection</h2>

              {includedFieldLabels.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-green-600 mb-2">✓ INCLUDED from brief</p>
                  <ul className="space-y-1.5">
                    {includedFieldLabels.map(label => (
                      <li key={label} className="flex items-start gap-2 text-xs text-gray-500">
                        <span className="mt-0.5 shrink-0 text-green-600">✓</span>{label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold text-red-400 mb-2">✗ NEVER INCLUDED</p>
                <ul className="space-y-1.5">
                  {ALWAYS_EXCLUDED_LABELS.map(item => (
                    <li key={item.label} className="flex items-start gap-2 text-xs text-gray-500">
                      <span className="mt-0.5 shrink-0 text-red-700">✗</span>{item.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Reply-To info */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500">Reply-To address</p>
              <p className="text-xs text-gray-700 break-all font-mono">
                {effectiveReplyTo || '—'}
              </p>
              <p className="text-xs text-gray-500">
                {usingAuthEmailFallback ? 'Using your login email. ' : ''}
                CRO replies go directly to this inbox.{' '}
                <a href="/biotech/settings" className="text-blue-500 hover:text-blue-400 transition-colors">
                  Change in settings →
                </a>
              </p>
            </div>

            {/* Bulk: CRO send status list */}
            {sendMode === 'bulk' && bulkStatus !== 'idle' && cros.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                  Send status
                </p>
                {cros.map(cro => {
                  const prog = bulkProgress[cro.id] ?? 'idle';
                  const icon =
                    prog === 'sent'    ? <span className="text-green-600">✓</span> :
                    prog === 'error'   ? <span className="text-red-600">✗</span> :
                    prog === 'sending' ? <svg className="h-3 w-3 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> :
                    <span className="text-gray-500">–</span>;
                  return (
                    <div key={cro.id} className="flex items-center gap-2 text-xs">
                      <span className="shrink-0">{icon}</span>
                      <span className={`truncate ${prog === 'sent' ? 'text-gray-700' : prog === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                        {cro.name}
                      </span>
                      {!cro.email && <span className="text-[10px] text-red-700">no email</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          {/* ── Right panel ── */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">

            {/* ──────────────── BULK MODE ──────────────── */}
            {sendMode === 'bulk' && (
              <div className="p-5 space-y-5">

                {/* Idle state — prompt to generate */}
                {bulkStatus === 'idle' && (
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <div className="text-gray-500 text-4xl">✦</div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Generate bulk template</p>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">
                        AI will draft one IP-safe email with{' '}
                        <code className="text-amber-600">{'{{CRO_NAME}}'}</code> as a placeholder.
                        Each CRO receives a personalised copy on send.
                      </p>
                    </div>
                    <button
                      onClick={handleGenerateBulkTemplate}
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      ✦ Generate bulk template →
                    </button>
                    {bulkError && (
                      <p className="text-xs text-red-600">⚠ {bulkError}</p>
                    )}
                  </div>
                )}

                {/* Generating spinner */}
                {bulkStatus === 'generating' && (
                  <div className="flex items-center gap-2.5 text-xs text-gray-500 py-8 justify-center">
                    <svg className="h-5 w-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Drafting IP-safe bulk template…
                  </div>
                )}

                {/* Ready or sending state — show editor */}
                {(bulkStatus === 'ready' || bulkStatus === 'sending') && (
                  <>
                    {/* All-sent banner */}
                    {allBulkSent && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                        <span className="text-green-600">✓</span>
                        <p className="text-xs text-green-700">
                          All {cros.length} CROs contacted. View in{' '}
                          <a href="/biotech/engagements" className="underline hover:text-green-800">engagements</a>.
                        </p>
                      </div>
                    )}

                    {bulkError && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                        <p className="text-xs text-red-600">⚠ {bulkError}</p>
                      </div>
                    )}

                    {/* Variable hint */}
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs text-amber-600">
                        <code className="font-mono">{'{{CRO_NAME}}'}</code> will be replaced with each CRO&apos;s name on send.
                        You can use it anywhere in the subject or body.
                      </p>
                    </div>

                    {/* Subject */}
                    <div>
                      <p className="mb-1 text-xs text-gray-500">Subject</p>
                      <input
                        type="text"
                        value={bulkSubject}
                        disabled={bulkStatus === 'sending'}
                        onChange={e => setBulkSubject(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                      />
                    </div>

                    {/* Body */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs text-gray-500">Message template</p>
                        <button
                          onClick={handleGenerateBulkTemplate}
                          disabled={bulkStatus === 'sending'}
                          className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
                        >
                          ↺ Re-draft
                        </button>
                      </div>
                      <textarea
                        value={bulkBody}
                        disabled={bulkStatus === 'sending'}
                        onChange={e => setBulkBody(e.target.value)}
                        rows={14}
                        className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                      />
                    </div>

                    {/* Send controls */}
                    <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
                      <span className="text-xs text-gray-500">
                        {bulkBody
                          ? `${bulkBody.split(/\s+/).filter(Boolean).length} words · sending to ${cros.filter(c => c.email).length} CRO${cros.length !== 1 ? 's' : ''}`
                          : null}
                        {bulkErrorCount > 0 && (
                          <span className="text-red-600"> · {bulkErrorCount} failed</span>
                        )}
                      </span>
                      <button
                        onClick={handleSendBulk}
                        disabled={bulkStatus === 'sending' || allBulkSent || !bulkBody.trim()}
                        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        {bulkStatus === 'sending'
                          ? `Sending… (${bulkSentCount}/${cros.filter(c => c.email).length})`
                          : allBulkSent
                          ? '✓ All sent'
                          : `Send to all ${cros.filter(c => c.email).length} CROs →`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ──────────────── INDIVIDUAL MODE ──────────────── */}
            {sendMode === 'individual' && (
              <>
                {/* Tab bar */}
                <div className="flex overflow-x-auto border-b border-gray-200 bg-gray-50">
                  {cros.map(cro => {
                    const d = drafts[cro.id];
                    const isActive = cro.id === activeCroId;
                    const dotClass =
                      !d                                                  ? 'bg-gray-300' :
                      d.status === 'sent'                                 ? 'bg-green-500' :
                      d.status === 'error'                                ? 'bg-red-500' :
                      d.status === 'generating' || d.status === 'sending' ? 'bg-yellow-500 animate-pulse' :
                                                                            'bg-blue-400';
                    return (
                      <button
                        key={cro.id}
                        onClick={() => setActiveCroId(cro.id)}
                        className={`flex shrink-0 items-center gap-2 border-r border-gray-200 px-4 py-3 text-sm transition-colors ${
                          isActive ? 'bg-white text-gray-900 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                        }`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                        <span className="max-w-[120px] truncate">{cro.name}</span>
                        {d?.status === 'sent' && <span className="text-[10px] text-green-600">✓</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Draft editor */}
                {activeCro && (
                  <div className="p-5 space-y-4">

                    {/* Status banners */}
                    {activeDraft?.status === 'generating' && (
                      <div className="flex items-center gap-2.5 text-xs text-gray-500">
                        <svg className="h-4 w-4 shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Drafting IP-safe message for {activeCro.name}…
                      </div>
                    )}

                    {activeDraft?.status === 'error' && (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                        <p className="text-xs text-red-600">⚠ {activeDraft.errorMsg}</p>
                        <button
                          onClick={() => handleRedraft(activeCro)}
                          className="shrink-0 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:text-red-700 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {activeDraft?.status === 'sent' && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                        <span className="text-green-600">✓</span>
                        <p className="text-xs text-green-700">
                          {activeDraft.errorMsg
                            ? `Saved (not sent — ${activeDraft.errorMsg})`
                            : `Sent to ${activeCro.email}`}
                        </p>
                      </div>
                    )}

                    {/* To */}
                    <div>
                      <p className="mb-1 text-xs text-gray-500">To</p>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                        {activeCro.email ?? <span className="text-red-600">No email address — cannot send</span>}
                      </div>
                    </div>

                    {/* Subject */}
                    <div>
                      <p className="mb-1 text-xs text-gray-500">Subject</p>
                      {activeDraft && activeDraft.status !== 'generating' ? (
                        <input
                          type="text"
                          value={activeDraft.subject}
                          disabled={activeDraft.status === 'sent' || activeDraft.status === 'sending'}
                          onChange={e => setDrafts(prev => ({
                            ...prev,
                            [activeCro.id]: { ...prev[activeCro.id], subject: e.target.value },
                          }))}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      ) : (
                        <div className="h-9 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
                      )}
                    </div>

                    {/* Body */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs text-gray-500">Message</p>
                        {activeDraft?.status === 'ready' && (
                          <button
                            onClick={() => handleRedraft(activeCro)}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            ↺ Re-draft
                          </button>
                        )}
                      </div>
                      {activeDraft && activeDraft.status !== 'generating' ? (
                        <textarea
                          value={activeDraft.body}
                          disabled={activeDraft.status === 'sent' || activeDraft.status === 'sending'}
                          onChange={e => setDrafts(prev => ({
                            ...prev,
                            [activeCro.id]: { ...prev[activeCro.id], body: e.target.value },
                          }))}
                          rows={12}
                          className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      ) : (
                        <div className="h-48 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
                      )}
                    </div>

                    {/* Send controls */}
                    <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
                      <span className="text-xs text-gray-500">
                        {activeDraft?.body
                          ? `${activeDraft.body.split(/\s+/).filter(Boolean).length} words`
                          : null}
                      </span>
                      <button
                        onClick={() => handleSend(activeCro)}
                        disabled={
                          !activeDraft ||
                          activeDraft.status !== 'ready' ||
                          !activeCro.email ||
                          !activeDraft.engagementId ||
                          !activeDraft.messageId
                        }
                        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        {activeDraft?.status === 'sending' ? 'Sending…' : 'Approve & Send →'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            {sendMode === 'individual' && (
              allSent
                ? `All ${cros.length} enquir${cros.length !== 1 ? 'ies' : 'y'} sent.`
                : readyCount > 1
                ? `${readyCount} draft${readyCount !== 1 ? 's' : ''} ready to send.`
                : null
            )}
            {sendMode === 'bulk' && allBulkSent && (
              `All ${cros.length} enquir${cros.length !== 1 ? 'ies' : 'y'} sent.`
            )}
          </p>
          <div className="flex gap-3">
            {sendMode === 'individual' && readyCount > 1 && !allSent && (
              <button
                onClick={handleSendAll}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
              >
                Send all ready ({readyCount})
              </button>
            )}
            {(sentCount > 0 || bulkSentCount > 0) && (
              <a
                href="/biotech/engagements"
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                View engagements →
              </a>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
