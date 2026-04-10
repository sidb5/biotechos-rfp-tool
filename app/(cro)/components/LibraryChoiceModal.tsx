'use client';

import { useState } from 'react';

const SECTION_LABELS: Record<string, string> = {
  executive_summary:      'Executive Summary',
  technical_approach:     'Technical Approach',
  team_qualifications:    'Team Qualifications',
  facility_overview:      'Facility Overview',
  proposed_timeline:      'Proposed Timeline',
  assumptions_exclusions: 'Assumptions & Exclusions',
};

export interface LibraryMatch {
  id: string;
  usage_count: number;
  updated_at: string;
  preview: string;
}

interface Props {
  matches: Record<string, LibraryMatch | null>;
  onConfirm: (overrides: Record<string, string>) => void;
  onCancel: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LibraryChoiceModal({ matches, onConfirm, onCancel }: Props) {
  const sectionsWithMatches = Object.entries(matches).filter(([, m]) => m !== null) as [string, LibraryMatch][];

  // Build initial choices: default to 'library' for matched sections
  const initialChoices: Record<string, string> = {};
  for (const [name, match] of sectionsWithMatches) {
    initialChoices[name] = match.id;
  }

  const [choices, setChoices] = useState<Record<string, string>>(initialChoices);

  function toggle(sectionName: string, matchId: string) {
    setChoices(prev => ({
      ...prev,
      [sectionName]: prev[sectionName] === 'fresh' ? matchId : 'fresh',
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Saved versions found</h2>
          <p className="text-sm text-gray-500 mt-1">
            We found content library entries for some sections. Choose whether to use them or generate fresh.
          </p>
        </div>

        <div className="px-6 py-4 flex flex-col gap-4">
          {sectionsWithMatches.map(([sectionName, match]) => {
            const useSaved = choices[sectionName] !== 'fresh';
            return (
              <div key={sectionName} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{SECTION_LABELS[sectionName]}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Saved {formatDate(match.updated_at)} · used {match.usage_count}×
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggle(sectionName, match.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        useSaved
                          ? 'bg-green-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Use saved
                    </button>
                    <button
                      onClick={() => toggle(sectionName, match.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        !useSaved
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Generate fresh
                    </button>
                  </div>
                </div>
                {useSaved && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 italic leading-relaxed">{match.preview}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => onConfirm(choices)}
            className="flex-1 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors text-sm"
          >
            Continue with these choices →
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
