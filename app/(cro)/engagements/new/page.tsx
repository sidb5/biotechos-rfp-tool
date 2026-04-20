'use client';

// /engagements/new — CRO paste flow
// Paste email → click one button → engagement created automatically.
// Sender email + name extracted in the background.
// Only falls back to manual input if auto-extraction fails.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewEngagementPage() {
  const router = useRouter();

  const [pastedEmail, setPastedEmail]   = useState('');
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState('');

  // Shown only when auto-extraction fails
  const [needsManual, setNeedsManual]   = useState(false);
  const [manualEmail, setManualEmail]   = useState('');
  const [manualName, setManualName]     = useState('');

  async function createEngagement(email: string, name: string | null) {
    const res  = await fetch('/api/cro/engagements', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        counterparty_email: email,
        counterparty_name:  name,
        pasted_email:       pastedEmail,
      }),
    });
    const json = await res.json() as { engagement_id?: string; error?: string };
    if (!res.ok || !json.engagement_id) throw new Error(json.error ?? 'Failed to create engagement');
    router.push(`/engagements/${json.engagement_id}`);
  }

  // Single click: extract + create in one shot
  async function handleStart() {
    if (!pastedEmail.trim() || busy) return;
    setBusy(true);
    setError('');
    setNeedsManual(false);
    try {
      const res  = await fetch('/api/cro/engagements?action=extract-sender', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pasted_email: pastedEmail }),
      });
      const json = await res.json() as { extracted_email: string | null; extracted_name: string | null };

      if (!json.extracted_email) {
        // Extraction failed — ask for manual input without leaving the page
        setNeedsManual(true);
        setBusy(false);
        return;
      }

      await createEngagement(json.extracted_email, json.extracted_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again');
      setBusy(false);
    }
  }

  // Manual fallback submit
  async function handleManualSubmit() {
    const email = manualEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { setError('Please enter a valid email address'); return; }
    setBusy(true);
    setError('');
    try {
      await createEngagement(email, manualName.trim() || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — please retry');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-2xl space-y-6">

        <div>
          <a href="/dashboard" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Back to dashboard
          </a>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">New engagement</h1>
          <p className="text-sm text-gray-500 mt-1">
            Paste the incoming quote request or RFP email and click Start — sender is extracted automatically.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Paste the incoming email
            </label>
            <textarea
              value={pastedEmail}
              onChange={e => { setPastedEmail(e.target.value); setNeedsManual(false); setError(''); }}
              placeholder={`From: Dr. Sarah Chen <s.chen@biotech-corp.com>\nSubject: Preclinical study enquiry\n\nHello, we are looking for a CRO to run a 28-day GLP toxicology study...`}
              rows={12}
              autoFocus
              disabled={busy}
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {/* Manual fallback — only shown when auto-extraction fails */}
          {needsManual && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                Couldn't find a sender address in the pasted text — enter it here:
              </p>
              <input
                type="email"
                value={manualEmail}
                onChange={e => { setManualEmail(e.target.value); setError(''); }}
                placeholder="sender@biotech-corp.com"
                autoFocus
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="text"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                placeholder="Sender name (optional)"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-600">⚠ {error}</p>}

          <div className="flex justify-end">
            {!needsManual ? (
              <button
                onClick={handleStart}
                disabled={!pastedEmail.trim() || busy}
                className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? 'Creating engagement…' : 'Start engagement →'}
              </button>
            ) : (
              <button
                onClick={handleManualSubmit}
                disabled={!manualEmail.trim() || busy}
                className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? 'Creating…' : 'Create engagement →'}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
