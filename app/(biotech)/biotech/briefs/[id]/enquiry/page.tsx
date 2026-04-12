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
  contact_form_url?: string | null;
  isManual: boolean;
}

type SendTab     = 'bulk' | 'individual' | 'contactform';
type DraftStatus = 'ready' | 'sending' | 'sent' | 'error';
type TemplateStatus = 'idle' | 'generating' | 'ready';

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
  sender_display_name:    string | null;
  sender_email:           string | null;
  company_name:           string | null;
  response_deadline_days: number | null;
}

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function EnquiryPage() {
  const params  = useParams();
  const briefId = params.id as string;

  const [cros, setCros]                 = useState<CROItem[]>([]);
  const [brief, setBrief]               = useState<BriefMeta | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [authEmail, setAuthEmail]       = useState<string>('');
  const [dataLoaded, setDataLoaded]     = useState(false);
  const [noSelection, setNoSelection]   = useState(false);

  // ── Shared template (ONE AI call feeds all tabs) ───────────────────────────
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody]       = useState('');
  const [templateStatus, setTemplateStatus]   = useState<TemplateStatus>('idle');
  const [templateError, setTemplateError]     = useState('');

  // ── Options ────────────────────────────────────────────────────────────────
  const [includeBudget, setIncludeBudget] = useState(false);
  const [deadlineDays, setDeadlineDays]   = useState(10);

  // ── Tab ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SendTab>('bulk');

  // ── Bulk send state ────────────────────────────────────────────────────────
  const [bulkProgress, setBulkProgress] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});
  const [bulkSending, setBulkSending]   = useState(false);

  // ── Individual draft state ────────────────────────────────────────────────
  const [drafts, setDrafts]           = useState<Record<string, DraftState>>({});
  const [activeCroId, setActiveCroId] = useState<string | null>(null);

  // ── Contact form copy state ───────────────────────────────────────────────
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const initialised = useRef(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const raw = sessionStorage.getItem(`brief_${briefId}_selection`);
      if (!raw) { setNoSelection(true); setDataLoaded(true); return; }

      let sel: {
        cros:   Array<{ id: string; name: string; email: string | null; contact_form_url?: string | null }>;
        manual: Array<{ id: string; name: string; email: string }>;
      };
      try { sel = JSON.parse(raw); }
      catch { setNoSelection(true); setDataLoaded(true); return; }

      const combined: CROItem[] = [
        ...sel.cros.map(c => ({ id: c.id, name: c.name, email: c.email, contact_form_url: c.contact_form_url ?? null, isManual: false })),
        ...sel.manual.map(m => ({ id: m.id, name: m.name, email: m.email, contact_form_url: null, isManual: true })),
      ];
      if (combined.length === 0) { setNoSelection(true); setDataLoaded(true); return; }

      setCros(combined);
      setActiveCroId(combined.find(c => c.email)?.id ?? combined[0].id);

      const [briefRes, userRes] = await Promise.all([
        supabase.from('rfp_internal_briefs').select('title, extracted_data').eq('id', briefId).single(),
        supabase.auth.getUser(),
      ]);

      if (briefRes.data) setBrief(briefRes.data as BriefMeta);

      let settings: UserSettings | null = null;
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
            if (settings.response_deadline_days) setDeadlineDays(settings.response_deadline_days);
          }
        } catch { /* ignore */ }
      }
      if (settings) setUserSettings(settings);

      // Load saved drafts
      let savedDrafts: SavedDraft[] = [];
      try {
        const res = await fetch(`/api/biotech/briefs/${briefId}/enquiry`);
        if (res.ok) {
          const json = await res.json();
          savedDrafts = (json.drafts ?? []) as SavedDraft[];
        }
      } catch { /* ignore */ }

      const savedByKey: Record<string, SavedDraft> = {};
      for (const d of savedDrafts) savedByKey[`${d.cro_email}|${d.cro_name}`] = d;

      setDataLoaded(true);
      if (initialised.current) return;
      initialised.current = true;

      // Restore saved drafts into individual draft state
      const initial: Record<string, DraftState> = {};
      for (const cro of combined) {
        const saved = cro.email ? savedByKey[`${cro.email}|${cro.name}`] : undefined;
        if (saved) {
          initial[cro.id] = {
            subject:      saved.subject,
            body:         saved.body,
            status:       saved.status === 'sent' ? 'sent' : 'ready',
            engagementId: saved.engagement_id,
            messageId:    saved.message_id,
          };
        }
      }
      setDrafts(initial);
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefId]);

  // ── Generate template (single AI call) ────────────────────────────────────

  async function handleGenerateTemplate() {
    setTemplateStatus('generating');
    setTemplateError('');
    try {
      const res = await fetch(`/api/biotech/briefs/${briefId}/enquiry`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          cro_id:         null,
          cro_name:       '{{CRO_NAME}}',
          cro_email:      'template@placeholder.invalid',
          include_budget: includeBudget,
          deadline_days:  deadlineDays,
          sender_company: userSettings?.company_name ?? null,
          template_only:  true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setTemplateError((json.error as string) ?? 'Generation failed — please retry');
        setTemplateStatus('idle');
        return;
      }
      const subject = json.subject as string;
      const body    = json.body    as string;
      setTemplateSubject(subject);
      setTemplateBody(body);
      setTemplateStatus('ready');

      // Pre-fill individual drafts (only for CROs not already saved/sent)
      setDrafts(prev => {
        const next = { ...prev };
        for (const cro of cros) {
          if (!cro.email) continue;
          if (next[cro.id]?.status === 'sent') continue;
          next[cro.id] = {
            subject: subject,
            body:    body.replace(/\{\{CRO_NAME\}\}/g, cro.name),
            status:  'ready',
          };
        }
        return next;
      });
    } catch {
      setTemplateError('Network error — please check your connection');
      setTemplateStatus('idle');
    }
  }

  // ── Individual: save + send ───────────────────────────────────────────────

  async function handleIndividualSend(cro: CROItem) {
    const draft = drafts[cro.id];
    if (!draft || draft.status !== 'ready' || !cro.email) return;

    setDrafts(prev => ({ ...prev, [cro.id]: { ...prev[cro.id], status: 'sending' } }));

    try {
      // If no engagementId yet, save via override first
      let engId   = draft.engagementId;
      let msgId   = draft.messageId;

      if (!engId || !msgId) {
        const engRes = await fetch(`/api/biotech/briefs/${briefId}/enquiry`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            cro_id:           cro.isManual ? null : cro.id,
            cro_name:         cro.name,
            cro_email:        cro.email,
            sender_company:   userSettings?.company_name ?? null,
            override_subject: draft.subject,
            override_body:    draft.body,
          }),
        });
        const engJson = await engRes.json();
        if (!engRes.ok) throw new Error((engJson.error as string) ?? 'Failed to save');
        engId = engJson.engagement_id as string;
        msgId = engJson.message_id    as string;
      }

      const sendRes = await fetch(`/api/biotech/briefs/${briefId}/engagements`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          engagement_id: engId,
          message_id:    msgId,
          cro_email:     cro.email,
          subject:       draft.subject,
          body:          draft.body,
        }),
      });
      const sendJson = await sendRes.json();
      if (!sendRes.ok) throw new Error((sendJson.error as string) ?? 'Send failed');

      setDrafts(prev => ({
        ...prev,
        [cro.id]: { ...prev[cro.id], status: 'sent', engagementId: engId, messageId: msgId },
      }));
    } catch (err) {
      setDrafts(prev => ({
        ...prev,
        [cro.id]: { ...prev[cro.id], status: 'error', errorMsg: String(err) },
      }));
    }
  }

  async function handleSendAll() {
    const pending = cros.filter(c => c.email && drafts[c.id]?.status === 'ready');
    for (const cro of pending) await handleIndividualSend(cro);
  }

  // ── Bulk send ─────────────────────────────────────────────────────────────

  async function handleSendBulk() {
    if (!templateBody.trim() || !templateSubject.trim()) return;
    setBulkSending(true);

    const targets = crosWithEmail.filter(c => bulkProgress[c.id] !== 'sent');
    await Promise.all(targets.map(async cro => {
      setBulkProgress(prev => ({ ...prev, [cro.id]: 'sending' }));
      try {
        const personalizedBody = templateBody.replace(/\{\{CRO_NAME\}\}/g, cro.name);
        const engRes = await fetch(`/api/biotech/briefs/${briefId}/enquiry`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            cro_id:           cro.isManual ? null : cro.id,
            cro_name:         cro.name,
            cro_email:        cro.email,
            sender_company:   userSettings?.company_name ?? null,
            override_body:    personalizedBody,
            override_subject: templateSubject,
          }),
        });
        const engJson = await engRes.json();
        if (!engRes.ok) throw new Error((engJson.error as string) ?? 'Failed');

        const sendRes = await fetch(`/api/biotech/briefs/${briefId}/engagements`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            engagement_id: engJson.engagement_id,
            message_id:    engJson.message_id,
            cro_email:     cro.email,
            subject:       templateSubject,
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
    }));

    setBulkSending(false);
  }

  // ── Copy to clipboard ─────────────────────────────────────────────────────

  async function handleCopy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const crosWithEmail = useMemo(() => cros.filter(c => c.email), [cros]);
  const crosNoEmail   = useMemo(() => cros.filter(c => !c.email), [cros]);
  const crosWithForm  = useMemo(() => crosNoEmail.filter(c => c.contact_form_url), [crosNoEmail]);

  const bulkSentCount  = Object.values(bulkProgress).filter(v => v === 'sent').length;
  const indivSentCount = Object.values(drafts).filter(d => d.status === 'sent').length;
  const totalSent      = activeTab === 'bulk' ? bulkSentCount : indivSentCount;

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

  // ── Loading / no-selection ────────────────────────────────────────────────

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
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2.5">
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
                {cros.length} CRO{cros.length !== 1 ? 's' : ''} selected
                {crosWithEmail.length !== cros.length && ` · ${crosWithEmail.length} with email · ${crosWithForm.length} with contact form`}
              </p>
            </div>
            {totalSent > 0 && (
              <span className="text-sm text-gray-500 shrink-0">
                <span className="text-green-600 font-semibold">{totalSent}</span> / {crosWithEmail.length} sent
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

        {/* ── Generate template — single AI call ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Generate outreach template</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                One AI call generates an IP-safe template with <code className="text-amber-600 font-mono">{'{{CRO_NAME}}'}</code> — used across all send modes below.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Options inline */}
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <button
                  role="switch"
                  aria-checked={includeBudget}
                  onClick={() => setIncludeBudget(v => !v)}
                  className={`relative inline-flex h-4 w-8 shrink-0 rounded-full border-2 border-transparent transition-colors ${includeBudget ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${includeBudget ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                Include budget
              </label>
              <select
                value={deadlineDays}
                onChange={e => setDeadlineDays(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {[5, 7, 10, 14, 20].map(d => <option key={d} value={d}>{d} day deadline</option>)}
              </select>
              <button
                onClick={handleGenerateTemplate}
                disabled={templateStatus === 'generating'}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {templateStatus === 'generating'
                  ? <span className="flex items-center gap-2"><svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating…</span>
                  : templateStatus === 'ready' ? '↺ Regenerate template' : '✦ Generate template'
                }
              </button>
            </div>
          </div>
          {templateError && <p className="mt-2 text-xs text-red-600">{templateError}</p>}
          {templateStatus === 'ready' && (
            <div className="mt-4 space-y-2">
              <input
                type="text"
                value={templateSubject}
                onChange={e => setTemplateSubject(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Subject"
              />
              <textarea
                rows={8}
                value={templateBody}
                onChange={e => setTemplateBody(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-mono"
              />
              <p className="text-xs text-gray-400">
                Edit freely — <code className="text-amber-600">{'{{CRO_NAME}}'}</code> is substituted with each CRO's name on send.
              </p>
            </div>
          )}
        </div>

        {/* ── Tabs + content ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">

          {/* Left panel */}
          <aside className="space-y-4">

            {/* IP protection */}
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
                <p className="text-[11px] font-semibold text-red-500 mb-2">✗ NEVER INCLUDED</p>
                <ul className="space-y-1.5">
                  {ALWAYS_EXCLUDED_LABELS.map(item => (
                    <li key={item.label} className="flex items-start gap-2 text-xs text-gray-500">
                      <span className="mt-0.5 shrink-0 text-red-600">✗</span>{item.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Reply-To */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500">Reply-To address</p>
              <p className="text-xs text-gray-700 break-all font-mono">{effectiveReplyTo || '—'}</p>
              <p className="text-xs text-gray-500">
                {usingAuthEmailFallback ? 'Using your login email. ' : ''}
                CRO replies go directly to this inbox.{' '}
                <a href="/biotech/settings" className="text-blue-500 hover:text-blue-600 transition-colors">
                  Change in settings →
                </a>
              </p>
            </div>

            {/* Bulk send status */}
            {activeTab === 'bulk' && Object.keys(bulkProgress).length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Send status</p>
                {crosWithEmail.map(cro => {
                  const prog = bulkProgress[cro.id] ?? 'idle';
                  return (
                    <div key={cro.id} className="flex items-center gap-2 text-xs">
                      <span className="shrink-0">
                        {prog === 'sent'    ? <span className="text-green-600">✓</span>
                       : prog === 'error'   ? <span className="text-red-600">✗</span>
                       : prog === 'sending' ? <svg className="h-3 w-3 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                       : <span className="text-gray-400">–</span>}
                      </span>
                      <span className={`truncate ${prog === 'error' ? 'text-red-600' : prog === 'sent' ? 'text-gray-700' : 'text-gray-500'}`}>
                        {cro.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Right panel */}
          <div className="space-y-4">

            {/* Tabs */}
            <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden">
              {([
                { key: 'bulk',        label: 'Bulk send',      count: crosWithEmail.length },
                { key: 'individual',  label: 'Individual',     count: crosWithEmail.length },
                { key: 'contactform', label: 'Contact forms',  count: crosWithForm.length  },
              ] as { key: SendTab; label: string; count: number }[]).map((tab, i) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    i > 0 ? 'border-l border-gray-200' : ''
                  } ${
                    activeTab === tab.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* ── BULK TAB ── */}
            {activeTab === 'bulk' && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
                {templateStatus !== 'ready' ? (
                  <div className="py-10 text-center text-sm text-gray-500">
                    Generate a template above to enable bulk send.
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">
                      Template will be sent to <span className="font-semibold text-gray-700">{crosWithEmail.length} CROs</span> with <code className="text-amber-600">{'{{CRO_NAME}}'}</code> substituted automatically.
                    </p>
                    {bulkSentCount === crosWithEmail.length && crosWithEmail.length > 0 ? (
                      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                        ✓ All {crosWithEmail.length} enquiries sent successfully.
                      </div>
                    ) : (
                      <button
                        onClick={handleSendBulk}
                        disabled={bulkSending}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {bulkSending
                          ? <span className="flex items-center justify-center gap-2"><svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending…</span>
                          : `Approve & Send to all ${crosWithEmail.length} CROs →`
                        }
                      </button>
                    )}
                    {Object.values(bulkProgress).some(v => v === 'error') && (
                      <p className="text-xs text-red-600">Some sends failed — check the status list on the left and retry.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── INDIVIDUAL TAB ── */}
            {activeTab === 'individual' && (
              <div className="space-y-3">
                {templateStatus !== 'ready' && Object.keys(drafts).length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
                    Generate a template above — it will be pre-filled for each CRO, ready to edit individually.
                  </div>
                ) : (
                  <>
                    {/* CRO tabs */}
                    <div className="flex gap-2 flex-wrap">
                      {crosWithEmail.map(cro => {
                        const d = drafts[cro.id];
                        return (
                          <button
                            key={cro.id}
                            onClick={() => setActiveCroId(cro.id)}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                              activeCroId === cro.id
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {d?.status === 'sent' && <span className="text-green-600">✓</span>}
                            {d?.status === 'error' && <span className="text-red-500">!</span>}
                            {cro.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* Active CRO draft editor */}
                    {activeCroId && (() => {
                      const cro   = crosWithEmail.find(c => c.id === activeCroId);
                      const draft = drafts[activeCroId];
                      if (!cro) return null;

                      if (!draft) {
                        return (
                          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
                            Generate the template above to create a draft for {cro.name}.
                          </div>
                        );
                      }

                      if (draft.status === 'sent') {
                        return (
                          <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-700">
                            ✓ Enquiry sent to {cro.name}.
                          </div>
                        );
                      }

                      return (
                        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
                          <p className="text-xs text-gray-500">To: <span className="font-mono text-gray-700">{cro.email}</span></p>
                          <input
                            type="text"
                            value={draft.subject}
                            onChange={e => setDrafts(prev => ({ ...prev, [cro.id]: { ...prev[cro.id], subject: e.target.value } }))}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Subject"
                          />
                          <textarea
                            rows={10}
                            value={draft.body}
                            onChange={e => setDrafts(prev => ({ ...prev, [cro.id]: { ...prev[cro.id], body: e.target.value } }))}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                          />
                          {draft.status === 'error' && (
                            <p className="text-xs text-red-600">{draft.errorMsg ?? 'Send failed — please retry'}</p>
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleIndividualSend(cro)}
                              disabled={draft.status === 'sending'}
                              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                            >
                              {draft.status === 'sending' ? 'Sending…' : 'Approve & Send →'}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Send all ready */}
                    {crosWithEmail.some(c => drafts[c.id]?.status === 'ready') && (
                      <div className="flex justify-end">
                        <button
                          onClick={handleSendAll}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          Send all ready drafts →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── CONTACT FORM TAB ── */}
            {activeTab === 'contactform' && (
              <div className="space-y-3">
                {crosWithForm.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
                    No CROs in your selection have a contact form URL.
                  </div>
                ) : (
                  <>
                    {templateStatus !== 'ready' && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                        Generate a template above first — it will be pre-filled here for each CRO.
                      </div>
                    )}
                    {crosWithForm.map(cro => {
                      const personalizedText = templateStatus === 'ready'
                        ? templateBody.replace(/\{\{CRO_NAME\}\}/g, cro.name)
                        : '';
                      return (
                        <div key={cro.id} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-gray-900">{cro.name}</h3>
                            <a
                              href={cro.contact_form_url ?? '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                            >
                              Open contact form →
                            </a>
                          </div>
                          {templateStatus === 'ready' ? (
                            <>
                              <p className="text-xs text-gray-500">
                                Subject: <span className="font-medium text-gray-700">{templateSubject}</span>
                              </p>
                              <textarea
                                readOnly
                                rows={7}
                                value={personalizedText}
                                className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none resize-none"
                              />
                              <button
                                onClick={() => handleCopy(cro.id, personalizedText)}
                                className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                {copiedId === cro.id ? '✓ Copied!' : 'Copy text'}
                              </button>
                            </>
                          ) : (
                            <p className="text-xs text-gray-400 italic">Generate template above to see the message.</p>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
