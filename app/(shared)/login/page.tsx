'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@shared/lib/supabase';

type Step = 'persona' | 'login';
type UserType = 'cro' | 'biotech';

const DASHBOARD: Record<UserType, string> = {
  cro: '/dashboard',
  biotech: '/biotech/dashboard',
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('persona');
  const [userType, setUserType] = useState<UserType | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotSent, setForgotSent] = useState(false);

  // Pre-open forgot password panel if ?reset=1
  useEffect(() => {
    if (searchParams.get('reset') === '1') {
      setMode('forgot');
      setStep('login'); // skip persona picker for password reset
    }
  }, [searchParams]);

  function selectPersona(type: UserType) {
    setUserType(type);
    setStep('login');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Enforce persona: the selected card must match the account's registered user_type.
      // Existing accounts with no user_type are treated as CRO (backward-compat).
      const storedType = data.user?.user_metadata?.user_type ?? 'cro';

      if (userType && storedType !== userType) {
        // Wrong persona selected — sign them back out and explain.
        await supabase.auth.signOut();
        const accountLabel  = storedType === 'cro' ? 'CRO' : 'Biotech / Pharma';
        const correctOption = storedType === 'cro' ? "I'm a CRO" : "I'm a Biotech / Pharma";
        setError(
          `This email is registered as a ${accountLabel} account. ` +
          `Please go back and select "${correctOption}".`
        );
        setLoading(false);
        return;
      }

      const destination = storedType === 'biotech' ? DASHBOARD.biotech : DASHBOARD.cro;
      router.refresh();
      router.push(destination);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      // Intentionally show success even on error (don't leak email existence)
    }

    setForgotSent(true);
    setLoading(false);
  }

  // ── Forgot password ─────────────────────────────────────────────────────

  if (mode === 'forgot') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-1">
              BiotechOS
            </p>
            <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
            <p className="text-sm text-gray-500 mt-1">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>

          {forgotSent ? (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4 text-sm text-green-800">
              <p className="font-semibold mb-1">Check your inbox</p>
              <p>If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link. It expires in 1 hour.</p>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="you@yourcompany.com"
                />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => { setMode('login'); setForgotSent(false); setError(''); setStep('persona'); }}
            className="mt-5 text-sm text-gray-600 font-medium hover:underline flex items-center gap-1"
          >
            ← Back to sign in
          </button>
        </div>
      </main>
    );
  }

  // ── Step 1: Persona picker ──────────────────────────────────────────────

  if (step === 'persona') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-2">
              BiotechOS
            </p>
            <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
            <p className="text-gray-500 mt-2 text-sm">
              Sign in to the right product for your role.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* CRO card */}
            <button
              type="button"
              onClick={() => selectPersona('cro')}
              className="group text-left border-2 border-gray-200 hover:border-green-500 bg-white rounded-2xl p-6 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <div className="w-10 h-10 bg-green-100 group-hover:bg-green-200 rounded-xl flex items-center justify-center mb-4 transition-colors">
                <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">I'm a CRO</h2>
              <p className="text-sm text-gray-500 leading-snug">
                Respond to incoming RFPs and quote requests faster.
              </p>
              <p className="mt-3 text-xs font-medium text-green-600 group-hover:text-green-700">
                Proposal Engine →
              </p>
            </button>

            {/* Biotech card */}
            <button
              type="button"
              onClick={() => selectPersona('biotech')}
              className="group text-left border-2 border-gray-200 hover:border-blue-500 bg-white rounded-2xl p-6 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div className="w-10 h-10 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center mb-4 transition-colors">
                <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">I'm a Biotech / Pharma</h2>
              <p className="text-sm text-gray-500 leading-snug">
                Find, brief, and engage CROs for preclinical studies.
              </p>
              <p className="mt-3 text-xs font-medium text-blue-600 group-hover:text-blue-700">
                CRO Engagement Pipeline →
              </p>
            </button>
          </div>

          <p className="mt-8 text-sm text-center text-gray-500">
            No account?{' '}
            <Link href="/signup" className="text-gray-700 font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </main>
    );
  }

  // ── Step 2: Sign-in form ────────────────────────────────────────────────

  const isCro = userType === 'cro';

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">

        {/* Back to persona picker */}
        <button
          type="button"
          onClick={() => { setStep('persona'); setError(''); }}
          className="mb-6 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
        >
          ← Change role
        </button>

        <div className="mb-8">
          <div className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase mb-2 ${isCro ? 'text-green-600' : 'text-blue-600'}`}>
            <span className={`w-2 h-2 rounded-full ${isCro ? 'bg-green-500' : 'bg-blue-500'}`} />
            {isCro ? 'CRO — Proposal Engine' : 'Biotech / Pharma — CRO Pipeline'}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isCro
              ? 'Reply to any client request in hours, not days.'
              : 'Find and brief CROs without exposing your IP.'}
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                isCro ? 'focus:ring-green-500' : 'focus:ring-blue-500'
              }`}
              placeholder={isCro ? 'you@yourcro.com' : 'you@yourbiotech.com'}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); }}
                className={`text-xs font-medium hover:underline ${isCro ? 'text-green-600' : 'text-blue-600'}`}
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                isCro ? 'focus:ring-green-500' : 'focus:ring-blue-500'
              }`}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isCro
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-gray-500">
          No account?{' '}
          <Link href="/signup" className={`font-medium hover:underline ${isCro ? 'text-green-600' : 'text-blue-600'}`}>
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <LoginPageInner />
    </Suspense>
  );
}
