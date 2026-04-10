'use client'

import { useEffect } from 'react'

interface Props {
  feature: string
  requiredPlan: 'starter' | 'pro'
  onClose: () => void
}

const PLAN_DETAILS = {
  starter: { name: 'Starter', price: '$99/mo', colour: 'blue' },
  pro:     { name: 'Pro',     price: '$249/mo', colour: 'purple' },
}

export default function UpgradeModal({ feature, requiredPlan, onClose }: Props) {
  const plan = PLAN_DETAILS[requiredPlan]

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-2">
          Upgrade to unlock {feature}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {feature} is available on the{' '}
          <span className="font-semibold text-gray-700">{plan.name}</span> plan
          ({plan.price}) and above.
        </p>

        <div className="flex flex-col gap-3">
          <a
            href="/pricing"
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors"
          >
            See all plans →
          </a>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
