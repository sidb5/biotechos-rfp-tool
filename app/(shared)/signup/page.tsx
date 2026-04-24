'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@shared/lib/supabase';
import VerifyBusiness from '@shared/components/VerifyBusiness';
import { checkCorporateEmail } from '@shared/lib/email-domain';
import OAuthButtons from '@shared/components/OAuthButtons';
import { useTenant } from '@shared/components/TenantProvider';
import BrandLockup, { getBrand } from '@shared/components/BrandLockup';

type Step = 'persona' | 'signup' | 'verify';
type UserType = 'cro' | 'biotech';

interface DirectoryMatch {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
}

// Where each user type lands after completing signup
const DASHBOARD: Record<UserType, string> = {
  cro: '/dashboard',
  biotech: '/biotech/dashboard',
};

function SignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenant = useTenant();
  const brand  = getBrand(tenant.platformName);

  const [step, setStep] = useState<Step>('persona');
  const [userType, setUserType] = useState<UserType | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [croCount, setCroCount] = useState<number | null>(null);

  // Domain match state (CRO signup only)
  const [directoryMatches, setDirectoryMatches] = useState<DirectoryMatch[]>([]);
  const [matchDismissed, setMatchDismissed] = useState(false);
  const [linkedDirectoryId, setLinkedDirectoryId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  // Pick up ?ref=CODE
  useEffect(() => {
    const ref = searchParams.get('ref') ?? sessionStorage.getItem('referral_code') ?? '';
    if (ref) {
      sessionStorage.setItem('referral_code', ref);
      setRefCode(ref);
    }
  }, [searchParams]);

  // Social proof count (CRO-side)
  useEffect(() => {
    fetch('/api/stats/cro-count')
      .then(r => r.json())
      .then(d => setCroCount(d.count))
      .catch(() => { /* silent */ });
  }, []);

  // Domain match: when CRO reaches verify step, look for directory matches by email domain
  useEffect(() => {
    if (step !== 'verify' || userType !== 'cro' || !email) return;
    const domain = email.split('@')[1];
    if (!domain) return;

    supabase
      .from('cros_directory')
      .select('id, name, city, state, country')
      .ilike('contact_email', `%@${domain}`)
      .limit(3)
      .then(({ data }) => {
        if (data && data.length > 0) setDirectoryMatches(data as DirectoryMatch[]);
      });
  }, [step, userType, email]);

  function selectPersona(type: UserType) {
    setUserType(type);
    setStep('signup');
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!userType) return;
    setError('');
    setLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    // Corporate-domain gate (Task 13)
    const domainCheck = checkCorporateEmail(email);
    if (!domainCheck.ok) {
      setError(domainCheck.message ?? 'Please use your work email.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/confirm`,
        // user_type is stored in auth metadata — readable server-side from
        // user.user_metadata.user_type without a DB call
        data: { user_type: userType },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      // Signed in immediately — CRO users go to verify step; biotech skip verify
      if (userType === 'cro') {
        setStep('verify');
      } else {
        router.push(DASHBOARD.biotech);
        router.refresh();
      }
      setLoading(false);
    } else {
      // Email confirmation required
      setSuccess(true);
      setLoading(false);
    }
  }

  async function handleVerified() {
    const code = sessionStorage.getItem('referral_code');
    if (code) {
      try {
        await fetch('/api/referral/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referral_code: code }),
        });
      } catch { /* non-fatal */ }
      sessionStorage.removeItem('referral_code');
    }
    router.push(DASHBOARD[userType ?? 'cro']);
    router.refresh();
  }

  function handleSkipVerify() {
    sessionStorage.removeItem('referral_code');
    router.push(DASHBOARD[userType ?? 'cro']);
    router.refresh();
  }

  async function handleLinkDirectory(id: string) {
    setLinking(true);
    try {
      await fetch('/api/profile/link-directory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cros_directory_id: id }),
      });
      setLinkedDirectoryId(id);
    } catch { /* non-fatal */ }
    setLinking(false);
  }

  // ── Email confirmation sent ─────────────────────────────────────────────

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

  // ── Business verification (CRO only) ───────────────────────────────────

  if (step === 'verify') {
    const showBanner = directoryMatches.length > 0 && !matchDismissed && !linkedDirectoryId;

    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md flex flex-col gap-4">
          {/* Domain match banner */}
          {showBanner && (
            <div className="bg-white border border-green-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-800 mb-1">
                We found {directoryMatches.length === 1 ? 'your company' : 'potential matches'} in our directory
              </p>
              <div className="flex flex-col gap-2 mt-2">
                {directoryMatches.map(match => (
                  <div key={match.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{match.name}</p>
                      {(match.city || match.state) && (
                        <p className="text-xs text-gray-500">
                          {[match.city, match.state, match.country].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    {linkedDirectoryId === match.id ? (
                      <span className="text-xs font-medium text-green-600 shrink-0">Linked ✓</span>
                    ) : (
                      <button
                        onClick={() => handleLinkDirectory(match.id)}
                        disabled={linking}
                        className="text-xs font-medium text-green-600 hover:text-green-700 border border-green-300 rounded-lg px-3 py-1 shrink-0 disabled:opacity-50 transition-colors"
                      >
                        {linking ? '…' : 'Yes, this is us'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setMatchDismissed(true)}
                className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                None of these match — skip
              </button>
            </div>
          )}

          {linkedDirectoryId && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Linked to our CRO directory — your profile will be pre-populated.
            </div>
          )}

          <VerifyBusiness onVerified={handleVerified} onSkip={handleSkipVerify} />
        </div>
      </main>
    );
  }

  // ── Step 1: Who are you? ────────────────────────────────────────────────

  if (step === 'persona') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-3">
              <BrandLockup brand={brand} variant="auth" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Who are you?</h1>
            <p className="text-gray-500 mt-2 text-sm">
              We'll show you the right tools for your role.
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
              <h2 className="text-base font-semibold text-gray-900 mb-1">
                I'm a CRO
              </h2>
              <p className="text-sm text-gray-500 leading-snug">
                I run preclinical studies and want to respond to incoming RFPs faster.
              </p>
              <p className="mt-3 text-xs font-medium text-green-600 group-hover:text-green-700">
                {tenant.appSide === 'sell' ? tenant.platformName : 'CRORFP'} →
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
              <h2 className="text-base font-semibold text-gray-900 mb-1">
                I'm a Biotech / Pharma
              </h2>
              <p className="text-sm text-gray-500 leading-snug">
                I need to find, brief, and engage {tenant.orgLabelPlural} for preclinical studies — with IP protection built in.
              </p>
              <p className="mt-3 text-xs font-medium text-blue-600 group-hover:text-blue-700">
                CRO Engagement Pipeline →
              </p>
            </button>
          </div>

          <p className="mt-8 text-sm text-center text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="text-gray-700 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  // ── Step 2: Create account ──────────────────────────────────────────────

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

        {/* Header — adapts to user type */}
        <div className="mb-8">
          <div className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase mb-2 ${isCro ? 'text-green-600' : 'text-blue-600'}`}>
            <span className={`w-2 h-2 rounded-full ${isCro ? 'bg-green-500' : 'bg-blue-500'}`} />
            {isCro ? `CRO — ${tenant.platformName}` : `Biotech / Pharma — ${tenant.platformName}`}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isCro
              ? 'Reply to any client request in hours, not days.'
              : `Find and brief ${tenant.orgLabelPlural} without exposing your IP.`}
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {isCro
              ? 'Turn emails, PDFs, and RFPs into professional proposals without pulling your scientists into sales.'
              : 'Go from internal study brief to CRO shortlist in one session. Every outbound message requires your approval.'}
          </p>
          {isCro && croCount !== null && croCount > 0 && (
            <p className="mt-3 text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" />
              </svg>
              Join {croCount}+ {tenant.orgLabelPlural} already using {tenant.platformName}
            </p>
          )}
        </div>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Work email
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                isCro ? 'focus:ring-green-500' : 'focus:ring-blue-500'
              }`}
              placeholder="Min. 8 characters"
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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <OAuthButtons userType={userType ?? 'cro'} mode="signup" />

        <p className="mt-6 text-sm text-center text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className={`font-medium hover:underline ${isCro ? 'text-green-600' : 'text-blue-600'}`}>
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
  );
}
