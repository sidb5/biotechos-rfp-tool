'use client'

import { useState } from 'react'
import UpgradeModal from './UpgradeModal'
import type { Plan, FeatureKey } from '@shared/lib/feature-flags'
import { canAccess, requiredPlan } from '@shared/lib/feature-flags'

interface Props {
  feature: FeatureKey
  plan: Plan
  /** Display name shown in the upgrade prompt */
  featureLabel?: string
  children?: React.ReactNode
  /** If true, renders a locked overlay instead of hiding the children */
  overlay?: boolean
}

/**
 * Wraps any UI element. If the user's plan doesn't include the feature,
 * shows an upgrade prompt instead of the real content.
 */
export default function FeatureGate({
  feature,
  plan,
  featureLabel,
  children,
  overlay = false,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const allowed = !!canAccess(feature, plan)
  const needed = requiredPlan(feature)
  const label = featureLabel ?? feature.replace(/_/g, ' ')

  if (allowed) return children ? <>{children}</> : null

  if (overlay) {
    return (
      <>
        <div className="relative">
          <div className="opacity-30 pointer-events-none select-none">
            {children}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={() => setModalOpen(true)}
              className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl shadow-md text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Upgrade to unlock
            </button>
          </div>
        </div>
        {modalOpen && (
          <UpgradeModal
            feature={label}
            requiredPlan={needed}
            onClose={() => setModalOpen(false)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-400 hover:bg-gray-50 transition-colors cursor-pointer"
        title={`Upgrade to ${needed} to unlock ${label}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        {label} — upgrade to unlock
      </button>
      {modalOpen && (
        <UpgradeModal
          feature={label}
          requiredPlan={needed}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
