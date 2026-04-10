'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Benchmark {
  assay_type: string;
  min_price: number;
  median_price: number;
  max_price: number;
  sample_count: number;
}

interface Props {
  allAssayTypes: string[];
  selectedAssay: string;
  benchmark: Benchmark | null;
  myPrice: number | null;
  myNotes: string | null;
}

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// Renders a horizontal range bar: [min ----●median---- max] with optional CRO marker
function RangeBar({ min, median, max, myPrice }: { min: number; median: number; max: number; myPrice: number | null }) {
  const range = max - min;
  const medianPct  = range > 0 ? ((median  - min) / range) * 100 : 50;
  const myPricePct = (myPrice != null && range > 0)
    ? Math.min(100, Math.max(0, ((myPrice - min) / range) * 100))
    : null;

  return (
    <div className="py-4">
      {/* Labels */}
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Min — {formatUSD(min)}</span>
        <span>Median — {formatUSD(median)}</span>
        <span>Max — {formatUSD(max)}</span>
      </div>

      {/* Track */}
      <div className="relative h-4 bg-gray-100 rounded-full overflow-visible">
        {/* Filled range */}
        <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-blue-100 via-blue-300 to-blue-100 rounded-full" />

        {/* Median marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow"
          style={{ left: `calc(${medianPct}% - 6px)` }}
          title={`Median: ${formatUSD(median)}`}
        />

        {/* CRO price marker */}
        {myPricePct !== null && (
          <div
            className="absolute -top-1 w-3 h-6 bg-green-500 rounded-sm border border-green-700 shadow"
            style={{ left: `calc(${myPricePct}% - 6px)` }}
            title={`Your price: ${formatUSD(myPrice!)}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-600" />
          <span>Market median</span>
        </div>
        {myPricePct !== null && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-4 bg-green-500 rounded-sm" />
            <span>Your price — {formatUSD(myPrice!)}</span>
          </div>
        )}
      </div>

      {/* Positioning hint */}
      {myPricePct !== null && (
        <p className={`mt-2 text-xs font-medium ${
          myPrice! < median ? 'text-green-700' : myPrice! > median ? 'text-amber-700' : 'text-gray-600'
        }`}>
          {myPrice! < median
            ? `Your price is ${formatUSD(median - myPrice!)} below the market median — competitively positioned.`
            : myPrice! > median
            ? `Your price is ${formatUSD(myPrice! - median)} above the market median.`
            : 'Your price is exactly at the market median.'}
        </p>
      )}
    </div>
  );
}

export default function BenchmarksClient({ allAssayTypes, selectedAssay, benchmark, myPrice: initialMyPrice, myNotes: initialMyNotes }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [price, setPrice] = useState(initialMyPrice != null ? String(initialMyPrice) : '');
  const [notes, setNotes] = useState(initialMyNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [liveMyPrice, setLiveMyPrice] = useState<number | null>(initialMyPrice);

  function handleAssayChange(assay: string) {
    startTransition(() => {
      router.push(`/benchmarks?assay=${encodeURIComponent(assay)}`);
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const res = await fetch('/api/benchmarks/my-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assay_type: selectedAssay,
          price_per_sample: price ? parseFloat(price) : null,
          price_notes: notes || null,
        }),
      });
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error ?? 'Save failed');
      }
      setSaved(true);
      setLiveMyPrice(price ? parseFloat(price) : null);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Assay type selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
          Select assay type
        </label>
        <select
          value={selectedAssay}
          onChange={e => handleAssayChange(e.target.value)}
          className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {allAssayTypes.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {benchmark ? (
        <>
          {/* Range bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">{selectedAssay} — Market Pricing Range</h2>
            <p className="text-xs text-gray-400 mb-4">
              Based on published pricing ranges from industry CROs (Charles River, Eurofins, WuXi AppTec, Cyprotex and others).
              Ranges reflect simple to complex study scope. Updated periodically as market data evolves.
            </p>
            <RangeBar
              min={benchmark.min_price}
              median={benchmark.median_price}
              max={benchmark.max_price}
              myPrice={liveMyPrice}
            />
          </div>

          {/* Data table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">Assay type</th>
                  <th className="px-6 py-3 text-right">Min</th>
                  <th className="px-6 py-3 text-right">Median</th>
                  <th className="px-6 py-3 text-right">Max</th>
                  <th className="px-6 py-3 text-right">Data points</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">{benchmark.assay_type}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatUSD(benchmark.min_price)}</td>
                  <td className="px-6 py-4 text-right font-semibold text-blue-600">{formatUSD(benchmark.median_price)}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatUSD(benchmark.max_price)}</td>
                  <td className="px-6 py-4 text-right text-gray-400">{benchmark.sample_count}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* My standard rates */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">My standard rates</h2>
            <p className="text-xs text-gray-400 mb-1">Enter your standard price for {selectedAssay} to see where you sit on the range above.</p>
            <p className="text-xs text-green-700 font-medium mb-4">These rates pre-fill automatically on every new quote.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Price (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="e.g. 25000"
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. includes report, per compound"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : 'Save my price'}
              </button>
              {saved && <span className="text-sm text-green-600 font-medium">✓ Saved — marker updated above</span>}
              {saveError && <span className="text-sm text-red-500">{saveError}</span>}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-gray-400 px-1">
            Benchmark data is sourced from published CRO pricing and industry reports. It is indicative only —
            actual pricing varies significantly by study complexity, species, geography, GLP requirements, and
            CRO capabilities. Individual CRO prices are never disclosed to other users.
          </p>
        </>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">No benchmark data available yet for this assay type.</p>
        </div>
      )}
    </div>
  );
}
