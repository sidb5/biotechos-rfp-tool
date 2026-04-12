'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  [key: string]:      unknown;
}

interface Brief {
  id:    string;
  title: string | null;
}

interface RfpNote {
  id:              string;
  text:            string;
  type:            'rfp_refinement' | 'open_question';
  source_cro_name: string;
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

/**
 * Renders an inline text fragment — converts **bold** and [TO BE SPECIFIED]
 * into React elements. All other text is returned as-is.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[TO BE SPECIFIED[^\]]*\])/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-gray-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('[TO BE SPECIFIED')) {
      return (
        <mark
          key={`${keyPrefix}-m${i}`}
          className="bg-amber-400/20 text-amber-300 border border-amber-500/40 rounded px-1 py-0.5 font-mono text-xs font-semibold not-italic"
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

/**
 * Renders section text with full markdown support:
 * # Heading, ## Subheading, **bold**, - bullets, 1. numbered lists,
 * and [TO BE SPECIFIED] amber highlights.
 */
function RenderedSection({ text }: { text: string }) {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/);

  return (
    <div className="space-y-2.5 text-sm text-gray-300 leading-relaxed font-sans">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter(l => l.trim());
        if (lines.length === 0) return null;
        const first = lines[0].trim();

        // # Heading
        if (first.startsWith('# ')) {
          return (
            <h3 key={bi} className="text-base font-bold text-white mt-3 mb-0.5">
              {renderInline(first.slice(2), `${bi}`)}
            </h3>
          );
        }

        // ## Subheading
        if (first.startsWith('## ')) {
          return (
            <h4 key={bi} className="text-sm font-semibold text-gray-200 mt-2 mb-0.5">
              {renderInline(first.slice(3), `${bi}`)}
            </h4>
          );
        }

        // Bullet list
        const isBullet = lines.every(l => /^[-*]\s/.test(l.trim()));
        if (isBullet) {
          return (
            <ul key={bi} className="list-disc list-inside space-y-1 pl-1">
              {lines.map((l, li) => (
                <li key={li} className="text-sm text-gray-300">
                  {renderInline(l.trim().replace(/^[-*]\s+/, ''), `${bi}-${li}`)}
                </li>
              ))}
            </ul>
          );
        }

        // Numbered list
        const isNumbered = lines.every(l => /^\d+\.\s/.test(l.trim()));
        if (isNumbered) {
          return (
            <ol key={bi} className="list-decimal list-inside space-y-1 pl-1">
              {lines.map((l, li) => (
                <li key={li} className="text-sm text-gray-300">
                  {renderInline(l.trim().replace(/^\d+\.\s+/, ''), `${bi}-${li}`)}
                </li>
              ))}
            </ol>
          );
        }

        // Plain paragraph (may have soft line breaks)
        return (
          <p key={bi} className="text-sm text-gray-300 leading-relaxed">
            {lines.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {renderInline(line, `${bi}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Pull out every [TO BE SPECIFIED...] occurrence with surrounding context. */
function extractGaps(text: string): { placeholder: string; context: string }[] {
  const gaps: { placeholder: string; context: string }[] = [];
  const re = /\[TO BE SPECIFIED[^\]]*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start   = Math.max(0, m.index - 60);
    const end     = Math.min(text.length, m.index + m[0].length + 60);
    const context = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    gaps.push({ placeholder: m[0], context });
  }
  return gaps;
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
  const [previewMode, setPreviewMode] = useState(false); // toggle between edit textarea and rendered preview
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context notes from meeting debriefs
  const [contextNotes, setContextNotes]       = useState<RfpNote[]>([]);
  const [showContextPanel, setShowContextPanel] = useState(false);

  // Section templates
  const [templates, setTemplates]     = useState<Partial<Record<SectionKey, string>>>({});
  const [templateSaving, setTemplateSaving]   = useState(false);
  const [templateSaveStatus, setTemplateSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

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

    // Load context notes (resilient — column might not be migrated yet)
    try {
      const { data: notesRow } = await supabase
        .from('rfp_internal_briefs')
        .select('rfp_context_notes')
        .eq('id', briefId)
        .single();
      if (Array.isArray(notesRow?.rfp_context_notes)) {
        setContextNotes(notesRow.rfp_context_notes as RfpNote[]);
      }
    } catch { /* column not yet migrated */ }

    // Load user's section templates (resilient)
    try {
      const res = await fetch(`/api/biotech/briefs/${briefId}/rfp/templates`);
      if (res.ok) {
        const json = await res.json() as { templates?: Record<string, string> };
        setTemplates((json.templates ?? {}) as Partial<Record<SectionKey, string>>);
      }
    } catch { /* ignore */ }

    setLoading(false);
  }, [briefId, router]);

  useEffect(() => { void load(); }, [load]);

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

  // ── Save section as template ───────────────────────────────────────────────

  async function handleSaveTemplate(key: SectionKey) {
    const content = displaySections[key];
    if (!content?.trim()) return;
    setTemplateSaving(true);
    setTemplateSaveStatus('idle');

    const res = await fetch(`/api/biotech/briefs/${briefId}/rfp/templates`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ section: key, content }),
    });
    if (res.ok) {
      const json = await res.json() as { templates?: Record<string, string> };
      setTemplates((json.templates ?? {}) as Partial<Record<SectionKey, string>>);
      setTemplateSaveStatus('saved');
      setTimeout(() => setTemplateSaveStatus('idle'), 3000);
    } else {
      setTemplateSaveStatus('error');
    }
    setTemplateSaving(false);
  }

  async function handleClearTemplate(key: SectionKey) {
    await fetch(`/api/biotech/briefs/${briefId}/rfp/templates`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ section: key }),
    });
    setTemplates(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  async function handleLoadTemplate(key: SectionKey) {
    const tmpl = templates[key];
    if (!tmpl) return;
    handleEdit(key, tmpl);
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
              await load();
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

  const hasRfp      = Object.keys(sections).length > 0;
  const currentText = displaySections[activeSection] ?? '';
  const isEdited    = !!editedSections[activeSection];
  const currentGaps = extractGaps(currentText);
  const hasGaps     = currentGaps.length > 0;
  const hasTemplate = !!templates[activeSection];

  const refinements    = contextNotes.filter(n => n.type === 'rfp_refinement');
  const openQuestions  = contextNotes.filter(n => n.type === 'open_question');

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

              {/* PDF / print */}
              {hasRfp && (
                <a
                  href={`/biotech/briefs/${briefId}/rfp/print`}
                  target="_blank"
                  rel="noopener"
                  className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors"
                  title="Print or save as PDF"
                >
                  🖨 Print / PDF
                </a>
              )}

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

        {/* ── Context notes panel ── */}
        {contextNotes.length > 0 && (
          <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20">
            <button
              onClick={() => setShowContextPanel(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-indigo-400">📌</span>
                <span className="text-sm font-medium text-indigo-300">
                  Context from your meetings
                </span>
                <span className="text-xs text-indigo-700">
                  {refinements.length} refinement{refinements.length !== 1 ? 's' : ''} ·{' '}
                  {openQuestions.length} open question{openQuestions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="text-indigo-600 text-sm">{showContextPanel ? '▲' : '▼'}</span>
            </button>

            {showContextPanel && (
              <div className="px-4 pb-4 space-y-4 border-t border-indigo-800/30 pt-4">

                {/* Explain the flow */}
                <div className="rounded-lg bg-indigo-900/20 border border-indigo-800/30 px-3 py-2 text-xs text-indigo-400">
                  <strong>How this works:</strong> Items you marked{' '}
                  <span className="bg-blue-900/40 text-blue-300 px-1 rounded">+ RFP</span> in meeting debriefs are shown here.
                  <strong> RFP refinements</strong> are written directly into the relevant sections when you generate.
                  <strong> Open questions</strong> become{' '}
                  <span className="bg-amber-900/30 text-amber-400 px-1 rounded font-mono">[TO BE SPECIFIED]</span>{' '}
                  placeholders — they mark gaps you still need to fill.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* RFP refinements */}
                  {refinements.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-2">
                        ✍ Written into RFP ({refinements.length})
                      </p>
                      <ul className="space-y-1.5">
                        {refinements.map(n => (
                          <li key={n.id} className="flex items-start gap-2 text-xs text-gray-400">
                            <span className="mt-0.5 shrink-0 text-blue-600">→</span>
                            <span className="flex-1">{n.text}</span>
                            <span className="shrink-0 text-[10px] text-gray-700">{n.source_cro_name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Open questions */}
                  {openQuestions.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-2">
                        ❓ Still open → [TO BE SPECIFIED] ({openQuestions.length})
                      </p>
                      <ul className="space-y-1.5">
                        {openQuestions.map(n => (
                          <li key={n.id} className="flex items-start gap-2 text-xs text-gray-400">
                            <span className="mt-0.5 shrink-0 text-amber-600">?</span>
                            <span className="flex-1">{n.text}</span>
                            <span className="shrink-0 text-[10px] text-gray-700">{n.source_cro_name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No context notes yet — explain what they are */}
        {contextNotes.length === 0 && hasRfp && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/20 px-4 py-3 flex items-start gap-3">
            <span className="text-gray-600 text-lg mt-0.5">💡</span>
            <div className="text-xs text-gray-600 space-y-0.5">
              <p className="text-gray-500 font-medium">No meeting context yet</p>
              <p>
                Go into an engagement, add meeting notes, and mark items{' '}
                <span className="text-blue-400">+ RFP</span> in the debrief panel.
                Those selections feed directly into this RFP when you generate.
                Open questions become <span className="font-mono text-amber-500">[TO BE SPECIFIED]</span> placeholders.
              </p>
            </div>
          </div>
        )}

        {/* ── Completeness warning ── */}
        {hasRfp && score < 60 && (
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 flex items-start gap-3">
            <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-medium text-amber-300">Completeness score below 60</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Sections marked <span className="font-mono">[TO BE SPECIFIED]</span> need to be resolved.
                These come from open questions in your meeting debriefs — mark more items as resolved
                in the engagement thread, then regenerate.
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
                      st === 'done'       ? 'border-green-800/40 bg-green-950/20 text-green-400' :
                      st === 'generating' ? 'border-blue-700/40 bg-blue-950/20 text-blue-300' :
                      st === 'error'      ? 'border-red-800/40 bg-red-950/20 text-red-400' :
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

        {/* ── Editor: two-column ── */}
        {hasRfp && !generating && (
          <div className="grid grid-cols-[200px_1fr] gap-5 items-start">

            {/* Section nav */}
            <nav className="sticky top-4 space-y-0.5">
              {SECTION_KEYS.map(key => {
                const hasContent = !!(displaySections[key]?.length ?? 0 > 0);
                const hasGap     = displaySections[key]?.includes('[TO BE SPECIFIED]') ?? false;
                const edited     = !!editedSections[key];
                const hasTmpl    = !!templates[key];
                return (
                  <button
                    key={key}
                    onClick={() => { setActiveSection(key); setPreviewMode(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[11px] leading-tight transition-colors flex items-center justify-between gap-1 ${
                      activeSection === key
                        ? 'bg-blue-600/20 text-blue-300 font-medium'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                    }`}
                  >
                    <span className="flex-1">{SECTION_META[key].label}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {hasGap   && <span className="text-amber-500" title="Has [TO BE SPECIFIED] gaps">●</span>}
                      {edited   && <span className="text-blue-500"  title="Unsaved edits">·</span>}
                      {hasTmpl  && <span className="text-indigo-500" title="Template saved">⊙</span>}
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
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {SECTION_META[activeSection].label}
                    {hasGaps && (
                      <span className="ml-2 rounded-full bg-amber-900/40 text-amber-400 text-[10px] font-normal px-2 py-0.5 border border-amber-800/40">
                        {currentGaps.length} gap{currentGaps.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {SECTION_META[activeSection].description}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* Template controls */}
                  {hasTemplate && !displaySections[activeSection] && (
                    <button
                      onClick={() => handleLoadTemplate(activeSection)}
                      className="text-[11px] rounded-lg border border-indigo-700/50 bg-indigo-900/20 px-2.5 py-1 text-indigo-300 hover:bg-indigo-900/40 transition-colors"
                    >
                      ⊙ Load my template
                    </button>
                  )}
                  {displaySections[activeSection] && (
                    <button
                      onClick={() => handleSaveTemplate(activeSection)}
                      disabled={templateSaving}
                      className="text-[11px] rounded-lg border border-gray-700 px-2.5 py-1 text-gray-500 hover:text-indigo-300 hover:border-indigo-700/50 transition-colors disabled:opacity-50"
                      title="Save this content as your default for this section in future RFPs"
                    >
                      {templateSaving ? '…' : templateSaveStatus === 'saved' ? '⊙ Saved as template' : '⊙ Save as my default'}
                    </button>
                  )}
                  {hasTemplate && displaySections[activeSection] && (
                    <button
                      onClick={() => handleClearTemplate(activeSection)}
                      className="text-[10px] text-gray-700 hover:text-red-400 transition-colors"
                      title="Remove saved template for this section"
                    >
                      ✕ Clear template
                    </button>
                  )}
                  <button
                    onClick={() => handleRegenSection(activeSection)}
                    disabled={regenLoading === activeSection}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-blue-600/40 hover:text-blue-300 disabled:opacity-50"
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
                      <>↺ Re-generate</>
                    )}
                  </button>
                </div>
              </div>

              {/* [TO BE SPECIFIED] gap list — visual breakdown */}
              {hasGaps && (
                <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
                      ⚠ {currentGaps.length} unresolved gap{currentGaps.length !== 1 ? 's' : ''} in this section
                    </p>
                    <p className="text-[10px] text-amber-700">
                      From open questions in your meeting debriefs
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {currentGaps.map((g, i) => (
                      <li key={i} className="rounded-lg bg-amber-950/30 px-3 py-2 text-xs">
                        <span className="font-mono font-semibold text-amber-300">{g.placeholder}</span>
                        <p className="text-amber-800 mt-1 leading-relaxed text-[11px]">
                          …{g.context.slice(g.placeholder.length)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-amber-800">
                    To resolve: go back to your engagement threads, mark the relevant open questions as resolved,
                    then re-generate this section.
                  </p>
                </div>
              )}

              {/* Edit / Preview toggle */}
              <div className="flex items-center justify-between">
                <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs">
                  <button
                    onClick={() => setPreviewMode(false)}
                    className={`px-3 py-1.5 transition-colors ${!previewMode ? 'bg-gray-700 text-white font-medium' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    ✏ Edit
                  </button>
                  <button
                    onClick={() => setPreviewMode(true)}
                    className={`px-3 py-1.5 transition-colors ${previewMode ? 'bg-gray-700 text-white font-medium' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    👁 Preview
                    {hasGaps && <span className="ml-1.5 rounded-full bg-amber-500/20 text-amber-400 px-1.5 py-0.5 text-[10px]">{currentGaps.length}</span>}
                  </button>
                </div>
                <span className="text-xs text-gray-700">
                  {isEdited ? (
                    <span className="text-blue-500">Edited — auto-saving…</span>
                  ) : saveStatus === 'saving' ? (
                    <span className="text-gray-600">Saving…</span>
                  ) : saveStatus === 'saved' ? (
                    <span className="text-green-500">✓ Saved</span>
                  ) : (
                    <span>auto-save on</span>
                  )}
                </span>
              </div>

              {/* Preview mode — rendered with [TO BE SPECIFIED] highlighted */}
              {previewMode ? (
                <div
                  className={`min-h-[400px] rounded-xl border px-5 py-4 cursor-text ${
                    hasGaps
                      ? 'border-amber-700/40 bg-amber-950/10'
                      : 'border-gray-700/60 bg-gray-900/40'
                  }`}
                  onClick={() => setPreviewMode(false)}
                  title="Click to edit"
                >
                  {currentText
                    ? <RenderedSection text={currentText} />
                    : <p className="text-sm text-gray-600 italic">No content yet — switch to Edit to write.</p>
                  }
                  {hasGaps && (
                    <p className="mt-4 text-[10px] text-amber-700">
                      Click anywhere to edit · <span className="font-mono text-amber-500">[TO BE SPECIFIED]</span> placeholders are highlighted above
                    </p>
                  )}
                </div>
              ) : (
                /* Edit mode — raw monospace textarea */
                <textarea
                  key={activeSection}
                  value={currentText}
                  onChange={e => handleEdit(activeSection, e.target.value)}
                  rows={24}
                  className={`w-full resize-y rounded-xl border px-5 py-4 text-sm text-gray-200 leading-relaxed focus:outline-none focus:ring-1 font-mono bg-gray-900/80 ${
                    hasGaps
                      ? 'border-amber-700/50 focus:border-amber-500 focus:ring-amber-500'
                      : 'border-gray-700 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  placeholder="No content generated yet — click Generate RFP or Re-generate section."
                />
              )}

              {/* Section footer */}
              <div className="flex items-center justify-between text-xs text-gray-700">
                <span>{currentText.length} chars</span>
                <span>⊙ save as template · edits auto-save</span>
              </div>

              {/* Navigate between sections */}
              <div className="flex justify-between pt-1">
                {(() => {
                  const idx  = SECTION_KEYS.indexOf(activeSection);
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
