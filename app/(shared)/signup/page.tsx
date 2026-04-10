'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@shared/lib/supabase';
import VerifyBusiness from '@shared/components/VerifyBusiness';

type Step = 'signup' | 'verify'

function SignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [croCount, setCroCount] = useState<number | null>(null);

  // Pick up ?ref=CODE from URL and store in sessionStorage
  useEffect(() => {
    const ref = searchParams.get('ref') ?? sessionStorage.getItem('referral_code') ?? ''
    if (ref) {
      sessionStorage.setItem('referral_code', ref)
      setRefCode(ref)
    }
  }, [searchParams])

  // Fetch social proof count
  useEffect(() => {
    fetch('/api/stats/cro-count')
      .then(r => r.json())
      .then(d => setCroCount(d.count))
      .catch(() => {/* silent */})
  }, [])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Points at our custom confirm route so we can send a branded welcome email
        emailRedirectTo: `${window.location.origin}/api/auth/confirm`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      // Signed in immediately — proceed to verify step
      setStep('verify');
      setLoading(false);
    } else {
      // Email confirmation required
      setSuccess(true);
      setLoading(false);
    }
  }

  async function handleVerified() {
    // Apply referral code if present
    const code = sessionStorage.getItem('referral_code')
    if (code) {
      try {
        await fetch('/api/referral/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referral_code: code }),
        })
      } catch {
        /* non-fatal — proceed regardless */
      }
      sessionStorage.removeItem('referral_code')
    }

    router.push('/dashboard');
    router.refresh();
  }

  function handleSkipVerify() {
    // Still apply referral if present (non-verified referees won't earn reward,
    // but we still record the attribution)
    sessionStorage.removeItem('referral_code')
    router.push('/dashboard');
    router.refresh();
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Check your email</h1>
          <p className="text-sm text-gray-500">
            We sent a confirmation link to <strong>{email}</strong>.
            Click it to activate your account.
          </p>
        </div>
      </main>
    );
  }

  if (step === 'verify') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <VerifyBusiness onVerified={handleVerified} onSkip={handleSkipVerify} />
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">

        {/* Referral banner */}
        {refCode && (
          <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>You were referred by a colleague</strong> — complete signup to get 1 month free on any paid plan.
            </span>
          </div>
        )}

        <div className="mb-8">
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-1">
            Proposal Engine
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Reply to any client request in hours, not days.</h1>
          <p className="text-sm text-gray-500 mt-2">Turn emails, PDFs, and RFPs into professional proposals without pulling your scientists into sales.</p>
          <div className="flex flex-wrap gap-3 mt-3">
            <span className="text-xs text-gray-600 flex items-center gap-1"><span className="text-green-500 font-bold">✓</span> Paste any request</span>
            <span className="text-xs text-gray-600 flex items-center gap-1"><span className="text-green-500 font-bold">✓</span> Quote in under an hour</span>
            <span className="text-xs text-gray-600 flex items-center gap-1"><span className="text-green-500 font-bold">✓</span> Win more, respond faster</span>
          </div>
          {/* Social proof */}
          {croCount !== null && croCount > 0 && (
            <p className="mt-3 text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" />
              </svg>
              Join {croCount}+ CROs already using Proposal Engine
            </p>
          )}
        </div>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="you@yourcro.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Min. 8 characters"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="text-green-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <SignupPageInner />
    </Suspense>
  )
}
