import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// ─── Public Supabase client (service role for view tracking) ─────────────────
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
              <td colSpan={hideUnitPrices ? 1 : 3} className="pt-3 text-right text-xs font-semibold text-gray-500 uppercase pr-2">
                Total
              </td>
              <td className="pt-3 pl-2 text-right font-bold text-gray-900">
                ${total.toLocaleString('en-US')}
              </td>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicQuotePage({ params }: { params: { token: string } }) {
  const supabase = getAdminClient();

  // Look up proposal by share token
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, share_enabled, share_views, share_first_viewed_at, created_at, quote_data, cro_id, rfp_id')
    .eq('share_token', params.token)
    .single();

  if (!proposal || !proposal.share_enabled) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl font-bold text-gray-200 mb-3">404</p>
          <p className="text-gray-600 font-medium mb-1">This quote link is no longer active</p>
          <p className="text-sm text-gray-400">The CRO may have turned off sharing for this quote.</p>
        </div>
      </div>
    );
  }

  // Track view (fire-and-forget, never blocks render)
  const now = new Date().toISOString();
  supabase.from('proposals').update({
    share_views: (proposal.share_views ?? 0) + 1,
    share_first_viewed_at: proposal.share_first_viewed_at ?? now,
    share_last_viewed_at: now,
  }).eq('id', proposal.id).then(() => {});

  // Fetch RFP + CRO profile
  const [{ data: rfp }, { data: profile }] = await Promise.all([
    supabase.from('rfps').select('biotech_name').eq('id', proposal.rfp_id).single(),
    supabase.from('cro_profiles').select('company_name').eq('id', proposal.cro_id).single(),
  ]);

  const qd = (proposal.quote_data as QuoteData | null) ?? {
    mode: 'quick_quote',
    scope: '',
    timeline: [],
    investment: [],
    next_steps: [],
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-1">
            {profile?.company_name ?? 'CRO Proposal Engine'}
          </p>
          <h1 className="text-xl font-bold text-gray-900">
            Proposal for {rfp?.biotech_name ?? 'your project'}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Prepared {proposal.created_at ? formatDate(proposal.created_at) : ''}
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-10">
        <ReadonlyScope text={qd.scope} />
        <ReadonlyTimeline rows={qd.timeline ?? []} />
        <ReadonlyInvestment rows={qd.investment ?? []} hideUnitPrices={qd._hideUnitPrices ?? false} />
        <ReadonlyNextSteps lines={qd.next_steps ?? []} />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-6 mt-8">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs text-gray-400 text-center">
            Created with{' '}
            <a href="/signup" className="underline underline-offset-2 hover:text-gray-600 transition-colors">
              CRO Proposal Engine
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
