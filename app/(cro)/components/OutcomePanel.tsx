'use client';

import { useState } from 'react';

const OUTCOMES = [
  { value: 'won',         label: 'Won',         color: 'text-green-700 bg-green-50 border-green-200' },
  { value: 'lost',        label: 'Lost',        color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'pending',     label: 'Pending',     color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  { value: 'no_decision', label: 'No decision', color: 'text-gray-700 bg-gray-50 border-gray-200' },
  { value: 'withdrawn',   label: 'Withdrawn',   color: 'text-gray-500 bg-gray-50 border-gray-200' },
] as const;

const LOSS_REASONS = [
  { value: 'price',          label: 'Price too high' },
  { value: 'competitor',     label: 'Competitor selected' },
  { value: 'timeline',       label: 'Timeline too long' },
  { value: 'capability',     label: 'Capability gap' },
  { value: 'no_response',    label: 'No response from sponsor' },
  { value: 'scope_mismatch', label: 'Scope mismatch' },
  { value: 'other',          label: 'Other' },
];

interface Props {
  proposalId: string;
  initialOutcome?: string | null;
  initialOutcomeDate?: string | null;
  initialOutcomeNotes?: string | null;
  initialContractValue?: number | null;
  initialLossReason?: string | null;
}

export default function OutcomePanel({
  proposalId,
  initialOutcome,
  initialOutcomeDate,
  initialOutcomeNotes,
  initialContractValue,
  initialLossReason,
}: Props) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState(initialOutcome ?? '');
  const [outcomeDate, setOutcomeDate] = useState(
    initialOutcomeDate ? initialOutcomeDate.slice(0, 10) : ''
  );
  const [notes, setNotes] = useState(initialOutcomeNotes ?? '');
  const [contractValue, setContractValue] = useState(
    initialContractValue != null ? String(initialContractValue) : ''
  );
  const [lossReason, setLossReason] = useState(initialLossReason ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const currentOutcome = OUTCOMES.find(o => o.value === outcome);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`/api/proposal/${proposalId}/outcome`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: outcome || null,
          outcome_date: outcomeDate || null,
          outcome_notes: notes || null,
          contract_value: contractValue ? parseFloat(contractValue) : null,
          loss_reason: outcome === 'lost' ? (lossReason || null) : null,
        }),
      });
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error ?? 'Save failed');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">Proposal Outcome</span>
          {currentOutcome && (
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${currentOutcome.color}`}>
              {currentOutcome.label}
            </span>
          )}
          {!outcome && (
            <span className="text-xs text-gray-400">Not recorded yet</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="px-6 pb-6 flex flex-col gap-4 border-t border-gray-100 pt-4">

          {/* Status selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
              Outcome status
            </label>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(o.value)}
                  className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    outcome === o.value
                      ? o.color + ' ring-2 ring-offset-1 ring-current'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date of outcome</label>
              <input
                type="date"
                value={outcomeDate}
                onChange={e => setOutcomeDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Contract value — only when Won */}
            {outcome === 'won' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contract value (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    value={contractValue}
                    onChange={e => setContractValue(e.target.value)}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Loss reason — only when Lost */}
          {outcome === 'lost' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Loss reason</label>
              <select
                value={lossReason}
                onChange={e => setLossReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select a reason…</option>
                {LOSS_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notes <span className="text-gray-400">(optional, max 500 chars)</span>
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional context about the outcome…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{notes.length}/500</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !outcome}
              className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save outcome'}
            </button>
            {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
            {error && <span className="text-sm text-red-500">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
