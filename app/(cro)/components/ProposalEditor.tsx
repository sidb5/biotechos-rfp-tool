'use client';

import React, { useState, useRef } from 'react';
import type { ProposalSection, SectionName, Gap } from '@cro/types';
import VersionHistoryPanel from '@cro/components/VersionHistoryPanel';
import Tooltip from '@shared/components/Tooltip';
import PricingGrid, { type InvestmentRow } from '@cro/components/PricingGrid';
import GapPanel from '@cro/components/GapPanel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─── Citation highlighting helpers ───────────────────────────────────────────

interface GapCitationLocal {
  gap_id: string;
  answered_by: string;
  answered_at: string | null;
  value_used: string;
  inserted_in_section: string;
}

function highlightTextNode(text: string, citations: GapCitationLocal[]): React.ReactNode {
  if (!citations.length || !text.trim()) return text;

  let segments: React.ReactNode[] = [text];

  for (const cit of citations) {
    const val = cit.value_used;
    if (!val || val.length < 2) continue;

    const next: React.ReactNode[] = [];
    for (const seg of segments) {
      if (typeof seg !== 'string') { next.push(seg); continue; }

      const lower = seg.toLowerCase();
      const valLower = val.toLowerCase();
      let cursor = 0;
      let found = false;

      while (cursor < seg.length) {
        const idx = lower.indexOf(valLower, cursor);
        if (idx === -1) break;
        found = true;
        if (idx > cursor) next.push(seg.slice(cursor, idx));
        const date = cit.answered_at
          ? new Date(cit.answered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : null;
        const tip = `Confirmed by ${cit.answered_by}${date ? ` · ${date}` : ''}`;
        next.push(
          <span
            key={`${cit.gap_id}-${idx}`}
            title={tip}
            className="bg-amber-100 border-b-2 border-amber-500 text-amber-900 font-medium cursor-help rounded-sm px-0.5"
          >
            {seg.slice(idx, idx + val.length)}
          </span>
        );
        cursor = idx + val.length;
      }
      if (!found || cursor < seg.length) next.push(seg.slice(cursor));
    }
    segments = next;
  }

  return <>{segments}</>;
}

function processChildren(children: React.ReactNode, citations: GapCitationLocal[]): React.ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === 'string') return highlightTextNode(child, citations);
    if (React.isValidElement(child) && child.props && (child.props as { children?: React.ReactNode }).children) {
      return React.cloneElement(
        child as React.ReactElement<{ children?: React.ReactNode }>,
        {},
        processChildren((child.props as { children?: React.ReactNode }).children, citations)
      );
    }
    return child;
  });
}

// ─── Click-to-edit section: rendered markdown → textarea on click ─────────────

function SectionEditor({
  content, onChange, citations = [],
}: {
  content: string;
  onChange: (v: string) => void;
  citations?: GapCitationLocal[];
}) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function startEdit() {
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const mdComponents = citations.length > 0 ? {
    p:      ({ children }: { children?: React.ReactNode }) => <p>{processChildren(children, citations)}</p>,
    li:     ({ children }: { children?: React.ReactNode }) => <li>{processChildren(children, citations)}</li>,
    strong: ({ children }: { children?: React.ReactNode }) => <strong>{processChildren(children, citations)}</strong>,
    em:     ({ children }: { children?: React.ReactNode }) => <em>{processChildren(children, citations)}</em>,
  } : undefined;

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        className="w-full min-h-[220px] text-sm text-gray-800 border border-gray-200 rounded-lg p-4 resize-y focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent leading-relaxed"
        defaultValue={content}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      onClick={startEdit}
      title="Click to edit"
      className="cursor-text rounded-lg px-4 py-3 hover:bg-gray-50 hover:ring-1 hover:ring-gray-200 transition-all group relative"
    >
      <div className="prose prose-sm prose-gray max-w-none
        prose-headings:font-semibold prose-headings:text-gray-900
        prose-h2:text-base prose-h3:text-sm
        prose-p:text-gray-800 prose-p:leading-relaxed
        prose-strong:text-gray-900
        prose-ul:text-gray-800 prose-ol:text-gray-800
        prose-li:my-0.5">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content || '*Empty — click to write*'}</ReactMarkdown>
      </div>
      <span className="absolute top-2 right-2 text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
        Click to edit
      </span>
    </div>
  );
}

// ─── Section labels ──────────────────────────────────────────────────────────

const SECTION_LABELS: Record<SectionName, string> = {
  executive_summary:      'Executive Summary',
  technical_approach:     'Technical Approach',
  team_qualifications:    'Team Qualifications',
  facility_overview:      'Facility Overview',
  proposed_timeline:      'Proposed Timeline',
  pricing:                'Pricing',
  assumptions_exclusions: 'Assumptions & Exclusions',
};

// Pricing lives at the very bottom as a structured grid, not a section textarea
const SECTION_ORDER: SectionName[] = [
  'executive_summary',
  'technical_approach',
  'team_qualifications',
  'facility_overview',
  'proposed_timeline',
  'assumptions_exclusions',
  'pricing', // kept last so orderedSections filter can exclude it
];

interface Props {
  proposalId: string;
  initialSections: ProposalSection[];
  /** Investment rows from quote_data — renders as a pricing grid instead of a textarea */
  investmentRows?: InvestmentRow[];
  onInvestmentChange?: (rows: InvestmentRow[]) => void;
  hasSavedRates?: boolean;
  hideUnitPrices?: boolean;
  /** SME-confirmed data citations for this proposal */
  gapCitations?: unknown[];
  /** Called when user clicks "✓ Verified data" badge — switches to SME Answers tab */
  onViewAnswers?: () => void;
}

export default function ProposalEditor({
  proposalId, initialSections,
  investmentRows, onInvestmentChange, hasSavedRates = false, hideUnitPrices = false,
  gapCitations, onViewAnswers,
}: Props) {
  const citations = (gapCitations ?? []) as GapCitationLocal[];
  const [sections, setSections] = useState<ProposalSection[]>(initialSections);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [savingToLibrary, setSavingToLibrary] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [versionPanel, setVersionPanel] = useState<{ sectionId: string; sectionName: SectionName } | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function saveToLibrary(sectionId: string | undefined, sectionName: string) {
    if (!sectionId || savingToLibrary) return;
    setSavingToLibrary(sectionName);
    try {
      const res = await fetch('/api/library/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_section_id: sectionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? 'Failed to save to library', 'error');
      } else {
        showToast(data.updated ? 'Library entry updated' : 'Saved to content library');
      }
    } catch {
      showToast('Network error — could not save to library', 'error');
    } finally {
      setSavingToLibrary(null);
    }
  }

  // Sort sections by SECTION_ORDER; exclude 'pricing' when we have a grid to render instead
  const orderedSections = SECTION_ORDER
    .filter(name => !(name === 'pricing' && investmentRows !== undefined))
    .map(name => sections.find(s => s.section_name === name))
    .filter(Boolean) as ProposalSection[];

  function updateContent(sectionName: string, newContent: string) {
    setSections(prev =>
      prev.map(s => s.section_name === sectionName ? { ...s, content: newContent } : s)
    );
  }

  function scheduleAutoSave(sectionName: string, content: string) {
    // Debounce: save 1.5s after the user stops typing
    if (saveTimers.current[sectionName]) {
      clearTimeout(saveTimers.current[sectionName]);
    }
    saveTimers.current[sectionName] = setTimeout(() => {
      saveSection(sectionName, content);
    }, 1500);
  }

  async function saveSection(sectionName: string, content: string) {
    setSavingSection(sectionName);
    try {
      const res = await fetch(`/api/proposal/section`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId, section_name: sectionName, content }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSectionErrors(prev => ({ ...prev, [sectionName]: err.error ?? 'Save failed' }));
      } else {
        setSectionErrors(prev => {
          const next = { ...prev };
          delete next[sectionName];
          return next;
        });
      }
    } catch {
      setSectionErrors(prev => ({ ...prev, [sectionName]: 'Network error — save failed' }));
    } finally {
      setSavingSection(null);
    }
  }

  async function regenerateSection(sectionName: SectionName) {
    if (regeneratingSection) return;
    const confirmed = window.confirm(
      `Replace "${SECTION_LABELS[sectionName]}" with a new AI-generated version? Your current edits will be lost.`
    );
    if (!confirmed) return;

    setRegeneratingSection(sectionName);
    setSectionErrors(prev => {
      const next = { ...prev };
      delete next[sectionName];
      return next;
    });

    try {
      const res = await fetch('/api/proposal/regenerate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId, section_name: sectionName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSectionErrors(prev => ({ ...prev, [sectionName]: data.error ?? 'Regeneration failed' }));
      } else {
        setSections(prev =>
          prev.map(s =>
            s.section_name === sectionName
              ? { ...s, content: data.content, is_ai_generated: true }
              : s
          )
        );
      }
    } catch {
      setSectionErrors(prev => ({ ...prev, [sectionName]: 'Network error — regeneration failed' }));
    } finally {
      setRegeneratingSection(null);
    }
  }

  // Section-by-section generation with progress
  const GENERATE_STEPS: { name: SectionName; label: string }[] = [
    { name: 'executive_summary',      label: 'Executive Summary' },
    { name: 'technical_approach',     label: 'Technical Approach' },
    { name: 'team_qualifications',    label: 'Team Qualifications' },
    { name: 'facility_overview',      label: 'Facility Overview' },
    { name: 'proposed_timeline',      label: 'Proposed Timeline' },
    { name: 'assumptions_exclusions', label: 'Assumptions & Exclusions' },
    { name: 'pricing' as SectionName, label: 'Pricing template' },
  ];
  const [generatingStep, setGeneratingStep] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [generateError, setGenerateError] = useState('');
  // Stays true for the entire generation run so the progress view never flips
  // to sections mid-way, even as sections state fills in.
  const [generatingAll, setGeneratingAll] = useState(false);
  // Gap state: null = gap check pending, array = check complete (may be empty)
  const [resolvedGaps, setResolvedGaps] = useState<Gap[] | null>(null);

  async function handleGenerateAll(gaps?: Gap[]) {
    setGeneratingAll(true);
    setGeneratingStep(GENERATE_STEPS[0].name);
    setCompletedSteps([]);
    setGenerateError('');
    const generated: ProposalSection[] = [];

    // Answered gap data for injection into section prompts (Task 3)
    const answeredGaps = (gaps ?? []).filter(g => g.status === 'answered');
    const pendingGaps = (gaps ?? []).filter(g => g.status === 'pending');

    for (const step of GENERATE_STEPS) {
      setGeneratingStep(step.name);
      try {
        const res = await fetch('/api/proposal/generate-section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposal_id: proposalId,
            section_name: step.name,
            answered_gaps: answeredGaps.length > 0 ? answeredGaps : undefined,
            pending_gaps: pendingGaps.length > 0 ? pendingGaps : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setGenerateError(data.error ?? 'Generation failed'); break; }
        // Accumulate locally — do NOT update sections state mid-loop so the
        // progress view stays shown for the full duration.
        generated.push({
          section_name: step.name,
          content: data.content,
          is_ai_generated: step.name !== 'pricing',
        } as ProposalSection);
        setCompletedSteps(prev => [...prev, step.name]);
      } catch {
        setGenerateError(`Failed on "${step.label}" — please retry`);
        break;
      }
    }

    setGeneratingStep(null);
    // Flush all sections at once — user sees the full proposal appear together.
    if (generated.length > 0) {
      setSections(prev => {
        const next = [...prev];
        for (const gen of generated) {
          const idx = next.findIndex(s => s.section_name === gen.section_name);
          if (idx >= 0) next[idx] = { ...next[idx], ...gen };
          else next.push(gen);
        }
        return next;
      });
    }
    setGeneratingAll(false);
  }

  const isGenerating = generatingStep !== null;

  // Progress view — shown for the entire duration of generation (generatingAll)
  // and on the initial empty state before generation starts.
  if (generatingAll || orderedSections.length === 0) {
    return (
      <div className="py-8 max-w-md mx-auto">
        {/* Gap analysis panel — shown before generation starts */}
        {!generatingAll && completedSteps.length === 0 && resolvedGaps === null && (
          <div className="mb-6">
            <GapPanel
              proposalId={proposalId}
              onReadyToGenerate={gaps => {
                setResolvedGaps(gaps);
                handleGenerateAll(gaps);
              }}
            />
          </div>
        )}

        {/* Pre-generation fallback (gap panel dismissed or zero-gap path) */}
        {!generatingAll && completedSteps.length === 0 && resolvedGaps !== null && (
          <div className="text-center mb-8">
            <p className="text-sm text-gray-600 font-medium mb-1">No sections generated yet</p>
            <p className="text-xs text-gray-400 mb-6">
              AI will write all 7 sections based on your CRO profile and the RFP. Takes about 60 seconds.
            </p>
            {generateError && <p className="text-xs text-red-600 mb-4">⚠ {generateError}</p>}
            <button
              onClick={() => handleGenerateAll(resolvedGaps ?? [])}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors"
            >
              ✦ Generate full proposal →
            </button>
          </div>
        )}

        {/* Per-section progress — shown while generating */}
        {(generatingAll || completedSteps.length > 0) && (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
              {isGenerating ? 'Writing proposal…' : generateError ? 'Stopped early' : 'Complete — loading…'}
            </p>
            {GENERATE_STEPS.map(step => {
              const done   = completedSteps.includes(step.name);
              const active = generatingStep === step.name;
              return (
                <div key={step.name} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all ${
                  done   ? 'border-green-200 bg-green-50' :
                  active ? 'border-blue-200 bg-blue-50' :
                           'border-gray-100 bg-white text-gray-400'
                }`}>
                  <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                    {done ? (
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : active ? (
                      <svg className="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                    )}
                  </span>
                  <span className={`text-sm font-medium ${done ? 'text-green-800' : active ? 'text-blue-800' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                  {done   && <span className="ml-auto text-xs text-green-500">Done</span>}
                  {active && <span className="ml-auto text-xs text-blue-500 animate-pulse">Writing…</span>}
                </div>
              );
            })}
            {generateError && (
              <div className="mt-4 text-center">
                <p className="text-xs text-red-600 mb-3">⚠ {generateError}</p>
                <button onClick={() => handleGenerateAll(resolvedGaps ?? [])} className="text-sm text-green-600 underline">Retry →</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Version history panel */}
      {versionPanel && (
        <VersionHistoryPanel
          sectionId={versionPanel.sectionId}
          sectionLabel={SECTION_LABELS[versionPanel.sectionName]}
          onRestore={(content) => {
            setSections(prev =>
              prev.map(s =>
                s.id === versionPanel.sectionId
                  ? { ...s, content, is_ai_generated: false }
                  : s
              )
            );
            showToast('Version restored');
          }}
          onClose={() => setVersionPanel(null)}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-gray-900 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {orderedSections.map(section => {
        const name = section.section_name as SectionName;
        const isPricing = name === 'pricing'; // only reached when no investmentRows prop
        const isRegenerating = regeneratingSection === name;
        const isSaving = savingSection === name;
        const error = sectionErrors[name];
        const sectionCitations = citations.filter(c =>
          c.inserted_in_section === name || c.inserted_in_section === 'multiple'
        );

        return (
          <div key={name} className="bg-white rounded-xl border border-gray-200">
            {/* Section header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900">
                  {SECTION_LABELS[name]}
                </h2>
                {section.is_ai_generated && !isPricing && (
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">
                    AI
                  </span>
                )}
                {sectionCitations.length > 0 && (
                  <button
                    onClick={onViewAnswers}
                    className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-medium hover:bg-amber-100 transition-colors"
                  >
                    ✓ Verified data
                  </button>
                )}
                {isSaving && (
                  <span className="text-xs text-gray-400">Saving…</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {section.id && (
                  <button
                    onClick={() => setVersionPanel({ sectionId: section.id!, sectionName: name })}
                    className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                  >
                    History
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => saveToLibrary(section.id, name)}
                    disabled={savingToLibrary === name}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savingToLibrary === name ? 'Saving…' : '↓ Save to library'}
                  </button>
                  <Tooltip text="Saves this section so future proposals with similar assay types can reuse it instead of generating from scratch." position="bottom" />
                </div>
                {!isPricing && (
                  <button
                    onClick={() => regenerateSection(name)}
                    disabled={!!regeneratingSection}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {isRegenerating ? (
                      <>
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Regenerating…
                      </>
                    ) : (
                      <>↻ Regenerate</>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="mx-6 mt-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-3">
                <span>{error}</span>
                {!isPricing && (
                  <button
                    type="button"
                    onClick={() => regenerateSection(name)}
                    disabled={!!regeneratingSection}
                    className="shrink-0 text-xs font-semibold underline hover:no-underline disabled:opacity-40"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* Content area */}
            <div className="p-6">
              {isPricing ? (
                // Pricing: plain monospace textarea (markdown table)
                <textarea
                  className="w-full min-h-[280px] text-sm font-mono text-gray-800 border border-gray-200 rounded-lg p-4 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  defaultValue={section.content ?? ''}
                  onChange={e => {
                    updateContent(name, e.target.value);
                    scheduleAutoSave(name, e.target.value);
                  }}
                />
              ) : isRegenerating ? (
                <div className="flex items-center gap-3 py-8 text-gray-400">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-sm">Rewriting this section…</span>
                </div>
              ) : (
                <SectionEditor
                  content={section.content ?? ''}
                  citations={sectionCitations}
                  onChange={val => {
                    updateContent(name, val);
                    scheduleAutoSave(name, val);
                  }}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* Pricing grid — replaces the textarea pricing section, sits at the bottom */}
      {investmentRows !== undefined && onInvestmentChange && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Pricing</h2>
              <p className="text-xs text-gray-400 mt-0.5">Fill in your costs — not visible to the client until you send</p>
            </div>
          </div>
          <div className="p-6">
            <PricingGrid
              rows={investmentRows}
              onChange={onInvestmentChange}
              hasSavedRates={hasSavedRates}
              hideUnitPrices={hideUnitPrices}
            />
          </div>
        </div>
      )}
    </div>
  );
}
