export type Plan = 'free' | 'starter' | 'pro'

export const FEATURES = {
  proposals_per_month: {
    free: 3, starter: 15, pro: Infinity,
  },
  rfps_per_month: {
    free: 1, starter: Infinity, pro: Infinity,
  },
  content_library: {
    free: false, starter: true, pro: true,
  },
  pdf_export: {
    free: false, starter: true, pro: true,
  },
  word_export: {
    free: false, starter: true, pro: true,
  },
  analytics: {
    free: false, starter: true, pro: true,
  },
  bid_recommendation: {
    free: false, starter: true, pro: true,
  },
  email_notifications: {
    free: false, starter: true, pro: true,
  },
  team_members_max: {
    free: 1, starter: 2, pro: Infinity,
  },
  pricing_benchmarks: {
    free: false, starter: true, pro: true,
  },
  rfp_aggregator: {
    free: false, starter: false, pro: true,
  },
  email_monitoring: {
    free: false, starter: false, pro: true,
  },
  watermark: {
    free: true, starter: false, pro: false,
  },
} as const

export type FeatureKey = keyof typeof FEATURES

export function canAccess(feature: FeatureKey, plan: Plan): boolean | number {
  return FEATURES[feature][plan]
}

/** Which plan first unlocks a feature */
export function requiredPlan(feature: FeatureKey): 'starter' | 'pro' {
  if (FEATURES[feature]['starter']) return 'starter'
  return 'pro'
}

export const PLAN_NAMES: Record<Plan, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
}

export const PLAN_PRICES: Record<Plan, { monthly: number; annual: number }> = {
  free:    { monthly: 0,   annual: 0 },
  starter: { monthly: 99,  annual: 79 },
  pro:     { monthly: 249, annual: 199 },
}
