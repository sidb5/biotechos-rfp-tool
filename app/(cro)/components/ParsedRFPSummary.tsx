'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ParsedRFP } from '@cro/types';
import LibraryChoiceModal, { type LibraryMatch } from '@cro/components/LibraryChoiceModal';
import BidRecommendationCard, { type BidRecommendation } from '@cro/components/BidRecommendationCard';

interface ParsedRFPSummaryProps {
  initialData: ParsedRFP;
  rfpId: string;
  croProfileId: string;
  onBack: () => void;
}

function EditableList({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  function updateItem(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)));
  }

  function addItem() {
    onChange([...items, '']);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
        {label}
      </p>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-gray-300 hover:text-red-400 text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="text-xs text-green-600 hover:text-green-800 font-medium text-left mt-0.5"
        >
          + Add item
        </button>
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
        {label}
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function ParsedRFPSummary({
  initialData,
  rfpId,
  croProfileId,
  onBack,
}: ParsedRFPSummaryProps) {
  const router = useRouter();
  const [data, setData] = useState<ParsedRFP>({ ...initialData });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [libraryMatches, setLibraryMatches] = useState<Record<string, LibraryMatch | null> | null>(null);
  const [checkingLibrary, setCheckingLibrary] = useState(false);

  // Bid recommendation
  const [recommendation, setRecommendation] = useState<BidRecommendation | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(true);
  const [recommendError, setRecommendError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function fetchRecommendation() {
      setRecommendLoading(true);
      setRecommendError('');
      try {
        const res = await fetch(`/api/rfp/${rfpId}/recommend`, { method: 'POST' });
        const data = await res.json();
        if (cancelled) return;
        if (data.recommendation) {
          setRecommendation(data.recommendation);
        } else {
          setRecommendError(data.error ?? 'Unavailable');
        }
      } catch {
        if (!cancelled) setRecommendError('Unavailable');
      } finally {
        if (!cancelled) setRecommendLoading(false);
      }
    }
    fetchRecommendation();
    return () => { cancelled = true; };
  }, [rfpId]);

  function update<K extends keyof ParsedRFP>(field: K, value: ParsedRFP[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleGenerateClick() {
    setError('');
    setCheckingLibrary(true);
    try {
      const res = await fetch('/api/library/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cro_id: croProfileId, assay_types: data.assay_types }),
      });
      const result = await res.json();
      if (result.has_any_match) {
        setLibraryMatches(result.matches);
      } else {
        await handleGenerateProposal({});
      }
    } catch {
      await handleGenerateProposal({});
    } finally {
      setCheckingLibrary(false);
    }
  }

  async function handleGenerateProposal(sectionOverrides: Record<string, string>) {
    setLibraryMatches(null);
    setError('');
    setGenerating(true);

    try {
      const res = await fetch('/api/proposal/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfp_id: rfpId, parsed_rfp: data, section_overrides: sectionOverrides }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error ?? `Server error ${res.status}`);
      }

      router.push(`/proposals/${result.proposal_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">RFP Summary</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Review and correct before generating the proposal.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium"
        >
          ← Edit input
        </button>
      </div>

      {/* Editable summary card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-5">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <EditableField
            label="Biotech / sponsor name"
            value={data.biotech_name}
            onChange={(v) => update('biotech_name', v)}
            placeholder="Acme Therapeutics"
          />
          <EditableField
            label="Study type"
            value={data.study_type}
            onChange={(v) => update('study_type', v)}
            placeholder="e.g. GLP 28-day rat toxicology"
          />
          <EditableField
            label="Species"
            value={data.species}
            onChange={(v) => update('species', v)}
            placeholder="e.g. Sprague-Dawley rat"
          />
          <EditableField
            label="Sample count"
            value={data.sample_count}
            onChange={(v) => update('sample_count', v)}
            placeholder="e.g. 40 animals (5M/5F per group × 4 groups)"
          />
          <EditableField
            label="Timeline (weeks)"
            value={data.timeline_weeks}
            onChange={(v) => update('timeline_weeks', v)}
            placeholder="e.g. 16"
            hint="Enter the number of weeks requested"
          />
        </div>

        <hr className="border-gray-100" />

        <EditableList
          label="Assay types"
          items={data.assay_types}
          onChange={(v) => update('assay_types', v)}
          placeholder="e.g. hERG assay"
        />
        <EditableList
          label="Primary endpoints"
          items={data.primary_endpoints}
          onChange={(v) => update('primary_endpoints', v)}
          placeholder="e.g. NOAEL determination"
        />
        <EditableList
          label="Secondary endpoints"
          items={data.secondary_endpoints}
          onChange={(v) => update('secondary_endpoints', v)}
          placeholder="e.g. toxicokinetic profiling"
        />
        <EditableList
          label="Deliverables"
          items={data.deliverables}
          onChange={(v) => update('deliverables', v)}
          placeholder="e.g. GLP-compliant final study report"
        />
        <EditableList
          label="Special requirements"
          items={data.special_requirements}
          onChange={(v) => update('special_requirements', v)}
          placeholder="e.g. sponsor to provide test article"
        />

        {data.ambiguities.length > 0 && (
          <>
            <hr className="border-gray-100" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-2">
                ⚠ Ambiguities flagged by the tool
              </p>
              <ul className="flex flex-col gap-1">
                {data.ambiguities.map((a, i) => (
                  <li key={i} className="text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
                    {a}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-2">
                Consider clarifying these with the biotech before submitting.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Bid/no-bid recommendation */}
      <BidRecommendationCard
        recommendation={recommendation}
        loading={recommendLoading}
        error={recommendError}
      />

      {/* Error with retry */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start justify-between gap-4">
          <p className="text-red-700 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => { setError(''); handleGenerateProposal({}); }}
            className="shrink-0 text-xs font-semibold text-red-700 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center gap-4 pb-10">
        <button
          type="button"
          onClick={handleGenerateClick}
          disabled={generating || checkingLibrary}
          className="px-8 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-base"
        >
          {generating ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Generating proposal…
            </>
          ) : checkingLibrary ? (
            'Checking library…'
          ) : (
            'Generate proposal →'
          )}
        </button>
        {generating && (
          <p className="text-sm text-gray-400">
            Drafting all 7 sections — takes about 30–60 seconds
          </p>
        )}
      </div>

      {/* Library choice modal */}
      {libraryMatches && (
        <LibraryChoiceModal
          matches={libraryMatches}
          onConfirm={(overrides) => handleGenerateProposal(overrides)}
          onCancel={() => setLibraryMatches(null)}
        />
      )}
    </div>
  );
}
