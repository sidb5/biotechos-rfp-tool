'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';

type Mode = 'login' | 'signup';

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const res = await fetch('/api/admin/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? 'Signup failed'); return; }
        if (json.approved) {
          // Auto-approved (APP_ADMINISTRATOR email) — log them in directly
          const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
          if (authErr) { setSuccess('Account approved — please sign in.'); setMode('login'); return; }
          router.push('/admin/dashboard');
          return;
        }
        setSuccess('Account created — pending administrator approval. You will be able to log in once approved.');
      } else {
        const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
        if (authErr) { setError(authErr.message); return; }
        router.push('/admin/dashboard');
      }
    } catch {
      setError('Something went wrong — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">BiotechOS</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Admin Portal</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'login' ? 'Sign in to manage the platform' : 'Request admin access'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="admin@company.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="Min 8 characters"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Request access'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500">
          {mode === 'login' ? (
            <>Need access? <button onClick={() => { setMode('signup'); setError(''); setSuccess(''); }} className="text-red-600 hover:text-red-700 font-medium">Request admin account</button></>
          ) : (
            <>Already have access? <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className="text-red-600 hover:text-red-700 font-medium">Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
}
