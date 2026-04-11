'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import FeatureGate from '@shared/components/FeatureGate';
import type { Plan } from '@shared/lib/feature-flags';
import { canAccess } from '@shared/lib/feature-flags';

// ─── Types ─────────────────────────────────────────────────────────────────

interface TimelineRow {
  label: string;
  description: string;
  date: string;
}

interface InvestmentRow {
  item: string;
  qty: string;
  unit_price: string;
  total: string;
  _savedRate?: boolean;
}

interface QuoteData {
  mode: 'quick_quote' | 'full_proposal';
  scope: string;
  timeline: TimelineRow[];
  investment: InvestmentRow[];
  next_steps: string[];
  _hasSavedRates?: boolean;
  _hideUnitPrices?: boolean;
}

interface RequestSummary {
  biotech_name: string | null;
  request_type: string | null;
  study_type: string | null;
  assay_types: string[];
  timeline_weeks: number | null;
  submission_deadline: string | null;
  special_requirements: string[];
}

interface CROContact {
  company_name: string;
  email?: string;
  phone?: string;
}

interface BidRec {
  decision: string;
  summary: string;
  confidence_score: number;
}

interface QuoteBuilderProps {
  proposalId: string;
  initialQuoteData: QuoteData;
  request: RequestSummary;
  croContact: CROContact;
  bidRec: BidRec | null;
  existingSections: { section_name: string; content: string }[];
  shareToken: string | null;
  shareEnabled: boolean;
  shareViews: number;
  plan: Plan;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcTotal(qty: string, unitPrice: string): string {
  const q = parseFloat(qty.replace(/,/g, ''));
  const u = parseFloat(unitPrice.replace(/[$,]/g, ''));
  if (!isNaN(q) && !isNaN(u) && q > 0 && u > 0) {
    return `$${(q * u).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return '';
}

function runningTotal(rows: InvestmentRow[]): string {
  const total = rows.reduce((sum, r) => {
    const t = parseFloat(r.total.replace(/[$,]/g, ''));
    return sum + (isNaN(t) ? 0 : t);
  }, 0);
  return total > 0 ? `$${total.toLocaleString('en-US')}` : '—';
}

function defaultTimeline(): TimelineRow[] {
  return [
    { label: 'Study start', description: '', date: '' },
    { label: 'Key milestone', description: '', date: '' },
    { label: 'Report delivery', description: '', date: '' },
  ];
}

function defaultNextSteps(contact: CROContact): string[] {
  return [
    'To proceed, please confirm scope by [date]',
    "We'll send a formal agreement on confirmation",
    `${contact.company_name}${contact.email ? ` — ${contact.email}` : ''}${contact.phone ? ` — ${contact.phone}` : ''}`,
  ];
}

// ─── Inline editable text ────────────────────────────────────────────────────

function InlineText({
  value,
  onChange,
  placeholder,
  multiline = false,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          rows={5}
          className={`w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none bg-white ${className}`}
        />
      );
    }
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        className={`w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white ${className}`}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`cursor-text rounded-lg px-3 py-2 text-sm hover:bg-green-50 hover:ring-1 hover:ring-green-200 transition-all ${value ? 'text-gray-900' : 'text-gray-400 italic'} ${className}`}
    >
      {value || placeholder || 'Click to edit'}
    </div>
  );
}

// ─── Bid recommendation widget ────────────────────────────────────────────────

function BidWidget({ rec }: { rec: BidRec | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!rec) return null;

  const dot = rec.decision === 'bid' ? 'bg-green-500' : rec.decision === 'bid_with_caution' ? 'bg-amber-400' : 'bg-red-500';
  const label = rec.decision === 'bid' ? 'Strong fit' : rec.decision === 'bid_with_caution' ? 'Proceed with caution' : 'Not recommended';

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-left w-full group"
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="ml-auto text-xs text-gray-400 group-hover:text-gray-600">
          {expanded ? 'Hide' : 'See analysis →'}
        </span>
      </button>
      {expanded && (
        <p className="mt-2 text-xs text-gray-500 leading-relaxed">{rec.summary}</p>
      )}
    </div>
  );
}

// ─── Quick quote blocks ───────────────────────────────────────────────────────

function ScopeBlock({
  value,
  onChange,
  proposalId,
  generating,
  onGenerate,
}: {
  value: string;
  onChange: (v: string) => void;
  proposalId: string;
  generating: boolean;
  onGenerate: () => void;
}) {
  void proposalId;
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">What we&apos;ll do</h3>
        {!value && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="text-xs text-green-600 hover:text-green-700 font-medium disabled:text-gray-400"
          >
            {generating ? 'Generating…' : '✦ Generate scope'}
          </button>
        )}
        {value && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:text-gray-300"
          >
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
        )}
      </div>
      {generating ? (
        <div className="h-20 flex items-center justify-center">
          <span className="text-sm text-gray-400">Generating scope…</span>
        </div>
      ) : (
        <InlineText
          value={value}
          onChange={onChange}
          placeholder="Click to write scope, or use Generate scope above"
          multiline
        />
      )}
    </div>
  );
}

function TimelineBlock({
  rows,
  onChange,
}: {
  rows: TimelineRow[];
  onChange: (rows: TimelineRow[]) => void;
}) {
  function update(i: number, field: keyof TimelineRow, val: string) {
    const next = rows.map((r, j) => j === i ? { ...r, [field]: val } : r);
    onChange(next);
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">When we&apos;ll deliver</h3>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-50">
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="py-2 pr-3 text-xs text-gray-500 font-medium w-36 shrink-0">{row.label}</td>
              <td className="py-2 pr-2">
                <InlineText
                  value={row.description}
                  onChange={v => update(i, 'description', v)}
                  placeholder={i === 1 ? 'e.g. Interim data delivery' : ''}
                />
              </td>
              <td className="py-2 w-32">
                <input
                  type="date"
                  value={row.date}
                  onChange={e => update(i, 'date', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvestmentBlock({
  rows,
  onChange,
  hasSavedRates,
}: {
  rows: InvestmentRow[];
  onChange: (rows: InvestmentRow[]) => void;
  hasSavedRates: boolean;
}) {
  const anyPreFilled = rows.some(r => r._savedRate);
  const [tipDismissed, setTipDismissed] = useState(() => {
    try { return localStorage.getItem('cro_rates_tip_dismissed') === '1'; } catch { return false; }
  });

  function dismissTip() {
    setTipDismissed(true);
    try { localStorage.setItem('cro_rates_tip_dismissed', '1'); } catch { /* ignore */ }
  }

  function update(i: number, field: keyof InvestmentRow, val: string) {
    const next = rows.map((r, j) => {
      if (j !== i) return r;
      const updated = { ...r, [field]: val };
      // Clear saved-rate flag when user edits the price
      if (field === 'unit_price') updated._savedRate = false;
      // Auto-calc total when qty or price changes
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
    <div className="border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">What it costs</h3>

      {/* One-time tip: pre-filled from saved rates */}
      {anyPreFilled && !tipDismissed && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-3">
          <span className="text-green-600 text-xs mt-0.5">✦</span>
          <p className="text-xs text-green-800 flex-1">
            Prices from your saved rates — adjust for this project if needed.
          </p>
          <button onClick={dismissTip} className="text-green-400 hover:text-green-600 text-base leading-none ml-1">×</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[400px]">
          <thead>
            <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
              <th className="text-left pb-2 pr-2">Item</th>
              <th className="text-right pb-2 px-2 w-16">Qty</th>
              <th className="text-right pb-2 px-2 w-32">Unit price</th>
              <th className="text-right pb-2 pl-2 w-24">Total</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, i) => (
              <tr key={i} className="group">
                <td className="py-1.5 pr-2">
                  <input
                    value={row.item}
                    onChange={e => update(i, 'item', e.target.value)}
                    placeholder="Assay / service"
                    className="w-full border border-transparent hover:border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-green-300 focus:ring-1 focus:ring-green-300 bg-transparent"
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
                <td className="py-1.5 px-2">
                  <div className="flex items-center gap-1 justify-end">
                    {row._savedRate && (
                      <span
                        title="From your saved rates — click to edit"
                        className="shrink-0 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded cursor-help"
                      >
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
            <tr>
              <td colSpan={3} className="pt-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pr-2">
                Total
              </td>
              <td className="pt-3 pl-2 text-right font-bold text-gray-900">{total}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <button
        onClick={addRow}
        className="mt-3 text-xs text-green-600 hover:text-green-700 font-medium"
      >
        + Add line item
      </button>

      {/* Prompt to save rates if none exist */}
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

function NextStepsBlock({
  lines,
  onChange,
}: {
  lines: string[];
  onChange: (lines: string[]) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">How to move forward</h3>
      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <InlineText
            key={i}
            value={line}
            onChange={v => {
              const next = lines.map((l, j) => j === i ? v : l);
              onChange(next);
            }}
            placeholder="Add next step…"
          />
        ))}
      </div>
    </div>
  );
}

// ─── Completeness checklist ───────────────────────────────────────────────────

function Completeness({ data }: { data: QuoteData }) {
  const items = [
    { label: 'Scope filled in',    done: data.scope.trim().length > 20 },
    { label: 'Timeline set',       done: data.timeline.some(r => r.date !== '') },
    { label: 'Pricing complete',   done: data.investment.length > 0 && data.investment.some(r => r.unit_price !== '') },
    { label: 'Contact info present', done: data.next_steps.some(l => l.includes('@') || l.includes('+')) },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${item.done ? 'bg-green-100 text-green-600' : 'bg-amber-50 text-amber-500'}`}>
            {item.done ? '✓' : '!'}
          </span>
          <span className={item.done ? 'text-gray-600' : 'text-amber-600'}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main QuoteBuilder ────────────────────────────────────────────────────────

export default function QuoteBuilder({
  proposalId,
  initialQuoteData,
  request,
  croContact,
  bidRec,
  existingSections,
  shareToken,
  shareEnabled: initialShareEnabled,
  shareViews: initialShareViews,
  plan,
}: QuoteBuilderProps) {
  const pdfAllowed  = canAccess('pdf_export',  plan) as boolean;
  const wordAllowed = canAccess('word_export',  plan) as boolean;
  const bidAllowed  = canAccess('bid_recommendation', plan) as boolean;
  const [data, setData] = useState<QuoteData>(() => ({
    mode:       initialQuoteData.mode       ?? (request.request_type === 'formal_rfp' ? 'full_proposal' : 'quick_quote'),
    scope:      initialQuoteData.scope      ?? '',
    timeline:   initialQuoteData.timeline?.length ? initialQuoteData.timeline : defaultTimeline(),
    investment: initialQuoteData.investment?.length ? initialQuoteData.investment : [{ item: '', qty: '', unit_price: '', total: '' }],
    next_steps: initialQuoteData.next_steps?.length ? initialQuoteData.next_steps : defaultNextSteps(croContact),
  }));

  const [generating, setGenerating] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(initialShareEnabled);
  const [shareViews, setShareViews] = useState(initialShareViews);
  const [shareToast, setShareToast] = useState('');
  const [sent, setSent] = useState(initialShareEnabled); // treat already-shared as sent
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save: debounce 3s after any change
  useEffect(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        await fetch('/api/quote/save', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposal_id: proposalId, quote_data: data }),
        });
        setSavedAt(new Date());
      } catch { /* silent */ }
    }, 3000);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [data, proposalId]);

  // Auto-generate scope if missing
  useEffect(() => {
    if (!data.scope && data.mode === 'quick_quote') {
      generateScope();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateScope() {
    setGenerating(true);
    try {
      const res = await fetch('/api/quote/generate-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId }),
      });
      const json = await res.json();
      if (json.scope) setData(d => ({ ...d, scope: json.scope }));
    } catch { /* silent */ }
    setGenerating(false);
  }

  function relative(date: Date): string {
    const diff = Date.now() - date.getTime();
    const s = Math.floor(diff / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)} min ago`;
  }

  async function handleCopyShareLink() {
    const action = shareEnabled ? 'enable' : 'enable'; // always enable on click
    try {
      const res = await fetch('/api/quote/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setShareEnabled(true);
      setShareViews(json.share_views ?? 0);
      const url = `${window.location.origin}/q/${json.share_token}`;
      await navigator.clipboard.writeText(url);
      setShareToast('Link copied — anyone with this link can view your quote');
      setTimeout(() => setShareToast(''), 4000);
    } catch {
      setShareToast('Failed to copy link');
      setTimeout(() => setShareToast(''), 3000);
    }
  }

  async function handleTurnOffSharing() {
    try {
      await fetch('/api/quote/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId, action: 'disable' }),
      });
      setShareEnabled(false);
    } catch { /* silent */ }
  }

  async function handleSend() {
    try {
      const res = await fetch('/api/quote/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSent(true);
      setShareEnabled(true);
      setShareViews(json.share_views ?? 0);
      const url = `${window.location.origin}/q/${json.share_token}`;
      await navigator.clipboard.writeText(url);
      setShareToast('Quote marked as sent — share link copied to clipboard');
      setTimeout(() => setShareToast(''), 5000);
    } catch {
      setShareToast('Something went wrong — please try again');
      setTimeout(() => setShareToast(''), 3000);
    }
  }

  async function handleDownload(format: 'pdf' | 'docx') {
    setDownloading(format);
    try {
      const res = await fetch(`/api/proposal/export-${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Export failed');
      }
      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `proposal.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setShareToast(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setTimeout(() => setShareToast(''), 4000);
    }
    setDownloading(null);
  }

  const requestTypeLabel = request.request_type === 'formal_rfp' ? 'Formal RFP' : 'Quick quote';

  // ── Left panel content ─────────────────────────────────────────────────────
  const leftPanel = (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Request summary</p>
        <dl className="flex flex-col gap-2">
          {[
            ['Client',       request.biotech_name ?? 'Unknown'],
            ['Request type', requestTypeLabel],
            ['Assays',       request.assay_types.join(', ') || 'Not specified'],
            ['Timeline',     request.timeline_weeks ? `${request.timeline_weeks} weeks` : 'Not specified'],
            ['Deadline',     request.submission_deadline ?? 'Not specified'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-gray-400">{k}</dt>
              <dd className="text-sm text-gray-800 font-medium leading-snug">{v}</dd>
            </div>
          ))}
          {request.special_requirements.length > 0 && (
            <div>
              <dt className="text-xs text-gray-400">Requirements</dt>
              <dd>
                <ul className="list-disc list-inside text-sm text-gray-800 space-y-0.5">
                  {request.special_requirements.slice(0, 5).map((r, i) => (
                    <li key={i} className="leading-snug">{r}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {bidAllowed ? (
        <BidWidget rec={bidRec} />
      ) : (
        <FeatureGate feature="bid_recommendation" plan={plan} featureLabel="Bid/no-bid recommendation" />
      )}

      <p className="text-xs text-gray-400 mt-1">
        <a href={`/proposals/${proposalId}`} className="underline underline-offset-2 hover:text-gray-600">
          Something wrong? Edit request details →
        </a>
      </p>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Mobile: Left panel drawer */}
      {leftOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setLeftOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-6 z-50 max-h-[80vh] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            {leftPanel}
          </div>
        </div>
      )}

      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <div className="flex gap-6 items-start">

          {/* ── Left column: Request summary (desktop) ────────────────────── */}
          <aside className="hidden md:block w-56 shrink-0 sticky top-24">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              {leftPanel}
            </div>
          </aside>

          {/* ── Centre column: Quote content ──────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">

            {/* Mode toggle + mobile summary chevron */}
            <div className="flex items-center gap-3">
              {/* Mobile: chevron to open left panel */}
              <button
                onClick={() => setLeftOpen(true)}
                className="md:hidden flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Request details
              </button>

              {/* Toggle pills */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1 ml-auto">
                {(['quick_quote', 'full_proposal'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setData(d => ({ ...d, mode }))}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      data.mode === mode
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {mode === 'quick_quote' ? 'Quick Quote' : 'Full Proposal'}
                  </button>
                ))}
              </div>
            </div>

            {data.mode === 'quick_quote' ? (
              <>
                <ScopeBlock
                  value={data.scope}
                  onChange={v => setData(d => ({ ...d, scope: v }))}
                  proposalId={proposalId}
                  generating={generating}
                  onGenerate={generateScope}
                />
                <TimelineBlock
                  rows={data.timeline}
                  onChange={rows => setData(d => ({ ...d, timeline: rows }))}
                />
                <InvestmentBlock
                  rows={data.investment}
                  onChange={rows => setData(d => ({ ...d, investment: rows }))}
                  hasSavedRates={data._hasSavedRates ?? false}
                />
                <NextStepsBlock
                  lines={data.next_steps}
                  onChange={lines => setData(d => ({ ...d, next_steps: lines }))}
                />
              </>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <p className="text-sm text-gray-500 mb-4">
                  Full 7-section proposal — generate and edit each section below.
                </p>
                {existingSections.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-400 text-sm mb-3">No sections generated yet.</p>
                    <a
                      href={`/proposals/${proposalId}`}
                      className="inline-block px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700"
                    >
                      Generate full proposal →
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {existingSections.map(s => (
                      <div key={s.section_name}>
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
                          {s.section_name.replace(/_/g, ' ')}
                        </h4>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-4">{s.content}</p>
                      </div>
                    ))}
                    <a href={`/proposals/${proposalId}`} className="text-sm text-green-600 hover:text-green-700 font-medium">
                      Edit full proposal →
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Bottom note (full proposal upsell) */}
            {data.mode === 'quick_quote' && (
              <p className="text-xs text-gray-400 text-center pb-4">
                Full Proposal adds: technical approach, team qualifications, facility overview, and assumptions.
              </p>
            )}
          </div>

          {/* ── Right column: Actions (desktop sticky) ──────────────────────── */}
          <aside className="hidden md:flex w-52 shrink-0 flex-col gap-4 sticky top-24">
            {/* Primary action */}
            <button
              onClick={handleSend}
              className={`w-full py-3 text-white text-sm font-bold rounded-xl transition-colors ${
                sent
                  ? 'bg-green-700 hover:bg-green-800'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {sent ? 'Sent ✓ — resend →' : 'Send this quote →'}
            </button>

            {/* Secondary actions */}
            <div className="flex flex-col gap-1.5">
              {pdfAllowed ? (
                <button
                  onClick={() => handleDownload('pdf')}
                  disabled={downloading === 'pdf'}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  {downloading === 'pdf' ? 'Generating…' : 'Download PDF'}
                </button>
              ) : (
                <FeatureGate feature="pdf_export" plan={plan} featureLabel="PDF export" />
              )}
              {wordAllowed ? (
                <button
                  onClick={() => handleDownload('docx')}
                  disabled={downloading === 'docx'}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {downloading === 'docx' ? 'Generating…' : 'Download Word'}
                </button>
              ) : (
                <FeatureGate feature="word_export" plan={plan} featureLabel="Word export" />
              )}
              {shareEnabled ? (
                <div className="px-3 py-2 border border-green-200 bg-green-50 rounded-lg text-xs">
                  <p className="font-medium text-green-800">
                    Sharing on — {shareViews} view{shareViews !== 1 ? 's' : ''}
                  </p>
                  <button
                    onClick={handleTurnOffSharing}
                    className="text-green-600 hover:text-green-800 underline underline-offset-2 mt-0.5"
                  >
                    Turn off
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCopyShareLink}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors text-left"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Copy share link
                </button>
              )}

              {/* Hide unit prices toggle */}
              <label className="flex items-center gap-2 cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={data._hideUnitPrices ?? false}
                  onChange={e => setData(d => ({ ...d, _hideUnitPrices: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-green-600"
                />
                <span className="text-xs text-gray-500">Hide unit prices from recipient</span>
              </label>

              {/* Toast */}
              {shareToast && (
                <div className="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg animate-fade-in">
                  {shareToast}
                </div>
              )}
            </div>

            {/* Auto-save status */}
            <p className="text-xs text-gray-400 text-center">
              {savedAt ? `Last saved: ${relative(savedAt)}` : 'Saving…'}
            </p>

            {/* Completeness checklist */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Checklist</p>
              <Completeness data={data} />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-20">
        <button
          onClick={handleSend}
          className={`w-full py-3 text-white text-sm font-bold rounded-xl transition-colors ${
            sent ? 'bg-green-700 hover:bg-green-800' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {sent ? 'Sent ✓ — resend →' : 'Send this quote →'}
        </button>
        {savedAt && (
          <p className="text-xs text-gray-400 text-center mt-1">Last saved: {relative(savedAt)}</p>
        )}
      </div>
    </div>
  );
}
