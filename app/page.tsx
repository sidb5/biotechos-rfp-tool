import { getTenantConfig } from '@shared/lib/get-tenant';
import BrandLockup, { getBrand } from '@shared/components/BrandLockup';

// ── Per-side copy ─────────────────────────────────────────────────────────────

function SellSideLanding({ orgLabel, platformName }: { orgLabel: string; platformName: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="mb-4">
          <BrandLockup brand={getBrand(platformName)} variant="hero" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Reply to any client request in hours,
          <span className="text-green-600"> not days.</span>
        </h1>
        <p className="text-lg text-gray-500 mb-6">
          Turn emails, PDFs, and RFPs into professional proposals without pulling your scientists into sales.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <span className="text-sm text-gray-600 flex items-center gap-1.5">
            <span className="text-green-500 font-bold">✓</span> Paste any request
          </span>
          <span className="text-sm text-gray-600 flex items-center gap-1.5">
            <span className="text-green-500 font-bold">✓</span> Quote in under an hour
          </span>
          <span className="text-sm text-gray-600 flex items-center gap-1.5">
            <span className="text-green-500 font-bold">✓</span> Win more, respond faster
          </span>
        </div>
        <div className="flex gap-4">
          <a href="/login" className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors">
            Get started
          </a>
          <a href="/dashboard" className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors">
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}

function BuySideLanding({ platformName, counterpartyLabel }: { platformName: string; counterpartyLabel: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="mb-4">
          <BrandLockup brand={getBrand(platformName)} variant="hero" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Find the right {counterpartyLabel}.
          <span className="text-blue-600"> Protect your IP.</span>
        </h1>
        <p className="text-lg text-gray-500 mb-6">
          Brief, engage, and award preclinical {counterpartyLabel}s — without your compound leaving your vault until you&apos;re ready.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <span className="text-sm text-gray-600 flex items-center gap-1.5">
            <span className="text-blue-500 font-bold">✓</span> IP-safe {counterpartyLabel} enquiries
          </span>
          <span className="text-sm text-gray-600 flex items-center gap-1.5">
            <span className="text-blue-500 font-bold">✓</span> BIOSECURE-compliant matching
          </span>
          <span className="text-sm text-gray-600 flex items-center gap-1.5">
            <span className="text-blue-500 font-bold">✓</span> AI handles the back-and-forth
          </span>
        </div>
        <div className="flex gap-4">
          <a href="/login" className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Get started
          </a>
          <a href="/biotech/dashboard" className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors">
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const { appSide, orgLabel, platformName, counterpartyLabel } = getTenantConfig();

  if (appSide === 'buy') {
    return <BuySideLanding platformName={platformName} counterpartyLabel={counterpartyLabel} />;
  }

  return <SellSideLanding orgLabel={orgLabel} platformName={platformName} />;
}
