'use client';

import { useState, useRef } from 'react';
import type { ProposalSection, SectionName } from '@cro/types';
import VersionHistoryPanel from '@cro/components/VersionHistoryPanel';
import Tooltip from '@shared/components/Tooltip';

const SECTION_LABELS: Record<SectionName, string> = {
  executive_summary:      'Executive Summary',
  technical_approach:     'Technical Approach',
  team_qualifications:    'Team Qualifications',
  facility_overview:      'Facility Overview',
  proposed_timeline:      'Proposed Timeline',
  pricing:                'Pricing',
  assumptions_exclusions: 'Assumptions & Exclusions',
};

const SECTION_ORDER: SectionName[] = [
  'executive_summary',
  'technical_approach',
  'team_qualifications',
  'facility_overview',
  'proposed_timeline',
  'pricing',
  'assumptions_exclusions',
];

interface Props {
  proposalId: string;
  initialSections: ProposalSection[];
}

export default function ProposalEditor({ proposalId, initialSections }: Props) {
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

  // Sort sections by SECTION_ORDER
  const orderedSections = SECTION_ORDER
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

  if (orderedSections.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>No sections found for this proposal.</p>
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
        const isPricing = name === 'pricing';
        const isRegenerating = regeneratingSection === name;
        const isSaving = savingSection === name;
        const error = sectionErrors[name];

        return (
          <div key={name} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                // Pricing: render as plain editable textarea with monospace font
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
                <textarea
                  className="w-full min-h-[220px] text-sm text-gray-800 border border-gray-200 rounded-lg p-4 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent leading-relaxed"
                  defaultValue={section.content ?? ''}
                  onChange={e => {
                    updateContent(name, e.target.value);
                    scheduleAutoSave(name, e.target.value);
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
