import { createSupabaseServerClient } from './supabase-server'
import type { Plan } from './feature-flags'

/**
 * Returns the active plan for a biotech user.
 * Falls back to 'free' if no subscription record exists or it is cancelled.
 */
export async function getBiotechPlan(userId: string): Promise<Plan> {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('biotech_subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .single()

  if (!data) return 'free'
  if (data.status === 'cancelled') return 'free'
  return data.plan as Plan
}

/**
 * Returns the current month's usage for a biotech user.
 */
export async function getBiotechUsage(userId: string) {
  const supabase = createSupabaseServerClient()
  const month = new Date().toISOString().slice(0, 7) // YYYY-MM
  const { data } = await supabase
    .from('biotech_usage_tracking')
    .select('briefs_created, rfps_sent')
    .eq('user_id', userId)
    .eq('month', month)
    .single()
  return {
    briefs_created: data?.briefs_created ?? 0,
    rfps_sent: data?.rfps_sent ?? 0,
  }
}
