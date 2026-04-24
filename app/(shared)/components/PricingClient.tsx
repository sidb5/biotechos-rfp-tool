'use client'

import { useState } from 'react'
import type { Plan } from '@shared/lib/feature-flags'
import { useTenant } from '@shared/components/TenantProvider'

interface Props {
  currentPlan: Plan
  croCount?: number
}

const FEATURES_ROWS = [
  { label: 'Proposals per month',     free: '3',          starter: '15',          pro: 'Unlimited' },
  { label: 'Client request uploads',  free: '1/month',    starter: 'Unlimited',   pro: 'Unlimited' },
  { label: 'Quick Quote builder',      free: '✓',          starter: '✓',           pro: '✓' },
  { label: 'Shareable quote links',    free: '✓',          starter: '✓',           pro: '✓' },
  { label: 'PDF export',              free: '—',          starter: '✓',           pro: '✓' },
  { label: 'Word export',             free: '—',          starter: '✓',           pro: '✓' },
  { label: 'Content library',         free: '—',          starter: '✓',           pro: '✓' },
  { label: 'Win/loss analytics',      free: '—',          starter: '✓',           pro: '✓' },
  { label: 'Bid/no-bid recommendation', free: '—',        starter: '✓',           pro: '✓' },
  { label: 'Email notifications',     free: '—',          starter: '✓',           pro: '✓' },
  { label: 'Pricing benchmarks',      free: '—',          starter: '✓',           pro: '✓' },
  { label: 'Team members',            free: '1',          starter: '2',           pro: 'Unlimited' },
  { label: 'RFP aggregator feed',     free: '—',          starter: '—',           pro: '✓' },
  { label: 'Email monitoring',        free: '—',          starter: '—',           pro: '✓' },
  { label: 'Priority support',        free: '—',          starter: '—',           pro: '✓' },
  { label: 'Proposal watermark',      free: 'Yes',        starter: 'No',          pro: 'No' },
]

export default function PricingClient({ currentPlan, croCount }: Props) {
  const [annual, setAnnual] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const tenant = useTenant()

  async function handleUpgrade(plan: 'starter' | 'pro') {
    setLoading(plan)
    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, annual }),
      })
      const json = await res.json()
      if (json.url) {
        window.location.href = json.url
      } else {
        alert(json.error ?? 'Something went wrong')
      }
    } catch {
      alert('Could not connect to billing. Please try again.')
    }
    setLoading(null)
  }

  const plans = [
    {
      key: 'free' as Plan,
      name: 'Free',
      price: '$0',
      period: 'forever',
      description: 'Try it out — no card required.',
      cta: currentPlan === 'free' ? 'Current plan' : 'Downgrade',
      ctaDisabled: currentPlan === 'free',
      highlight: false,
    },
    {
      key: 'starter' as Plan,
      name: 'Starter',
      price: annual ? '$79' : '$99',
      period: annual ? '/mo billed annually' : '/month',
      description: 'For solo CRO founders responding to 15+ requests a month.',
      cta: currentPlan === 'starter' ? 'Current plan' : currentPlan === 'pro' ? 'Downgrade' : 'Upgrade to Starter',
      ctaDisabled: currentPlan === 'starter',
      highlight: true,
    },
    {
      key: 'pro' as Plan,
      name: 'Pro',
      price: annual ? '$199' : '$249',
      period: annual ? '/mo billed annually' : '/month',
      description: 'For growing CROs with a team and high volume.',
      cta: currentPlan === 'pro' ? 'Current plan' : 'Upgrade to Pro',
      ctaDisabled: currentPlan === 'pro',
      highlight: false,
    },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Simple, transparent pricing</h1>
        <p className="text-gray-500 text-sm">Cancel anytime. No hidden fees.</p>
        {croCount && croCount > 0 && (
          <p className="text-sm text-green-700 font-medium mt-2 mb-6 flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" />
            </svg>
            Join {croCount}+ CROs already using {tenant.platformName}
          </p>
        )}
        {!croCount && <div className="mb-6" />}

        {/* Annual toggle */}
        <div className="inline-flex items-center gap-3 bg-gray-100 rounded-full px-4 py-2">
          <span className={`text-sm font-medium ${!annual ? 'text-gray-900' : 'text-gray-400'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(a => !a)}
            className={`relative w-10 h-5 rounded-full transition-colors ${annual ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${annual ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className={`text-sm font-medium ${annual ? 'text-gray-900' : 'text-gray-400'}`}>
            Annual <span className="text-green-600 font-semibold">save 20%</span>
          </span>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {plans.map(plan => (
          <div
            key={plan.key}
            className={`bg-white rounded-2xl p-6 flex flex-col gap-4 ${
              plan.highlight
                ? 'border-2 border-green-500 shadow-lg relative'
                : 'border border-gray-200'
            }`}
          >
            {plan.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                  Most popular
                </span>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-gray-900">{plan.name}</h2>
                {currentPlan === plan.key && (
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-semibold rounded-full">
                    Current
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {plan.price}
                <span className="text-sm font-normal text-gray-400 ml-1">{plan.period}</span>
              </p>
              <p className="text-xs text-gray-500 mt-2">{plan.description}</p>
            </div>

            <button
              onClick={() => {
                if (plan.key !== 'free' && !plan.ctaDisabled) {
                  handleUpgrade(plan.key as 'starter' | 'pro')
                }
              }}
              disabled={plan.ctaDisabled || loading === plan.key}
              className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${
                plan.ctaDisabled
                  ? 'bg-gray-100 text-gray-400 cursor-default'
                  : plan.highlight
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-900 hover:bg-gray-800 text-white'
              }`}
            >
              {loading === plan.key ? 'Redirecting…' : plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Feature comparison table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-4 text-gray-500 font-medium">Feature</th>
              {['Free', 'Starter', 'Pro'].map(p => (
                <th key={p} className="px-4 py-4 text-center text-gray-900 font-semibold">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES_ROWS.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'bg-gray-50/50' : ''}>
                <td className="px-5 py-3 text-gray-700">{row.label}</td>
                {[row.free, row.starter, row.pro].map((val, j) => (
                  <td key={j} className="px-4 py-3 text-center">
                    <span className={
                      val === '✓' ? 'text-green-600 font-semibold' :
                      val === '—' ? 'text-gray-300' :
                      val === 'Yes' ? 'text-amber-500 text-xs' :
                      val === 'No' ? 'text-gray-400 text-xs' :
                      'text-gray-700 text-xs font-medium'
                    }>
                      {val}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Cancel anytime from your billing settings. Questions?{' '}
        <a href="mailto:support@croproposalengine.com" className="underline underline-offset-2">
          Contact support
        </a>
      </p>
    </div>
  )
}
