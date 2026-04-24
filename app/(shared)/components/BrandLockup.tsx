// BrandLockup — brand mark + wordmark for all four platform tenants.
// No 'use client' — works in server components and client components alike.

export type BrandId = 'crorfp' | 'cdmorfp' | 'sourcemycro' | 'sourcemycdmo';

/** Map tenant platformName → BrandId */
export function getBrand(platformName: string): BrandId {
  const p = platformName.toLowerCase().replace(/\s/g, '');
  if (p === 'sourcemycdmo') return 'sourcemycdmo';
  if (p === 'sourcemycro')  return 'sourcemycro';
  if (p === 'cdmorfp')      return 'cdmorfp';
  return 'crorfp';
}

/** For a sell-side brand, return its buy-side counterpart (used in cross-promo). */
export function getBuySideBrand(sellBrand: BrandId): BrandId {
  return sellBrand === 'cdmorfp' ? 'sourcemycdmo' : 'sourcemycro';
}

// ── SVG marks ────────────────────────────────────────────────────────────────

function CROMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="13.5" stroke="currentColor" strokeWidth="1.6" opacity="0.35" />
      <path d="M11 10.5 L17.5 16 L11 21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 10.5 L23.5 16 L17 21.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
    </svg>
  );
}

function SourceMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M4.5 16 A11.5 11.5 0 0 1 16 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.3" />
      <path d="M8 16 A8 8 0 0 1 16 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
      <path d="M11.5 16 A4.5 4.5 0 0 1 16 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <circle cx="16" cy="16" r="2.2" fill="currentColor" />
      <path d="M16 20 L16 27" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
      <path d="M20 16 L27 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BrandLockupProps {
  brand: BrandId;
  /**
   * nav  — compact (22 px mark), for sidebar / top-bar headers
   * auth — medium  (28 px mark), for login / auth pages
   * hero — large   (36 px mark), for landing pages
   */
  variant?: 'nav' | 'auth' | 'hero';
  /**
   * auto — honours system/user dark-mode class (default)
   * dark — forces dark-background colours (e.g. coloured marketing panel)
   */
  surface?: 'auto' | 'dark';
  className?: string;
}

export default function BrandLockup({
  brand,
  variant = 'auth',
  surface = 'auto',
  className,
}: BrandLockupProps) {
  const isCRO  = brand === 'crorfp' || brand === 'cdmorfp';
  const Mark   = isCRO ? CROMark : SourceMark;

  // Wordmark split — first segment plain, second in accent colour
  const [w1, w2] =
    brand === 'crorfp'      ? ['CRO',    'RFP']
    : brand === 'cdmorfp'   ? ['CDMO',   'RFP']
    : brand === 'sourcemycro' ? ['Source', 'MyCRO']
    :                          ['Source', 'MyCDMO'];

  // Colour classes
  const markCls   = surface === 'dark'
    ? 'text-[#3DD6C4]'
    : 'text-[#14A798] dark:text-[#3DD6C4]';

  const wordCls   = surface === 'dark'
    ? 'text-[#E6EEF7]'
    : 'text-[#0B1220] dark:text-[#E6EEF7]';

  const accentCls = surface === 'dark'
    ? 'text-[#3DD6C4]'
    : 'text-[#14A798] dark:text-[#3DD6C4]';

  // Size scale
  const s = {
    nav:  { mark: 'w-[22px] h-[22px]', text: 'text-[16px]', gap: 'gap-2'     },
    auth: { mark: 'w-[28px] h-[28px]', text: 'text-[22px]', gap: 'gap-[10px]' },
    hero: { mark: 'w-[36px] h-[36px]', text: 'text-[28px]', gap: 'gap-3'     },
  }[variant];

  return (
    <span className={`inline-flex items-center ${s.gap} ${className ?? ''}`}>
      <Mark className={`${s.mark} shrink-0 ${markCls}`} />
      <span className={`font-bold ${s.text} tracking-tight leading-none ${wordCls}`}>
        {w1}<span className={accentCls}>{w2}</span>
      </span>
    </span>
  );
}
