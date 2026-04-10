'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import VerifyBusiness from './VerifyBusiness'

interface Referral {
  id: string
  status: string
  referee_email: string | null
  created_at: string
  reward_applied_at: string | null
  referee_profile?: { company_name: string } | null
}

interface Props {
  referralCode: string | null
  isVerified: boolean
  referrals: Referral[]
  totalReferrals: number
  completedReferrals: number
  freeMonthsEarned: number
  appUrl: string
}

export default function ReferralsClient({
  referralCode,
  isVerified: initialVerified,
  referrals,
  totalReferrals,
  completedReferrals,
  freeMonthsEarned,
  appUrl,
}: Props) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [isVerified, setIsVerified] = useState(initialVerified)
  const [showVerify, setShowVerify] = useState(false)
  const [verifyFlash, setVerifyFlash] = useState<'success' | 'error' | null>(null)
  const [verifyErrorMsg, setVerifyErrorMsg] = useState('')
  const searchParams = useSearchParams()

  useEffect(() => {
    const verified = searchParams.get('verified')
    const verifyError = searchParams.get('verify_error')
    if (verified === '1') {
      setIsVerified(true)
      setVerifyFlash('success')
    } else if (verifyError) {
      const msgs: Record<string, string> = {
        missing_token: 'Verification link is missing a token.',
        invalid_token: 'This verification link is invalid or has already been used.',
        expired_token: 'This verification link has expired. Please request a new one.',
      }
      setVerifyErrorMsg(msgs[verifyError] ?? 'Verification failed. Please try again.')
      setVerifyFlash('error')
    }
  }, [searchParams])

  const shareLink = referralCode ? `${appUrl}/signup?ref=${referralCode}` : ''

  function copy(text: string, type: 'code' | 'link') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function openEmailTemplate() {
    const subject = encodeURIComponent('You should try this — cuts proposal time from 30hrs to 3hrs')
    const body = encodeURIComponent(
      `Hi,\n\nI've been using Proposal Engine to respond to client requests and it's saved me a huge amount of time.\n\nYou get 1 month free when you sign up through my link:\n${shareLink}\n\nTake a look — it's worth it.\n\nBest,`
    )
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  function openLinkedIn() {
    const text = encodeURIComponent(
      `If you're a CRO responding to RFPs and client requests, check out Proposal Engine — it's cut our proposal time from 30+ hours to 3. Sign up with my referral link for 1 month free: ${shareLink}`
    )
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareLink)}&summary=${text}`, '_blank')
  }

  function handleVerified() {
    setIsVerified(true)
    setShowVerify(false)
  }

  const statusLabel: Record<string, { text: string; className: string }> = {
    pending:   { text: 'Pending',   className: 'bg-yellow-50 text-yellow-700' },
    completed: { text: 'Signed up', className: 'bg-blue-50 text-blue-700' },
    rewarded:  { text: 'Rewarded',  className: 'bg-green-50 text-green-700' },
    expired:   { text: 'Expired',   className: 'bg-gray-100 text-gray-500' },
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Flash messages from email confirmation */}
      {verifyFlash === 'success' && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <svg className="w-4 h-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span><strong>Business verified!</strong> You can now earn 1 free month for every colleague you refer who also verifies their business.</span>
        </div>
      )}
      {verifyFlash === 'error' && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{verifyErrorMsg}</span>
        </div>
      )}

      {/* Your referral code — shown to everyone */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1 uppercase tracking-widest">Your referral code</h2>
        <p className="text-sm text-gray-500 mb-4">
          Share this link with other CROs. When they sign up and verify their business
          (corporate email or EIN), you both get <strong>1 month free</strong> on any paid plan.
          You don&apos;t need to verify yourself to share — only your referee does.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 font-mono text-2xl font-bold tracking-widest text-gray-900 bg-gray-50 rounded-xl px-5 py-3 border border-gray-200 text-center">
            {referralCode ?? '—'}
          </div>
          {referralCode && (
            <button
              onClick={() => copy(referralCode, 'code')}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              {copied === 'code' ? '✓ Copied' : 'Copy code'}
            </button>
          )}
        </div>

        {/* Shareable link */}
        {shareLink && (
          <div className="flex items-center gap-2 mb-5">
            <input
              readOnly
              value={shareLink}
              className="flex-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 truncate focus:outline-none"
            />
            <button
              onClick={() => copy(shareLink, 'link')}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              {copied === 'link' ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        )}

        {/* Share shortcuts */}
        {shareLink && (
          <div className="flex gap-2">
            <button
              onClick={openEmailTemplate}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email template
            </button>
            <button
              onClick={openLinkedIn}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              Share on LinkedIn
            </button>
          </div>
        )}
      </section>

      {/* Verification panel — only shown if not verified */}
      {!isVerified && !showVerify && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 mb-1">Verify your business to earn rewards yourself</p>
              <p className="text-sm text-amber-800 mb-3">
                You can already share your referral link. But to receive your own free month when someone uses it,
                verify your business with a <strong>corporate email domain</strong> (e.g. yourlab.com) or
                your <strong>US EIN number</strong> (XX-XXXXXXX format).
              </p>
              <button
                onClick={() => setShowVerify(true)}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors"
              >
                Verify my business →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Inline VerifyBusiness form */}
      {!isVerified && showVerify && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <VerifyBusiness
            onVerified={handleVerified}
            onSkip={() => setShowVerify(false)}
          />
        </section>
      )}

      {/* Verified badge */}
      {isVerified && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span><strong>Business verified</strong> — you will receive 1 free month for each colleague who signs up and verifies their business.</span>
        </div>
      )}

      {/* Stats */}
      <section className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total referred', value: totalReferrals },
          { label: 'Completed signup', value: completedReferrals },
          { label: 'Free months earned', value: freeMonthsEarned },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="bg-green-50 border border-green-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-green-900 mb-3">How it works</h3>
        <ol className="text-sm text-green-800 space-y-2">
          <li className="flex gap-2"><span className="font-bold shrink-0">1.</span> Share your referral link with another CRO (anyone can share — no verification needed on your end)</li>
          <li className="flex gap-2"><span className="font-bold shrink-0">2.</span> They sign up and verify their business with a corporate email domain or EIN number</li>
          <li className="flex gap-2"><span className="font-bold shrink-0">3.</span> You both get 1 free month — but you need to be verified too to receive your reward</li>
        </ol>
      </section>

      {/* Referral history */}
      {referrals.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Referral history</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-widest border-b border-gray-100">
                <th className="text-left px-5 py-3 font-medium">Contact</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Date</th>
                <th className="text-left px-5 py-3 font-medium">Reward</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {referrals.map(r => {
                const s = statusLabel[r.status] ?? statusLabel.pending
                const company = (r.referee_profile as { company_name?: string } | null)?.company_name
                return (
                  <tr key={r.id} className="text-sm">
                    <td className="px-5 py-3 text-gray-700">
                      {company ?? r.referee_email ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
                        {s.text}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {r.reward_applied_at
                        ? new Date(r.reward_applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {referrals.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">
          No referrals yet. Share your link above to get started.
        </div>
      )}
    </div>
  )
}
