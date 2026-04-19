'use client';

// /engagements/new — CRO paste flow
// Step 1: Paste raw email → extract sender → show for confirmation
// Step 2: User confirms (or edits) the sender address → create engagement

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'paste' | 'confirm' | 'creating';

export default function NewEngagementPage() {
  const router = useRouter();

  const [step, setStep]               = useState<Step>('paste');
  const [pastedEmail, setPastedEmail] = useState('');
  const [extracting, setExtracting]   = useState(false);
  const [extracted, setExtracted]     = useState<string | null>(null);
  const [confirmed, setConfirmed]     = useState('');   // user-editable field
  const [counterpartyName, setCounterpartyName] = useState('');
  const [error, setError]             = useState('');

  // ── Step 1: Extract sender from pasted text ────────────────────────────────

  async function handleExtract() {
    if (!pastedEmail.trim()) return;
    setExtracting(true);
    setError('');
    try {
      const res  = await fetch('/api/cro/engagements?action=extract-sender', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pasted_email: pastedEmail }),
      });
      const json = await res.json() as { extracted_email: string | null };
      setExtracted(json.extracted_email);
      setConfirmed(json.extracted_email ?? '');
      setStep('confirm');
    } catch {
      setError('Failed to extract sender — please continue manually');
      setExtracted(null);
      setConfirmed('');
      setStep('confirm');
    } finally {
      setExtracting(false);
    }
  }

  // ── Step 2: Confirm and create engagement ──────────────────────────────────

  async function handleCreate() {
    const email = confirmed.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setStep('creating');
    setError('');
    try {
      const res  = await fetch('/api/cro/engagements', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          counterparty_email: email,
          counterparty_name:  counterpartyName.trim() || null,
          pasted_email:       pastedEmail,
        }),
      });
      const json = await res.json() as { engagement_id?: string; error?: string };
      if (!res.ok || !json.engagement_id) {
        setError(json.error ?? 'Failed to create engagement');
        setStep('confirm');
        return;
      }
      router.push(`/engagements/${json.engagement_id}`);
    } catch {
      setError('Network error — please retry');
      setStep('confirm');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-2xl space-y-6">

        {/* Header */}
        <div>
          <a href="/dashboard" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Back to dashboard
          </a>
          <h1 className="text-2xl font-semibold text-gray-900 mt-2">New engagement</h1>
          <p className="text-sm text-gray-500 mt-1">
            Paste the incoming RFP or quote request email. The app will extract the sender's address for you.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3">
          {['paste', 'confirm'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-2 text-xs font-medium ${
                step === s || (step === 'creating' && s === 'confirm')
                  ? 'text-blue-600'
                  : step === 'confirm' && s === 'paste'
                    ? 'text-green-600'
                    : 'text-gray-400'
              }`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  step === s || (step === 'creating' && s === 'confirm')
                    ? 'bg-blue-600 text-white'
                    : step === 'confirm' && s === 'paste'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                }`}>
                  {step === 'confirm' && s === 'paste' ? '✓' : i + 1}
                </span>
                {s === 'paste' ? 'Paste email' : 'Confirm sender'}
              </div>
              {i < 1 && <div className="flex-1 h-px bg-gray-200" />}
            </React.Fragment>
          ))}
        </div>

        {/* ── STEP 1: Paste ── */}
        {step === 'paste' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Paste the incoming email
              </label>
              <p className="text-xs text-gray-500">
                Paste the full raw email text — headers included. We'll find the sender's address.
              </p>
              <textarea
                value={pastedEmail}
                onChange={e => setPastedEmail(e.target.value)}
                placeholder={`From: Dr. Sarah Chen <s.chen@biotech-corp.com>\nTo: info@yourcro.com\nSubject: Preclinical study enquiry\n\nHello,\n\nWe are looking for a CRO to run...`}
                rows={14}
                autoFocus
                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-xs text-red-600">⚠ {error}</p>}
            <div className="flex justify-end">
              <button
                onClick={handleExtract}
                disabled={!pastedEmail.trim() || extracting}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
              >
                {extracting ? 'Extracting…' : 'Extract sender →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Confirm ── */}
        {(step === 'confirm' || step === 'creating') && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5 shadow-sm">

            {/* Extraction result */}
            {extracted ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-3">
                <span className="text-green-600 text-sm mt-0.5">✓</span>
                <div>
                  <p className="text-sm font-medium text-green-800">Sender extracted</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Found <span className="font-mono">{extracted}</span> in the pasted email.
                    Confirm below or edit if incorrect.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                <span className="text-amber-600 text-sm mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-medium text-amber-800">Couldn't find sender automatically</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Enter the sender's email address manually below.
                  </p>
                </div>
              </div>
            )}

            {/* Editable confirmed email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Sender email address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={confirmed}
                onChange={e => setConfirmed(e.target.value)}
                placeholder="s.chen@biotech-corp.com"
                autoFocus={!extracted}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500">
                This will be the counterparty for all future messages in this engagement.
                {extracted && confirmed !== extracted && (
                  <span className="ml-1 text-amber-600 font-medium">
                    (edited from extracted value)
                  </span>
                )}
              </p>
            </div>

            {/* Optional sender name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Sender name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={counterpartyName}
                onChange={e => setCounterpartyName(e.target.value)}
                placeholder="e.g. Dr. Sarah Chen — Biotech Corp"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-xs text-red-600">⚠ {error}</p>}

            <div className="flex gap-3 justify-between">
              <button
                onClick={() => { setStep('paste'); setError(''); }}
                disabled={step === 'creating'}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                onClick={handleCreate}
                disabled={!confirmed.trim() || !confirmed.includes('@') || step === 'creating'}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
              >
                {step === 'creating' ? 'Creating…' : 'Confirm & create engagement →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
