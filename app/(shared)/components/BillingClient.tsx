'use client'

import { useState } from 'react'
import type { Plan } from '@shared/lib/feature-flags'
import { PLAN_NAMES } from '@shared/lib/feature-flags'

interface Props {
  plan: Plan
  planName: string
  status: string
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  hasStripeCustomer: boolean
  proposalsUsed: number
  proposalLimit: number | null
  showSuccess: boolean
  /** Override checkout API path (default: /api/billing/create-checkout) */
  checkoutPath?: string
  /** Override portal API path (default: /api/billing/create-portal) */
  portalPath?: string
  /** Label shown for the usage bar (default: 'Proposals this month') */
  usageLabel?: string
  /** Link for "View all plans" (default: /pricing) */
  pricingHref?: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function BillingClient({
  plan,
  planName,
  status,
  periodEnd,
  cancelAtPeriodEnd,
  hasStripeCustomer,
  proposalsUsed,
  proposalLimit,
  showSuccess,
  checkoutPath = '/api/billing/create-checkout',
  portalPath   = '/api/billing/create-portal',
  usageLabel   = 'Proposals this month',
  pricingHref  = '/pricing',
}: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  async function handleUpgrade(targetPlan: 'starter' | 'pro') {
    setLoading('upgrade-' + targetPlan)
    try {
      const res = await fetch(checkoutPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      })
      const json = await res.json()
      if (json.url) window.location.href = json.url
      else alert(json.error ?? 'Something went wrong')
    } catch {
      alert('Could not connect to billing. Please try again.')
    }
    setLoading(null)
  }

  async function handlePortal() {
    setLoading('portal')
    try {
      const res = await fetch(portalPath, { method: 'POST' })
      const json = await res.json()
      if (json.url) window.location.href = json.url
      else alert(json.error ?? 'Something went wrong')
    } catch {
      alert('Could not open billing portal.')
    }
    setLoading(null)
  }

  const usagePct = proposalLimit ? Math.min((proposalsUsed / proposalLimit) * 100, 100) : 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6">

      {/* Success banner */}
      {showSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <span className="text-green-600 text-lg">✓</span>
          <p className="text-sm font-medium text-green-800">
            Your plan has been upgraded. Features are now unlocked.
          </p>
        </div>
      )}

      {/* Current plan card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">Current plan</p>
            <p className="text-2xl font-bold text-gray-900">{planName}</p>
            {status === 'past_due' && (
              <p className="text-xs text-red-600 mt-1 font-medium">⚠ Payment past due — update your payment method to restore access</p>
            )}
            {cancelAtPeriodEnd && periodEnd && (
              <p className="text-xs text-amber-600 mt-1 font-medium">
                Cancels on {formatDate(periodEnd)} — you keep access until then
              </p>
            )}
            {!cancelAtPeriodEnd && periodEnd && plan !== 'free' && (
              <p className="text-xs text-gray-400 mt-1">Next billing date: {formatDate(periodEnd)}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            {plan === 'free' && (
              <>
                <button
                  onClick={() => handleUpgrade('starter')}
                  disabled={loading === 'upgrade-starter'}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading === 'upgrade-starter' ? 'Redirecting…' : 'Upgrade to Starter →'}
                </button>
                <button
                  onClick={() => handleUpgrade('pro')}
                  disabled={loading === 'upgrade-pro'}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading === 'upgrade-pro' ? 'Redirecting…' : 'Upgrade to Pro →'}
                </button>
              </>
            )}
            {plan === 'starter' && (
              <button
                onClick={() => handleUpgrade('pro')}
                disabled={loading === 'upgrade-pro'}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {loading === 'upgrade-pro' ? 'Redirecting…' : 'Upgrade to Pro →'}
              </button>
            )}
          </div>
        </div>

        {/* Usage bar */}
        {proposalLimit !== null && (
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>{usageLabel}</span>
              <span className="font-semibold text-gray-700">{proposalsUsed} / {proposalLimit}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${usagePct >= 90 ? 'bg-red-400' : usagePct >= 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {usagePct >= 90 && (
              <p className="text-xs text-red-600 mt-1.5 font-medium">
                Almost at your limit — upgrade to keep responding to requests.
              </p>
            )}
          </div>
        )}
        {proposalLimit === null && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500">
              {usageLabel}: <span className="font-semibold text-gray-700">{proposalsUsed}</span>{' '}
              <span className="text-gray-400">(unlimited)</span>
            </p>
          </div>
        )}
      </div>

      {/* Manage billing */}
      {hasStripeCustomer && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Manage billing</h2>
          <div className="flex flex-col gap-3">
            <button
              onClick={handlePortal}
              disabled={loading === 'portal'}
              className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <span>Payment method &amp; invoices</span>
              <span className="text-gray-400">→</span>
            </button>

            {plan !== 'free' && !cancelAtPeriodEnd && (
              <div>
                {showCancelConfirm ? (
                  <div className="border border-red-200 bg-red-50 rounded-xl p-4">
                    <p className="text-sm font-semibold text-red-800 mb-1">Before you go</p>
                    <p className="text-xs text-red-700 mb-3">
                      You&apos;ll lose access to PDF/Word exports, analytics, content library,
                      and bid recommendations. Your data is kept for 90 days.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handlePortal}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        Yes, cancel subscription
                      </button>
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        className="px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-white transition-colors"
                      >
                        Keep my plan
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors underline underline-offset-2"
                  >
                    Cancel subscription
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* View all plans */}
      <a
        href={pricingHref}
        className="text-center text-sm text-green-600 hover:text-green-700 font-medium underline underline-offset-2"
      >
        View all plans →
      </a>
    </div>
  )
}
