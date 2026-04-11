'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import { SECTION_KEYS, SECTION_META, type SectionKey } from '@biotech/prompts/rfp';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RfpDoc {
  id:                 string;
  brief_id:           string;
  rfp_id:             string;
  completeness_score: number;
  status:             string;
  updated_at:         string;
  [key: string]:      unknown; // s1_header … s10_contact
}

interface Brief {
  id:    string;
  title: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'text-green-400 border-green-700/40 bg-green-900/20' :
    score >= 50 ? 'text-amber-400 border-amber-700/40 bg-amber-900/20' :
                  'text-red-400   border-red-700/40   bg-red-900/20';
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${color}`}>
      <div className="relative h-8 w-8">
        <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth="3" />
          <circle
            cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={`${(score / 100) * 81.7} 81.7`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
          {score}
        </span>
      </div>
      <div>
        <p className="text-xs font-semibold leading-none">Completeness</p>
        <p className="text-[10px] opacity-70 mt-0.5">
          {score >= 80 ? 'Ready to send' : score >= 50 ? 'Gaps remain' : 'Incomplete'}
        </p>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RfpEditorPage() {
  const params   = useParams();
  const router   = useRouter();
  const briefId  = params.id as string;

  const [brief, setBrief]             = useState<Brief | null>(null);
  const [rfpDoc, setRfpDoc]           = useState<RfpDoc | null>(null);
  const [sections, setSections]       = useState<Partial<Record<SectionKey, string>>>({});
  const [loading, setLoading]         = useState(true);
  const [generating, setGenerating]   = useState(false);
  const [genProgress, setGenProgress] = useState<Record<SectionKey, 'pending' | 'generating' | 'done' | 'error'>>({} as Record<SectionKey, 'pending' | 'generating' | 'done' | 'error'>);
  const [activeSection, setActiveSection] = useState<SectionKey>('s1_header');
  const [editedSections, setEditedSections] = useState<Partial<Record<SectionKey, string>>>({});
  const [regenLoading, setRegenLoading] = useState<SectionKey | null>(null);
  const [saveStatus, setSaveStatus]   = useState<'idle' | 'saving' | 'saved'>('idle');
  const [score, setScore]             = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const [{ data: briefData }, { data: rfpData }] = await Promise.all([
      supabase.from('rfp_internal_briefs').select('id, title').eq('id', briefId).single(),
      supabase.from('rfp_documents').select('*').eq('brief_id', briefId).maybeSingle(),
    ]);

    if (briefData) setBrief(briefData as Brief);
    if (rfpData) {
      setRfpDoc(rfpData as RfpDoc);
      setScore((rfpData as RfpDoc).completeness_score ?? 0);
      const s: Partial<Record<SectionKey, string>> = {};
      for (const key of SECTION_KEYS) {
        const val = (rfpData as Record<string, unknown>)[key];
        if (typeof val === 'string' && val) s[key] = val;
      }
      setSections(s);
    }
    setLoading(false);
  }, [briefId, router]);

  useEffect(() => { void load(); }, [load]);

  // Merge edits into display — editedSections overrides saved sections
  const displaySections = { ...sections, ...editedSections };

  // ── Auto-save edited sections ─────────────────────────────────────────────

  function handleEdit(key: SectionKey, value: string) {
    setEditedSections(prev => ({ ...prev, [key]: value }));
    setSaveStatus('idle');

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      await supabase
        .from('rfp_documents')
        .update({ [key]: value, updated_at: new Date().toISOString() })
        .eq('brief_id', briefId);
      setSaveStatus('saved');
    }, 1500);
  }

  // ── Full generation (streaming) ───────────────────────────────────────────

  async function handleGenerate(sectionsToRegen?: SectionKey[]) {
    setGenerating(true);

    const initProgress = {} as Record<SectionKey, 'pending' | 'generating' | 'done' | 'error'>;
    for (const k of SECTION_KEYS) initProgress[k] = sectionsToRegen ? (sectionsToRegen.includes(k) ? 'pending' : 'done') : 'pending';
    setGenProgress(initProgress);

    try {
      const body = sectionsToRegen ? { sections: sectionsToRegen } : undefined;
      const res  = await fetch(`/api/biotech/briefs/${briefId}/rfp/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok || !res.body) {
        console.error('Generate failed');
        setGenerating(false);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              type: string;
              section?: string;
              text?: string;
              status?: string;
              completeness_score?: number;
              rfp_id?: string;
            };

            if (event.type === 'progress' && event.section) {
              setGenProgress(p => ({ ...p, [event.section!]: 'generating' }));
            }
            if (event.type === 'section' && event.section && event.text) {
              const key = event.section as SectionKey;
              setSections(p => ({ ...p, [key]: event.text! }));
              setGenProgress(p => ({ ...p, [key]: event.status === 'error' ? 'error' : 'done' }));
            }
            if (event.type === 'complete') {
              if (event.completeness_score !== undefined) setScore(event.completeness_score);
              await load(); // refresh rfpDoc with new rfp_id etc.
            }
          } catch { /* malformed line */ }
        }
      }
    } finally {
      setGenerating(false);
      setEditedSections({});
    }
  }

  // ── Per-section regeneration ──────────────────────────────────────────────

  async function handleRegenSection(key: SectionKey) {
    setRegenLoading(key);
    const res  = await fetch(`/api/biotech/briefs/${briefId}/rfp/section`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ section: key }),
    });
    const json = await res.json() as { text?: string; completeness_score?: number; error?: string };

    if (res.ok && json.text) {
      setSections(p => ({ ...p, [key]: json.text! }));
      setEditedSections(p => { const n = { ...p }; delete n[key]; return n; });
      if (json.completeness_score !== undefined) setScore(json.completeness_score);
    }
    setRegenLoading(null);
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

  const hasRfp    = Object.keys(sections).length > 0;
  const currentText = displaySections[activeSection] ?? '';
  const isEdited  = !!editedSections[activeSection];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-6xl px-5 py-8 space-y-6">

        {/* ── Header ── */}
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
            <span className="text-gray-400">RFP</span>
          </nav>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-white">
                {rfpDoc?.rfp_id ? `${rfpDoc.rfp_id} — ` : ''}RFP Draft
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {brief?.title ?? 'Study brief'} · 10 sections · editable
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {hasRfp && <ScoreBadge score={score} />}
              {saveStatus === 'saving' && <span className="text-xs text-gray-600">Saving…</span>}
              {saveStatus === 'saved'  && <span className="text-xs text-green-500">✓ Saved</span>}
              <button
                onClick={() => handleGenerate()}
                disabled={generating}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {generating ? 'Generating…' : hasRfp ? '↺ Regenerate all' : '✦ Generate RFP'}
              </button>
              {hasRfp && (
                <a
                  href={`/biotech/briefs/${briefId}/rfp/send`}
                  className="rounded-xl border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:border-blue-600 hover:text-blue-300"
                >
                  Send RFP →
                </a>
              )}
            </div>
          </div>
        </header>

        {/* ── Completeness warning ── */}
        {hasRfp && score < 60 && (
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 flex items-start gap-3">
            <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-medium text-amber-300">Completeness score below 60</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Sections marked [TO BE SPECIFIED] need to be resolved before this RFP is ready to send.
                Review open questions from your meeting debriefs and fill in the gaps.
              </p>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!hasRfp && !generating && (
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 px-8 py-20 text-center">
            <p className="text-2xl mb-3">📄</p>
            <h2 className="text-base font-semibold text-white mb-2">No RFP generated yet</h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
              Click Generate RFP to create all 10 sections from your brief, meeting notes, and CRO conversations.
              Each section is independently editable and regeneratable.
            </p>
            <button
              onClick={() => handleGenerate()}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              ✦ Generate RFP
            </button>
          </div>
        )}

        {/* ── Generation progress ── */}
        {generating && (
          <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
              Generating RFP sections…
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {SECTION_KEYS.map(key => {
                const st = genProgress[key] ?? 'pending';
                return (
                  <div
                    key={key}
                    className={`rounded-lg border px-3 py-2 text-center transition-all ${
                      st === 'done'      ? 'border-green-800/40 bg-green-950/20 text-green-400' :
                      st === 'generating'? 'border-blue-700/40 bg-blue-950/20 text-blue-300' :
                      st === 'error'     ? 'border-red-800/40 bg-red-950/20 text-red-400' :
                                           'border-gray-800 text-gray-700'
                    }`}
                  >
                    <p className="text-[10px] font-medium leading-tight">
                      {SECTION_META[key].label.replace(/^\d+\.\s/, '')}
                    </p>
                    <div className="mt-1.5">
                      {st === 'generating' ? (
                        <svg className="h-3 w-3 mx-auto animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : st === 'done' ? (
                        <span className="text-[10px]">✓</span>
                      ) : st === 'error' ? (
                        <span className="text-[10px]">✗</span>
                      ) : (
                        <span className="text-[10px] text-gray-700">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Editor: two-column (section nav + content) ── */}
        {hasRfp && !generating && (
          <div className="grid grid-cols-[200px_1fr] gap-5 items-start">

            {/* Section nav */}
            <nav className="sticky top-4 space-y-0.5">
              {SECTION_KEYS.map(key => {
                const hasContent = !!(displaySections[key]?.length ?? 0 > 0);
                const hasGap     = displaySections[key]?.includes('[TO BE SPECIFIED]') ?? false;
                const edited     = !!editedSections[key];
                return (
                  <button
                    key={key}
                    onClick={() => setActiveSection(key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[11px] leading-tight transition-colors flex items-center justify-between gap-1 ${
                      activeSection === key
                        ? 'bg-blue-600/20 text-blue-300 font-medium'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                    }`}
                  >
                    <span className="flex-1">{SECTION_META[key].label}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {hasGap   && <span className="text-amber-500" title="Has gaps">●</span>}
                      {edited   && <span className="text-blue-500"  title="Unsaved edits">·</span>}
                      {!hasContent && <span className="text-red-600" title="Missing">✗</span>}
                    </span>
                  </button>
                );
              })}
              <div className="pt-3 border-t border-gray-800 mt-2">
                <div className="px-2">
                  <ScoreBadge score={score} />
                </div>
              </div>
            </nav>

            {/* Section editor */}
            <div className="space-y-3">
              {/* Section header */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {SECTION_META[activeSection].label}
                  </h2>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {SECTION_META[activeSection].description}
                  </p>
                </div>
                <button
                  onClick={() => handleRegenSection(activeSection)}
                  disabled={regenLoading === activeSection}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-blue-600/40 hover:text-blue-300 disabled:opacity-50"
                >
                  {regenLoading === activeSection ? (
                    <>
                      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Regenerating…
                    </>
                  ) : (
                    <>↺ Re-generate section</>
                  )}
                </button>
              </div>

              {/* Gap warning */}
              {currentText.includes('[TO BE SPECIFIED]') && (
                <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
                  This section has <strong>[TO BE SPECIFIED]</strong> placeholders — resolve open questions from your meeting debriefs, then re-generate.
                </div>
              )}

              {/* Editable textarea */}
              <textarea
                key={activeSection}
                value={currentText}
                onChange={e => handleEdit(activeSection, e.target.value)}
                rows={24}
                className="w-full resize-y rounded-xl border border-gray-700 bg-gray-900/80 px-5 py-4 text-sm text-gray-200 leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                placeholder="No content generated yet — click Generate RFP or Re-generate section."
              />

              {/* Section footer */}
              <div className="flex items-center justify-between text-xs text-gray-700">
                <span>{currentText.length} chars</span>
                <span>
                  {isEdited ? (
                    <span className="text-blue-500">Edited — auto-saving…</span>
                  ) : (
                    <span>Click section nav to switch · edits auto-save</span>
                  )}
                </span>
              </div>

              {/* Navigate between sections */}
              <div className="flex justify-between pt-1">
                {(() => {
                  const idx = SECTION_KEYS.indexOf(activeSection);
                  const prev = idx > 0 ? SECTION_KEYS[idx - 1] : null;
                  const next = idx < SECTION_KEYS.length - 1 ? SECTION_KEYS[idx + 1] : null;
                  return (
                    <>
                      <button
                        onClick={() => prev && setActiveSection(prev)}
                        disabled={!prev}
                        className="text-xs text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-30"
                      >
                        ← {prev ? SECTION_META[prev].label : ''}
                      </button>
                      <button
                        onClick={() => next && setActiveSection(next)}
                        disabled={!next}
                        className="text-xs text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-30"
                      >
                        {next ? SECTION_META[next].label : ''} →
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
