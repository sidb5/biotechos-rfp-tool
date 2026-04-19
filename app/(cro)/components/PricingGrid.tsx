'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@shared/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvestmentRow {
  item: string;
  qty: string;
  unit_price: string;
  total: string;
  _savedRate?: boolean;
}

interface SavedRate {
  assay_type: string;
  price_per_sample: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function calcTotal(qty: string, unitPrice: string): string {
  const q = parseFloat(qty.replace(/,/g, ''));
  const u = parseFloat(unitPrice.replace(/[$,]/g, ''));
  if (!isNaN(q) && !isNaN(u) && q > 0 && u > 0) {
    return `$${(q * u).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return '';
}

export function runningTotal(rows: InvestmentRow[]): string {
  const total = rows.reduce((sum, r) => {
    const t = parseFloat(r.total.replace(/[$,]/g, ''));
    return sum + (isNaN(t) ? 0 : t);
  }, 0);
  return total > 0 ? `$${total.toLocaleString('en-US')}` : '—';
}

// ─── Combobox with saved-rate suggestions ────────────────────────────────────

function AssayCombobox({
  value,
  savedRates,
  onChange,
  onSelectRate,
}: {
  value: string;
  savedRates: SavedRate[];
  onChange: (val: string) => void;
  onSelectRate: (rate: SavedRate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return savedRates;
    const lower = value.toLowerCase();
    return savedRates.filter(r => r.assay_type.toLowerCase().includes(lower));
  }, [value, savedRates]);

  const showDropdown = focused && open && filtered.length > 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setFocused(true); setOpen(true); }}
        onBlur={() => setFocused(false)}
        placeholder="Assay / service"
        className="w-full border border-transparent hover:border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-green-300 focus:ring-1 focus:ring-green-300 bg-transparent"
      />
      {showDropdown && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.map(rate => (
            <button
              key={rate.assay_type}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                onSelectRate(rate);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors flex items-center justify-between gap-2"
            >
              <span className="text-gray-900 truncate">{rate.assay_type}</span>
              <span className="shrink-0 text-xs text-gray-400">${rate.price_per_sample.toLocaleString('en-US')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PricingGrid ──────────────────────────────────────────────────────────────

interface Props {
  rows: InvestmentRow[];
  onChange: (rows: InvestmentRow[]) => void;
  hasSavedRates?: boolean;
  hideUnitPrices?: boolean;
}

export default function PricingGrid({ rows, onChange, hasSavedRates = false, hideUnitPrices = false }: Props) {
  const anyPreFilled = rows.some(r => r._savedRate);
  const [tipDismissed, setTipDismissed] = useState(() => {
    try { return localStorage.getItem('cro_rates_tip_dismissed') === '1'; } catch { return false; }
  });

  const [savedRates, setSavedRates] = useState<SavedRate[]>([]);
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('cro_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!profile) return;
      const { data: rates } = await supabase
        .from('cro_assay_pricing')
        .select('assay_type, price_per_sample')
        .eq('cro_id', profile.id);
      if (rates) setSavedRates(rates);
    }
    load();
  }, []);

  function dismissTip() {
    setTipDismissed(true);
    try { localStorage.setItem('cro_rates_tip_dismissed', '1'); } catch { /* ignore */ }
  }

  function update(i: number, field: keyof InvestmentRow, val: string) {
    const next = rows.map((r, j) => {
      if (j !== i) return r;
      const updated = { ...r, [field]: val };
      if (field === 'unit_price') updated._savedRate = false;
      if (field === 'qty' || field === 'unit_price') {
        const q = field === 'qty' ? val : r.qty;
        const u = field === 'unit_price' ? val : r.unit_price;
        updated.total = calcTotal(q, u);
      }
      return updated;
    });
    onChange(next);
  }

  function addRow() {
    onChange([...rows, { item: '', qty: '', unit_price: '', total: '', _savedRate: false }]);
  }

  function removeRow(i: number) {
    onChange(rows.filter((_, j) => j !== i));
  }

  const total = runningTotal(rows);

  return (
    <div>
      {anyPreFilled && !tipDismissed && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-4">
          <span className="text-green-600 text-xs mt-0.5">✦</span>
          <p className="text-xs text-green-800 flex-1">Prices pre-filled from your saved rates — adjust for this project.</p>
          <button onClick={dismissTip} className="text-green-400 hover:text-green-600 text-base leading-none ml-1">×</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-100">
              <th className="text-left pb-2 pr-2">Line item</th>
              <th className="text-right pb-2 px-2 w-16">Qty</th>
              {!hideUnitPrices && <th className="text-right pb-2 px-2 w-32">Unit price</th>}
              <th className="text-right pb-2 pl-2 w-24">Total</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, i) => (
              <tr key={i} className="group">
                <td className="py-1.5 pr-2">
                  <AssayCombobox
                    value={row.item}
                    savedRates={savedRates}
                    onChange={val => update(i, 'item', val)}
                    onSelectRate={rate => {
                      const price = `$${rate.price_per_sample.toLocaleString('en-US')}`;
                      const next = rows.map((r, j) => {
                        if (j !== i) return r;
                        const updated = { ...r, item: rate.assay_type, unit_price: price, _savedRate: true };
                        updated.total = calcTotal(r.qty, price);
                        return updated;
                      });
                      onChange(next);
                    }}
                  />
                </td>
                <td className="py-1.5 px-2">
                  <input
                    value={row.qty}
                    onChange={e => update(i, 'qty', e.target.value)}
                    placeholder="—"
                    className="w-full text-right border border-transparent hover:border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-green-300 focus:ring-1 focus:ring-green-300 bg-transparent"
                  />
                </td>
                {!hideUnitPrices && (
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1 justify-end">
                      {row._savedRate && (
                        <span title="From your saved rates" className="shrink-0 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded cursor-help">
                          saved
                        </span>
                      )}
                      <input
                        value={row.unit_price}
                        onChange={e => update(i, 'unit_price', e.target.value)}
                        placeholder="Add rate"
                        className="w-full text-right border border-transparent hover:border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-green-300 focus:ring-1 focus:ring-green-300 bg-transparent placeholder-gray-300"
                      />
                    </div>
                  </td>
                )}
                <td className="py-1.5 pl-2 text-right text-sm text-gray-700 font-medium">
                  {row.total || <span className="text-gray-300">—</span>}
                </td>
                <td className="py-1.5 pl-1">
                  <button
                    onClick={() => removeRow(i)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-base leading-none"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-100">
              <td colSpan={hideUnitPrices ? 2 : 3} className="pt-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pr-2">
                Total
              </td>
              <td className="pt-3 pl-2 text-right font-bold text-gray-900">{total}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button onClick={addRow} className="mt-3 text-xs text-green-600 hover:text-green-700 font-medium">
        + Add line item
      </button>

      {!hasSavedRates && (
        <p className="mt-3 text-xs text-gray-400">
          <a href="/benchmarks" className="underline underline-offset-2 hover:text-gray-600 transition-colors">
            Save your standard rates to pre-fill pricing on every quote →
          </a>
        </p>
      )}
    </div>
  );
}
