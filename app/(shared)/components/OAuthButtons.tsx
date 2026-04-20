'use client';

import { useState } from 'react';
import { supabase } from '@shared/lib/supabase';

// ── Provider SVG icons ────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022"/>
      <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00"/>
      <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF"/>
      <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900"/>
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface OAuthButtonsProps {
  userType: 'cro' | 'biotech';
  mode: 'signin' | 'signup';
}

export default function OAuthButtons({ userType, mode }: OAuthButtonsProps) {
  const [loading, setLoading] = useState<'google' | 'azure' | null>(null);
  const [error, setError]     = useState('');

  async function handleOAuth(provider: 'google' | 'azure') {
    setLoading(provider);
    setError('');

    const destination = userType === 'biotech' ? '/biotech/dashboard' : '/dashboard';
    // Pass persona type + destination in redirectTo so the callback can:
    //   1. Set user_type metadata on new accounts
    //   2. Route to the correct dashboard
    const redirectTo =
      `${window.location.origin}/auth/callback` +
      `?type=${userType}&next=${encodeURIComponent(destination)}`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        ...(provider === 'azure' ? { scopes: 'openid email profile' } : {}),
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(null);
    }
    // On success the browser navigates to the provider — no cleanup needed
  }

  const verb = mode === 'signup' ? 'Sign up' : 'Sign in';

  return (
    <div className="flex flex-col gap-2">
      {/* Divider */}
      <div className="flex items-center gap-3 my-1">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 shrink-0">or continue with</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Google */}
      <button
        type="button"
        onClick={() => handleOAuth('google')}
        disabled={!!loading}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <GoogleIcon />
        {loading === 'google' ? 'Redirecting…' : `${verb} with Google`}
      </button>

      {/* Microsoft */}
      <button
        type="button"
        onClick={() => handleOAuth('azure')}
        disabled={!!loading}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <MicrosoftIcon />
        {loading === 'azure' ? 'Redirecting…' : `${verb} with Microsoft`}
      </button>

      {/* Error (provider not yet configured shows here) */}
      {error && (
        <p className="text-xs text-center text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
