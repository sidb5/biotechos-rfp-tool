'use client'

import { useState } from 'react'

interface Props {
  onVerified: () => void
  onSkip: () => void
}

type Method = 'email' | 'ein'
type EmailState = 'idle' | 'sent'

export default function VerifyBusiness({ onVerified, onSkip }: Props) {
  const [method, setMethod] = useState<Method>('email')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailState, setEmailState] = useState<EmailState>('idle')
  const [sentTo, setSentTo] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (method === 'email') {
      // Send verification email
      const res = await fetch('/api/verify/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      const data = await res.json()

      if (!data.sent) {
        setError(data.reason ?? 'Could not send verification email. Please try again.')
        setLoading(false)
        return
      }

      setSentTo(data.email)
      setEmailState('sent')
      setLoading(false)
      return
    }

    // EIN — immediate validation
    const res = await fetch('/api/verify/ein', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ein: value }),
    })
    const data = await res.json()

    if (!data.valid) {
      setError(data.reason ?? 'Verification failed. Please try again.')
      setLoading(false)
      return
    }

    onVerified()
  }

  // ── Email sent — check inbox state ──────────────────────────────────────────
  if (emailState === 'sent') {
    return (
      <div className="w-full max-w-sm">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Check your inbox</h2>
        <p className="text-sm text-gray-600 mb-1">
          We sent a verification link to:
        </p>
        <p className="text-sm font-semibold text-gray-900 mb-4">{sentTo}</p>
        <p className="text-sm text-gray-500 mb-5">
          Click the link in that email to confirm your work email address and unlock your referral code.
          The link expires in 24 hours.
        </p>
        <button
          type="button"
          onClick={() => { setEmailState('idle'); setValue(''); setSentTo('') }}
          className="text-sm text-green-600 hover:text-green-700 font-medium"
        >
          ← Use a different email
        </button>
      </div>
    )
  }

  // ── Main form ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-sm">
      {/* Header */}
      <div className="mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Verify your business</h2>
        <p className="text-sm text-gray-500 mt-1">
          Verification unlocks the referral programme so you can earn free months.
        </p>
      </div>

      {/* Method toggle */}
      <div className="flex rounded-lg border border-gray-200 p-1 mb-5">
        <button
          type="button"
          onClick={() => { setMethod('email'); setValue(''); setError('') }}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            method === 'email'
              ? 'bg-green-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Work email
        </button>
        <button
          type="button"
          onClick={() => { setMethod('ein'); setValue(''); setError('') }}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            method === 'ein'
              ? 'bg-green-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          EIN number
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {method === 'email' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Work email address
            </label>
            <input
              type="email"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="you@yourlab.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Must be your company email — not Gmail, Yahoo, Hotmail or other personal providers.
              We&apos;ll send a confirmation link to prove you own it.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              US Employer Identification Number (EIN)
            </label>
            <input
              type="text"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="12-3456789"
              maxLength={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Format: XX-XXXXXXX. Verified instantly — no email confirmation needed.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? (method === 'email' ? 'Sending verification email…' : 'Verifying…')
            : (method === 'email' ? 'Send verification email' : 'Verify EIN')}
        </button>
      </form>

      <button
        type="button"
        onClick={onSkip}
        className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        Skip for now
      </button>
    </div>
  )
}
