'use client';

import { useState } from 'react';
import type { AutofillResult } from './AutofillModal';
import type { CROProfile, TeamMember } from '@cro/types';

interface CurrentValues {
  company_name: string;
  company_overview: string;
  therapeutic_areas: string[];
  assay_types: string[];
  team_members: TeamMember[];
  facility_description: string;
  accreditations: string[];
  geographic_reach: string;
}

export interface AppliedFields {
  company_name?: string;
  company_overview?: string;
  therapeutic_areas?: string[];
  assay_types?: string[];
  team_members?: TeamMember[];
  facility_description?: string;
  accreditations?: string[];
  geographic_reach?: string;
}

interface AutofillReviewModalProps {
  result: AutofillResult;
  current: CurrentValues;
  onClose: () => void;
  onApply: (fields: AppliedFields) => void;
}

const FIELD_LABELS: Record<string, string> = {
  company_name: 'Company name',
  company_overview: 'Company overview',
  therapeutic_areas: 'Therapeutic areas',
  assay_types: 'Assay types',
  team_members: 'Team members',
  facility_description: 'Facility description',
  accreditations: 'Accreditations',
  geographic_reach: 'Geographic reach',
};

function ArrayValue({ values }: { values: string[] }) {
  if (!values || values.length === 0) return <span className="text-gray-400 italic">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
          {v}
        </span>
      ))}
    </div>
  );
}

function TeamMemberList({ members }: { members: TeamMember[] }) {
  if (!members || members.length === 0) return <span className="text-gray-400 italic">None</span>;
  return (
    <div className="flex flex-col gap-1">
      {members.map((m, i) => (
        <div key={i} className="text-xs text-gray-700">
          <span className="font-medium">{m.name}</span>
          {m.title ? ` — ${m.title}` : ''}
          {m.years_experience ? ` (${m.years_experience} yrs)` : ''}
        </div>
      ))}
    </div>
  );
}

type FieldKey = keyof AppliedFields;

const ALL_FIELDS: FieldKey[] = [
  'company_name',
  'company_overview',
  'therapeutic_areas',
  'assay_types',
  'team_members',
  'facility_description',
  'accreditations',
  'geographic_reach',
];

function hasValue(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return false;
}

export default function AutofillReviewModal({
  result,
  current,
  onClose,
  onApply,
}: AutofillReviewModalProps) {
  const { profile, pricing } = result;

  // Default: check all fields that have extracted values
  const defaultChecked = Object.fromEntries(
    ALL_FIELDS.map((k) => [k, hasValue(profile[k as keyof typeof profile])])
  ) as Record<FieldKey, boolean>;

  const [checked, setChecked] = useState<Record<FieldKey, boolean>>(defaultChecked);

  function toggle(key: FieldKey) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleApply() {
    const fields: AppliedFields = {};
    for (const key of ALL_FIELDS) {
      if (checked[key] && hasValue(profile[key as keyof typeof profile])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fields as any)[key] = profile[key as keyof typeof profile];
      }
    }
    onApply(fields);
  }

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const availableCount = ALL_FIELDS.filter((k) => hasValue(profile[k as keyof typeof profile])).length;

  function renderExtracted(key: FieldKey) {
    const val = profile[key as keyof typeof profile];
    if (!hasValue(val)) return <span className="text-gray-400 italic text-xs">Not found</span>;
    if (key === 'team_members') return <TeamMemberList members={val as TeamMember[]} />;
    if (key === 'therapeutic_areas' || key === 'assay_types' || key === 'accreditations') {
      return <ArrayValue values={val as string[]} />;
    }
    return <span className="text-xs text-gray-700 leading-relaxed">{String(val)}</span>;
  }

  function renderCurrent(key: FieldKey) {
    const val = current[key as keyof CurrentValues];
    if (!hasValue(val)) return <span className="text-gray-400 italic text-xs">Empty</span>;
    if (key === 'team_members') return <TeamMemberList members={val as TeamMember[]} />;
    if (key === 'therapeutic_areas' || key === 'assay_types' || key === 'accreditations') {
      return <ArrayValue values={val as string[]} />;
    }
    return <span className="text-xs text-gray-700 leading-relaxed">{String(val)}</span>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Review extracted information</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {availableCount} field{availableCount !== 1 ? 's' : ''} found — select which to apply
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[auto_1fr_1fr] gap-4 px-6 py-2 bg-gray-50 border-b border-gray-100">
          <div className="w-5" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Extracted</p>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current value</p>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-6 py-2 divide-y divide-gray-50">
          {ALL_FIELDS.map((key) => {
            const extracted = profile[key as keyof typeof profile];
            const isAvailable = hasValue(extracted);
            return (
              <div
                key={key}
                className={`grid grid-cols-[auto_1fr_1fr] gap-4 py-4 transition-colors ${
                  !isAvailable ? 'opacity-40' : checked[key] ? 'bg-green-50/30' : ''
                }`}
              >
                <div className="flex items-start pt-0.5">
                  <input
                    type="checkbox"
                    checked={checked[key] && isAvailable}
                    disabled={!isAvailable}
                    onChange={() => toggle(key)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer disabled:cursor-not-allowed mt-0.5"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">{FIELD_LABELS[key]}</p>
                  {renderExtracted(key)}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 mb-1.5">Current</p>
                  {renderCurrent(key)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pricing section (informational) */}
        {pricing.pricing_found && pricing.prices.length > 0 && (
          <div className="mx-6 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.828 1.172M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.828-1.172" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-amber-800 mb-1">Pricing data found</p>
                <p className="text-xs text-amber-700 mb-2">
                  Found {pricing.prices.length} price{pricing.prices.length !== 1 ? 's' : ''} — go to <strong>Settings → Pricing</strong> to review and import them.
                </p>
                <ul className="flex flex-col gap-1">
                  {pricing.prices.slice(0, 3).map((p, i) => (
                    <li key={i} className="text-xs text-amber-700">
                      • {p.assay_type}
                      {p.price_per_sample ? ` — $${p.price_per_sample.toLocaleString()}` : ''}
                      {p.price_notes ? ` (${p.price_notes})` : ''}
                    </li>
                  ))}
                  {pricing.prices.length > 3 && (
                    <li className="text-xs text-amber-600">…and {pricing.prices.length - 3} more</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => {
              const allOn = ALL_FIELDS.every((k) => !hasValue(profile[k as keyof typeof profile]) || checked[k]);
              const next = Object.fromEntries(
                ALL_FIELDS.map((k) => [k, !allOn && hasValue(profile[k as keyof typeof profile])])
              ) as Record<FieldKey, boolean>;
              setChecked(next);
            }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            {ALL_FIELDS.every((k) => !hasValue(profile[k as keyof typeof profile]) || checked[k])
              ? 'Deselect all'
              : 'Select all'}
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={checkedCount === 0}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Apply {checkedCount > 0 ? `${checkedCount} field${checkedCount !== 1 ? 's' : ''}` : 'selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
