'use client'

import { useState, useEffect } from 'react'

const DISMISS_KEY = 'referral_banner_dismissed'

interface Props {
  referralCode: string | null
  appUrl: string
}

export default function ReferralBanner({ referralCode, appUrl }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show if not dismissed before
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (!dismissed) setVisible(true)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  const shareLink = referralCode ? `${appUrl}/signup?ref=${referralCode}` : `${appUrl}/settings/referrals`

  function copyLink() {
    navigator.clipboard.writeText(shareLink)
  }

  return (
    <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl px-4 py-3 shadow-sm">
      {/* Top row: icon + text + dismiss */}
      <div className="flex items-start gap-3">
        {/* Gift icon — hidden on mobile to save space */}
        <div className="hidden sm:flex shrink-0 w-9 h-9 bg-white/20 rounded-lg items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">
            🎁 Refer a colleague — you both get 1 month free
          </p>
          <p className="text-xs text-green-100 mt-0.5 leading-relaxed">
            Share your link. When they sign up and verify their business, free months unlock for both of you.
          </p>
        </div>

        {/* Dismiss — always top-right */}
        <button
          onClick={dismiss}
          className="shrink-0 p-1 text-white/60 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Action buttons — below text on all sizes */}
      <div className="flex items-center gap-2 mt-3">
        {referralCode && (
          <button
            onClick={copyLink}
            className="px-3 py-1.5 bg-white text-green-700 text-xs font-semibold rounded-lg hover:bg-green-50 transition-colors whitespace-nowrap"
          >
            Copy link
          </button>
        )}
        <a
          href="/settings/referrals"
          className="px-3 py-1.5 bg-white/20 text-white text-xs font-semibold rounded-lg hover:bg-white/30 transition-colors whitespace-nowrap"
        >
          {referralCode ? 'See details →' : 'Get your code →'}
        </a>
      </div>
    </div>
  )
}
