'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@shared/lib/supabase';
import { checkCorporateEmail } from '@shared/lib/email-domain';
import OAuthButtons from '@shared/components/OAuthButtons';
import { useTenant } from '@shared/components/TenantProvider';

// ── Per-side marketing copy ────────────────────────────────────────────────────

const SELL_SIDE_COPY = {
  tagline: 'Win more studies. Spend less time writing.',
  sub:     'AI drafts every proposal section — you just review and send.',
  benefits: [
    'Reply to any client brief in hours, not days',
    'Detect data gaps and collect answers from scientists automatically',
    'Proposals that cite confirmed lab values, not generic boilerplate',
    'Track every opportunity from enquiry to award in one place',
  ],
} as const;

const BUY_SIDE_COPY = {
  tagline: 'Find the right partner. Protect your IP.',
  sub:     "Brief, engage, and award \u2014 without revealing your compound until you\u2019re ready.",
  benefits: [
    'IP-safe enquiries keep compound identity in your vault',
    'BIOSECURE-compliant partner matching',
    'AI-drafted follow-ups arrive awaiting your approval',
    'One dashboard from first contact to signed agreement',
  ],
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeOpacity={0.3} />
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function LoginPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const tenant       = useTenant();

  // Derive user type from tenant — no persona picker needed
  const userType = tenant.appSide === 'sell' ? 'cro' : 'biotech';
  const isCro    = userType === 'cro';
  const copy     = isCro ? SELL_SIDE_COPY : BUY_SIDE_COPY;

  // Theme colours driven by side
  const accent = isCro ? 'green' : 'blue';
  const accentClasses = {
    ring:   isCro ? 'focus:ring-green-500' : 'focus:ring-blue-500',
    btn:    isCro ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700',
    text:   isCro ? 'text-green-600'  : 'text-blue-600',
    border: isCro ? 'border-green-600': 'border-blue-600',
    dot:    isCro ? 'bg-green-400'    : 'bg-blue-400',
    panel:  isCro
      ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950'
      : 'bg-gradient-to-br from-gray-900 via-gray-800 to-blue-950',
  };

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [mode, setMode]             = useState<'login' | 'forgot'>('login');
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    if (searchParams.get('reset') === '1') setMode('forgot');
  }, [searchParams]);

  // ── Sign in ────────────────────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const domainCheck = checkCorporateEmail(email);
    if (!domainCheck.ok) {
      setError(domainCheck.message ?? 'Please use your work email.');
      setLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const storedType = data.user?.user_metadata?.user_type ?? 'cro';
    if (storedType !== userType) {
      await supabase.auth.signOut();
      const correctDomain = storedType === 'cro'
        ? tenant.platformName
        : 'the Biotech portal';
      setError(`This account is registered on ${correctDomain}. Please sign in there instead.`);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push(userType === 'biotech' ? '/biotech/dashboard' : '/dashboard');
  }

  // ── Forgot password ────────────────────────────────────────────────────────

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });
    } catch { /* intentionally silent — don't leak email existence */ }
    setForgotSent(true);
    setLoading(false);
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left panel: marketing ── */}
      <div className={`hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between p-12 xl:p-16 ${accentClasses.panel}`}>

        {/* Top: brand */}
        <div>
          <span className={`inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase ${accentClasses.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${accentClasses.dot}`} />
            {tenant.platformName}
          </span>
        </div>

        {/* Middle: headline + benefits */}
        <div className="space-y-10">
          <div>
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight">
              {copy.tagline}
            </h1>
            <p className="mt-4 text-lg text-gray-400 leading-relaxed max-w-md">
              {copy.sub}
            </p>
          </div>

          <ul className="space-y-4">
            {copy.benefits.map(b => (
              <li key={b} className={`flex items-start gap-3 ${accentClasses.text}`}>
                <CheckIcon />
                <span className="text-gray-200 text-sm leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom: social proof */}
        <p className="text-xs text-gray-500">
          Built for preclinical {tenant.orgLabelPlural}.
        </p>
      </div>

      {/* ── Right panel: auth form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">

          {/* Mobile-only brand */}
          <div className="lg:hidden mb-8 text-center">
            <span className={`text-xs font-bold tracking-widest uppercase ${accentClasses.text}`}>
              {tenant.platformName}
            </span>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">{copy.tagline}</h2>
          </div>

          {mode === 'forgot' ? (
            /* ── Forgot password ── */
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Reset your password</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              {forgotSent ? (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4 text-sm text-green-800">
                  <p className="font-semibold mb-1">Check your inbox</p>
                  <p>
                    If an account exists for <strong>{email}</strong>, we&apos;ve sent a reset
                    link. It expires in 1 hour.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${accentClasses.ring}`}
                      placeholder="you@yourcompany.com"
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-2.5 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 ${accentClasses.btn}`}
                  >
                    {loading ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => { setMode('login'); setForgotSent(false); setError(''); }}
                className="mt-5 text-sm text-gray-600 font-medium hover:underline flex items-center gap-1"
              >
                ← Back to sign in
              </button>
            </>
          ) : (
            /* ── Sign in form ── */
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {isCro
                    ? `Welcome back to ${tenant.platformName}.`
                    : `Welcome back to ${tenant.platformName}.`}
                </p>
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Work email
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${accentClasses.ring}`}
                    placeholder={isCro ? 'you@yourcro.com' : 'you@yourbiotech.com'}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); }}
                      className={`text-xs font-medium hover:underline ${accentClasses.text}`}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${accentClasses.ring}`}
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-2.5 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${accentClasses.btn}`}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <OAuthButtons userType={userType} mode="signin" />

              <p className="mt-6 text-sm text-center text-gray-500">
                No account?{' '}
                <Link href="/signup" className={`font-medium hover:underline ${accentClasses.text}`}>
                  Sign up
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <LoginPageInner />
    </Suspense>
  );
}
