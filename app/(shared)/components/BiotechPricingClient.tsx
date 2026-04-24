'use client'

import { useState } from 'react'
import type { Plan } from '@shared/lib/feature-flags'
import { useTenant } from '@shared/components/TenantProvider'

interface Props {
  currentPlan: Plan
}

const FEATURES_ROWS = [
  { label: 'Study briefs per month',        free: '1',           starter: '10',          pro: 'Unlimited' },
  { label: 'CROs contacted per brief',      free: '3',           starter: '10',          pro: 'Unlimited' },
  { label: 'AI-drafted outreach emails',    free: '✓',           starter: '✓',           pro: '✓' },
  { label: 'Engagement tracking',           free: '✓',           starter: '✓',           pro: '✓' },
  { label: 'AI follow-up drafts',           free: '✓',           starter: '✓',           pro: '✓' },
  { label: 'RFP builder',                   free: '—',           starter: '✓',           pro: '✓' },
  { label: 'PDF RFP export',               free: '—',           starter: '✓',           pro: '✓' },
  { label: 'Response analytics',            free: '—',           starter: '✓',           pro: '✓' },
  { label: 'Email notifications',           free: '—',           starter: '✓',           pro: '✓' },
  { label: 'Team members',                  free: '1',           starter: '3',           pro: 'Unlimited' },
  { label: 'CRO shortlisting tools',        free: '—',           starter: '✓',           pro: '✓' },
  { label: 'Multi-brief comparison',        free: '—',           starter: '—',           pro: '✓' },
  { label: 'Priority support',              free: '—',           starter: '—',           pro: '✓' },
]

export default function BiotechPricingClient({ currentPlan }: Props) {
  const [annual, setAnnual] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const tenant = useTenant()

  async function handleUpgrade(plan: 'starter' | 'pro') {
    setLoading(plan)
    try {
      const res = await fetch('/api/biotech/billing/create-checkout', {
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
      description: 'Get started — no card required.',
      cta: currentPlan === 'free' ? 'Current plan' : 'Downgrade',
      ctaDisabled: currentPlan === 'free',
      highlight: false,
    },
    {
      key: 'starter' as Plan,
      name: 'Starter',
      price: annual ? '$79' : '$99',
      period: annual ? '/mo billed annually' : '/month',
      description: `For growing ${tenant.orgLabelPlural} running multiple studies at once.`,
      cta: currentPlan === 'starter' ? 'Current plan' : currentPlan === 'pro' ? 'Downgrade' : 'Upgrade to Starter',
      ctaDisabled: currentPlan === 'starter',
      highlight: true,
    },
    {
      key: 'pro' as Plan,
      name: 'Pro',
      price: annual ? '$199' : '$249',
      period: annual ? '/mo billed annually' : '/month',
      description: `For teams managing high-volume ${tenant.counterpartyLabel} sourcing.`,
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
        <div className="mb-6" />

        {/* Annual toggle */}
        <div className="inline-flex items-center gap-3 bg-gray-100 rounded-full px-4 py-2">
          <span className={`text-sm font-medium ${!annual ? 'text-gray-900' : 'text-gray-400'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(a => !a)}
            className={`relative w-10 h-5 rounded-full transition-colors ${annual ? 'bg-blue-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${annual ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className={`text-sm font-medium ${annual ? 'text-gray-900' : 'text-gray-400'}`}>
            Annual <span className="text-blue-600 font-semibold">save 20%</span>
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
                ? 'border-2 border-blue-500 shadow-lg relative'
                : 'border border-gray-200'
            }`}
          >
            {plan.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 bg-blue-500 text-white text-xs font-bold rounded-full">
                  Most popular
                </span>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-gray-900">{plan.name}</h2>
                {currentPlan === plan.key && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
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
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
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
                      val === '✓' ? 'text-blue-600 font-semibold' :
                      val === '—' ? 'text-gray-300' :
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
        <a href="mailto:support@sourcemycro.com" className="underline underline-offset-2">
          Contact support
        </a>
      </p>
    </div>
  )
}
