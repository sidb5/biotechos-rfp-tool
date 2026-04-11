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
  status:        string;   // 'draft' | 'sent' | 'failed'
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

  const [drafts, setDrafts]           = useState<Record<string, DraftState>>({});
  const [activeCroId, setActiveCroId] = useState<string | null>(null);

  const [includeBudget, setIncludeBudget] = useState(false);
  const [deadlineDays, setDeadlineDays]   = useState(10);
  const [optionsDirty, setOptionsDirty]   = useState(false);

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
      // activeCroId will be refined below once saved drafts are loaded
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

      // 3. Fetch saved drafts from DB — no Claude call if already saved
      let savedDrafts: SavedDraft[] = [];
      try {
        const res = await fetch(`/api/biotech/briefs/${briefId}/enquiry`);
        if (res.ok) {
          const json = await res.json();
          savedDrafts = (json.drafts ?? []) as SavedDraft[];
        }
      } catch { /* ignore */ }

      // Build a lookup by cro_email
      const savedByEmail: Record<string, SavedDraft> = {};
      for (const d of savedDrafts) savedByEmail[d.cro_email] = d;

      setDataLoaded(true);

      if (initialised.current) return;
      initialised.current = true;

      // 4. For each CRO: restore from DB if saved, else generate
      const initial: Record<string, DraftState> = {};

      // First pass: populate from DB immediately (no loading flicker for cached)
      for (const cro of combined) {
        const saved = cro.email ? savedByEmail[cro.email] : undefined;
        if (saved) {
          initial[cro.id] = {
            subject:       saved.subject,
            body:          saved.body,
            status:        saved.status === 'sent' ? 'sent' : 'ready',
            engagementId:  saved.engagement_id,
            messageId:     saved.message_id,
          };
        } else {
          initial[cro.id] = { subject: '', body: '', status: 'generating' };
        }
      }
      setDrafts(initial);

      // Auto-activate the first CRO that still needs action (not yet sent)
      // so the user lands on something actionable, not a read-only sent tab
      const firstActionable = combined.find(c => {
        const saved = c.email ? savedByEmail[c.email] : undefined;
        return !saved || saved.status !== 'sent';
      });
      if (firstActionable) setActiveCroId(firstActionable.id);

      // Second pass: generate only for CROs without a saved draft
      const needGeneration = combined.filter(c => !c.email || !savedByEmail[c.email]);

      if (needGeneration.length === 0) return;

      const opts = {
        includeBudget:  false,
        deadlineDays:   effectiveDeadline,
        companyName:    settings?.company_name ?? null,
      };

      await Promise.all(
        needGeneration.map(async cro => {
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

    void load();
  }, [briefId]);

  // ── Regenerate (explicit user action — always calls Claude + overwrites DB) ─

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

  // ── Send ──────────────────────────────────────────────────────────────────

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
          status:       'sent',
          errorMsg:     json.warning as string | undefined,
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

  const effectiveReplyTo      = userSettings?.sender_email || authEmail;
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (noSelection) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-3 text-gray-400">
        <p className="text-sm">No CROs selected.</p>
        <a href={`/biotech/briefs/${briefId}`} className="text-sm text-blue-400 hover:underline">
          ← Back to CRO selection
        </a>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* PRIVATE banner */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-amber-800/30 bg-amber-950/70 px-5 py-2.5 backdrop-blur">
        <span className="shrink-0 rounded border border-amber-700 bg-amber-900/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
          PRIVATE
        </span>
        <p className="text-xs text-amber-300/70">
          Review each draft before sending — compound, MOA, and indication are never included.
          Nothing is sent until you click "Approve &amp; Send."
        </p>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-10 space-y-8">

        {/* Header */}
        <header>
          <nav className="mb-1.5 text-xs text-gray-600">
            <a href="/biotech/briefs" className="hover:text-gray-400 transition-colors">Briefs</a>
            <span className="mx-1.5">/</span>
            <a href={`/biotech/briefs/${briefId}`} className="hover:text-gray-400 transition-colors">
              {brief?.title ?? 'Brief'}
            </a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-400">Capability enquiry</span>
          </nav>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-white">Capability enquiry drafts</h1>
              <p className="mt-1 text-sm text-gray-400">
                AI-drafted IP-safe outreach for {cros.length} CRO{cros.length !== 1 ? 's' : ''}.
                Drafts are saved automatically — edits persist across sessions.
              </p>
            </div>
            {sentCount > 0 && (
              <span className="text-sm text-gray-400 shrink-0">
                <span className="text-green-400 font-semibold">{sentCount}</span>
                {' '}/ {cros.length} sent
              </span>
            )}
          </div>
        </header>

        {/* Step label */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-800" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">
            Step 3 — Review &amp; send IP-safe capability enquiries
          </span>
          <div className="h-px flex-1 bg-gray-800" />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">

          {/* ── Left panel ── */}
          <aside className="space-y-4">

            {/* Draft options */}
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Draft options</h2>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-300">Include budget range</span>
                <button
                  role="switch"
                  aria-checked={includeBudget}
                  onClick={() => { setIncludeBudget(v => !v); setOptionsDirty(true); }}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${includeBudget ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${includeBudget ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label htmlFor="deadline-sel" className="text-sm text-gray-300">Response deadline</label>
                <select
                  id="deadline-sel"
                  value={deadlineDays}
                  onChange={e => { setDeadlineDays(Number(e.target.value)); setOptionsDirty(true); }}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {[5, 7, 10, 14, 20].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>

              {optionsDirty && (
                <button
                  onClick={handleRegenerateAll}
                  className="w-full rounded-lg border border-blue-600/40 bg-blue-600/10 px-3 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-600/20"
                >
                  ↺ Regenerate all with new options
                </button>
              )}
            </div>

            {/* IP protection checklist */}
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">IP protection</h2>

              {includedFieldLabels.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-green-400 mb-2">✓ INCLUDED from brief</p>
                  <ul className="space-y-1.5">
                    {includedFieldLabels.map(label => (
                      <li key={label} className="flex items-start gap-2 text-xs text-gray-400">
                        <span className="mt-0.5 shrink-0 text-green-500">✓</span>{label}
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
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400">Reply-To address</p>
              <p className="text-xs text-gray-300 break-all font-mono">
                {effectiveReplyTo || '—'}
              </p>
              <p className="text-xs text-gray-600">
                {usingAuthEmailFallback ? 'Using your login email. ' : ''}
                CRO replies go directly to this inbox.{' '}
                <a href="/biotech/settings" className="text-blue-500 hover:text-blue-400 transition-colors">
                  Change in settings →
                </a>
              </p>
            </div>
          </aside>

          {/* ── Right: CRO tabs + editor ── */}
          <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 overflow-hidden">

            {/* Tab bar */}
            <div className="flex overflow-x-auto border-b border-gray-700/60 bg-gray-900/80">
              {cros.map(cro => {
                const d = drafts[cro.id];
                const isActive = cro.id === activeCroId;
                const dotClass =
                  !d                                                  ? 'bg-gray-600' :
                  d.status === 'sent'                                 ? 'bg-green-500' :
                  d.status === 'error'                                ? 'bg-red-500' :
                  d.status === 'generating' || d.status === 'sending' ? 'bg-yellow-500 animate-pulse' :
                                                                        'bg-blue-400';
                return (
                  <button
                    key={cro.id}
                    onClick={() => setActiveCroId(cro.id)}
                    className={`flex shrink-0 items-center gap-2 border-r border-gray-700/60 px-4 py-3 text-sm transition-colors ${
                      isActive ? 'bg-gray-800 text-white font-medium' : 'text-gray-500 hover:bg-gray-800/50 hover:text-gray-300'
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                    <span className="max-w-[120px] truncate">{cro.name}</span>
                    {d?.status === 'sent' && <span className="text-[10px] text-green-400">✓</span>}
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
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-2.5">
                    <p className="text-xs text-red-400">⚠ {activeDraft.errorMsg}</p>
                    <button
                      onClick={() => handleRedraft(activeCro)}
                      className="shrink-0 rounded border border-red-700/40 px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {activeDraft?.status === 'sent' && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-700/40 bg-green-950/30 px-3 py-2.5">
                    <span className="text-green-400">✓</span>
                    <p className="text-xs text-green-300">
                      {activeDraft.errorMsg
                        ? `Saved (not sent — ${activeDraft.errorMsg})`
                        : `Sent to ${activeCro.email}`}
                    </p>
                  </div>
                )}

                {/* To */}
                <div>
                  <p className="mb-1 text-xs text-gray-500">To</p>
                  <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-400">
                    {activeCro.email ?? <span className="text-red-400">No email address — cannot send</span>}
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
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  ) : (
                    <div className="h-9 animate-pulse rounded-lg border border-gray-700 bg-gray-800/40" />
                  )}
                </div>

                {/* Body */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs text-gray-500">Message</p>
                    {activeDraft?.status === 'ready' && (
                      <button
                        onClick={() => handleRedraft(activeCro)}
                        className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
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
                      className="w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  ) : (
                    <div className="h-48 animate-pulse rounded-lg border border-gray-700 bg-gray-800/40" />
                  )}
                </div>

                {/* Send controls */}
                <div className="flex items-center justify-between gap-3 border-t border-gray-800 pt-3">
                  <span className="text-xs text-gray-600">
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
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
                  >
                    {activeDraft?.status === 'sending' ? 'Sending…' : 'Approve & Send →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-gray-800 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            {allSent
              ? `All ${cros.length} enquir${cros.length !== 1 ? 'ies' : 'y'} sent.`
              : readyCount > 1
              ? `${readyCount} draft${readyCount !== 1 ? 's' : ''} ready to send.`
              : null}
          </p>
          <div className="flex gap-3">
            {readyCount > 1 && !allSent && (
              <button
                onClick={handleSendAll}
                className="rounded-lg border border-blue-600/40 bg-blue-600/10 px-4 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-600/20"
              >
                Send all ready ({readyCount})
              </button>
            )}
            {sentCount > 0 && (
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
