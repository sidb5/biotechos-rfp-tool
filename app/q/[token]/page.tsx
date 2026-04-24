'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTenant } from '@shared/components/TenantProvider';
import BrandLockup, { getBrand, getBuySideBrand } from '@shared/components/BrandLockup';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineRow { label: string; description: string; date: string; }
interface InvestmentRow { item: string; qty: string; unit_price: string; total: string; }
interface QuoteData {
  mode: string;
  scope: string;
  timeline: TimelineRow[];
  investment: InvestmentRow[];
  next_steps: string[];
  _hideUnitPrices?: boolean;
}

interface ProposalSection {
  section_name: string;
  content: string;
}

interface GapCitation {
  gap_id: string;
  answered_by: string;
  answered_at: string | null;
  value_used: string;
}

interface QuotePayload {
  quote_data: QuoteData;
  proposal_sections: ProposalSection[];
  cro_company: string;
  biotech_name: string;
  created_at: string;
  gap_citations?: GapCitation[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function stripLeadingHeading(content: string): string {
  return (content ?? '').replace(/^#{1,3} [^\n]*\n?/, '').trimStart();
}

// ─── Read-only blocks ─────────────────────────────────────────────────────────

function ReadonlyScope({ text }: { text: string }) {
  if (!text) return null;
  return (
    <section className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">What we&apos;ll do</h2>
      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{text}</p>
    </section>
  );
}

function ReadonlyTimeline({ rows }: { rows: TimelineRow[] }) {
  const filled = rows.filter(r => r.date || r.description);
  if (!filled.length) return null;
  return (
    <section className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">When we&apos;ll deliver</h2>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-4 text-xs text-gray-500 font-medium w-36">{row.label}</td>
              <td className="py-2.5 pr-4 text-gray-800">{row.description || '—'}</td>
              <td className="py-2.5 text-right text-gray-600 text-xs whitespace-nowrap">
                {row.date ? formatDate(row.date) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ReadonlyInvestment({ rows, hideUnitPrices }: { rows: InvestmentRow[]; hideUnitPrices: boolean }) {
  const filled = rows.filter(r => r.item);
  if (!filled.length) return null;
  const total = filled.reduce((sum, r) => {
    const t = parseFloat(r.total.replace(/[$,]/g, ''));
    return sum + (isNaN(t) ? 0 : t);
  }, 0);
  return (
    <section className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">What it costs</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-100">
            <th className="text-left pb-2 pr-2">Item</th>
            {!hideUnitPrices && <th className="text-right pb-2 px-2">Qty</th>}
            {!hideUnitPrices && <th className="text-right pb-2 px-2">Unit price</th>}
            <th className="text-right pb-2 pl-2">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filled.map((row, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-2 text-gray-800">{row.item}</td>
              {!hideUnitPrices && <td className="py-2.5 px-2 text-right text-gray-600">{row.qty || '—'}</td>}
              {!hideUnitPrices && <td className="py-2.5 px-2 text-right text-gray-600">{row.unit_price || '—'}</td>}
              <td className="py-2.5 pl-2 text-right font-medium text-gray-900">{row.total || '—'}</td>
            </tr>
          ))}
        </tbody>
        {total > 0 && (
          <tfoot>
            <tr className="border-t border-gray-200">
              <td colSpan={hideUnitPrices ? 1 : 3} className="pt-3 text-right text-xs font-semibold text-gray-500 uppercase pr-2">Total</td>
              <td className="pt-3 pl-2 text-right font-bold text-gray-900">${total.toLocaleString('en-US')}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}

function ReadonlyNextSteps({ lines }: { lines: string[] }) {
  const filled = lines.filter(l => l.trim());
  if (!filled.length) return null;
  return (
    <section className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">How to move forward</h2>
      <ul className="flex flex-col gap-2">
        {filled.map((line, i) => (
          <li key={i} className="text-sm text-gray-800">{line}</li>
        ))}
      </ul>
    </section>
  );
}

// Human-readable section titles matching the stored section_name keys
const SECTION_LABELS: Record<string, string> = {
  executive_summary:     'Executive Summary',
  technical_approach:    'Technical Approach',
  team_qualifications:   'Team & Qualifications',
  facility_overview:     'Facility Overview',
  proposed_timeline:     'Proposed Timeline',
  pricing_template:      'Pricing',
  assumptions_exclusions:'Assumptions & Exclusions',
};

function FullProposalView({ sections }: { sections: ProposalSection[] }) {
  if (!sections.length) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        Proposal sections are being prepared. Check back shortly.
      </div>
    );
  }
  return (
    <div className="space-y-10">
      {sections.map(s => (
        <section key={s.section_name}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
            {SECTION_LABELS[s.section_name] ?? s.section_name.replace(/_/g, ' ')}
          </h2>
          <div className="prose prose-sm prose-gray max-w-none
            prose-headings:font-semibold prose-headings:text-gray-900
            prose-h2:text-base prose-h3:text-sm
            prose-p:text-gray-800 prose-p:leading-relaxed
            prose-strong:text-gray-900 prose-strong:font-semibold
            prose-ul:text-gray-800 prose-ol:text-gray-800
            prose-li:my-0.5
            [&_table]:border-collapse [&_table]:w-full [&_table]:my-3 [&_table]:text-sm
            [&_th]:border [&_th]:border-gray-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:bg-gray-50 [&_th]:text-gray-700
            [&_td]:border [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-gray-700 [&_td]:align-top">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripLeadingHeading(s.content)}</ReactMarkdown>
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicQuotePage() {
  const params = useParams();
  const token = params.token as string;
  const tenant    = useTenant();
  const sellBrand = getBrand(tenant.platformName);
  const buyBrand  = getBuySideBrand(sellBrand);

  const [state, setState] = useState<'password' | 'loading' | 'quote' | 'error'>('password');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [verifiedModalOpen, setVerifiedModalOpen] = useState(false);

  // Check if password is in URL hash (from email link)
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash.length >= 6) {
      setPassword(hash);
      verifyAndLoad(hash);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verifyAndLoad(pwd: string) {
    setState('loading');
    setPasswordError('');
    try {
      const res = await fetch(`/api/quote/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pwd }),
      });
      if (res.status === 403) {
        setPasswordError('Incorrect access code');
        setState('password');
        return;
      }
      if (!res.ok) throw new Error('Quote not found');
      const data = await res.json();
      setQuote(data);
      setState('quote');
    } catch {
      setState('error');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) { setPasswordError('Enter the access code from your email'); return; }
    verifyAndLoad(password.trim());
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-green-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl font-bold text-gray-200 mb-3">404</p>
          <p className="text-gray-600 font-medium mb-1">This quote link is no longer active</p>
          <p className="text-sm text-gray-400">The quote may have been removed or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  if (state === 'password') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2">
              <BrandLockup brand={sellBrand} variant="auth" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">View quote</h1>
            <p className="text-sm text-gray-500 mt-1">Enter the access code from your email</p>
          </div>
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <input
              type="text"
              value={password}
              onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
              placeholder="Access code"
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-center text-lg tracking-widest font-mono text-gray-900 placeholder-gray-300 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            {passwordError && <p className="text-xs text-red-600 text-center">{passwordError}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 transition-colors"
            >
              View document →
            </button>
          </form>
        </div>
      </div>
    );
  }

  // state === 'quote'
  const qd = quote!.quote_data;
  const isFullProposal = qd.mode === 'full_proposal';

  return (
    <div className="min-h-screen bg-white">
      {/* Top banner — CRO branding + BiotechOS CTA */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{(quote!.cro_company ?? 'C')[0]}</span>
            </div>
            <span className="text-sm font-semibold truncate">{quote!.cro_company}</span>
          </div>
          <a
            href="/signup?ref=quote"
            className="shrink-0 flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors"
          >
            <BrandLockup brand={buyBrand} variant="nav" surface="dark" />
            <span className="text-white/50">|</span>
            Find &amp; engage CROs faster →
          </a>
        </div>
      </div>

      <header className="border-b border-gray-100 px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">
            {isFullProposal ? 'Proposal Response' : 'Quote'} for {quote!.biotech_name}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Prepared {quote!.created_at ? formatDate(quote!.created_at) : ''}
            {' · '} by {quote!.cro_company}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {isFullProposal ? (
          <>
            <FullProposalView sections={quote!.proposal_sections ?? []} />
            {/* Always show pricing + next steps from quote_data even in full proposal mode */}
            {qd.investment?.some(r => r.item) && (
              <div className="mt-10 pt-10 border-t border-gray-100">
                <ReadonlyInvestment rows={qd.investment} hideUnitPrices={qd._hideUnitPrices ?? false} />
              </div>
            )}
            {qd.next_steps?.some(l => l.trim()) && (
              <ReadonlyNextSteps lines={qd.next_steps} />
            )}
          </>
        ) : (
          <>
            <ReadonlyScope text={qd.scope} />
            <ReadonlyTimeline rows={qd.timeline ?? []} />
            <ReadonlyInvestment rows={qd.investment ?? []} hideUnitPrices={qd._hideUnitPrices ?? false} />
            <ReadonlyNextSteps lines={qd.next_steps ?? []} />
          </>
        )}
      </main>

      {/* Bottom CTA banner */}
      <div className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-2xl mx-auto px-6 py-8 text-center">
          <div className="flex justify-center mb-2">
            <BrandLockup brand={buyBrand} variant="nav" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Managing multiple CRO relationships?</p>
          <p className="text-xs text-gray-500 mb-4 max-w-md mx-auto">
            {tenant.platformName === 'CDMORFP' ? 'SourceMyCDMO' : 'SourceMyCRO'} helps biotech companies find, evaluate, and engage CROs — from internal brief to final RFP, with IP protection at every step.
          </p>
          <a
            href="/signup?ref=quote"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors"
          >
            See how it works →
          </a>
        </div>
      </div>

      {/* Data verified badge — only shown when SME-confirmed data exists */}
      {(quote?.gap_citations ?? []).length > 0 && (
        <>
          <div className="border-t border-gray-100 px-6 py-4 text-center">
            <button
              onClick={() => setVerifiedModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-full transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Data verified
            </button>
          </div>

          {verifiedModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
              <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 shadow-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 mb-1">Verified technical data</h2>
                    <p className="text-xs text-gray-500">
                      The following specifications were confirmed by {quote?.cro_company}&apos;s internal team prior to this proposal:
                    </p>
                  </div>
                  <button onClick={() => setVerifiedModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-3">×</button>
                </div>
                <div className="flex flex-col gap-2">
                  {(quote?.gap_citations ?? []).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                      <span className="text-gray-700 font-medium">{c.value_used}</span>
                      <span className="text-xs text-gray-400 ml-3 text-right shrink-0">
                        confirmed by {c.answered_by}
                        {c.answered_at && (
                          <> ({new Date(c.answered_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })})</>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <footer className="border-t border-gray-100 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs text-gray-400 text-center">
            Powered by{' '}
            <a href="/signup?ref=quote" className="underline underline-offset-2 hover:text-gray-600 transition-colors">
              {tenant.platformName}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
