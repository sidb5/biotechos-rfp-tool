import { createSupabaseServerClient } from './supabase-server'
import type { Plan } from './feature-flags'

/**
 * Returns the active plan for a CRO profile.
 * Falls back to 'free' if no subscription record exists or it is cancelled.
 * Uses the service role client so it works in webhook and API contexts.
 */
export async function getPlan(croProfileId: string): Promise<Plan> {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('cro_profile_id', croProfileId)
    .single()

  if (!data) return 'free'
  if (data.status === 'cancelled') return 'free'
  return data.plan as Plan
}

/**
 * Returns the current month's usage for a CRO profile.
 */
export async function getUsage(croProfileId: string) {
  const supabase = createSupabaseServerClient()
  const month = new Date().toISOString().slice(0, 7) // YYYY-MM
  const { data } = await supabase
    .from('usage_tracking')
    .select('proposals_created, rfps_uploaded')
    .eq('cro_profile_id', croProfileId)
    .eq('month', month)
    .single()
  return {
    proposals_created: data?.proposals_created ?? 0,
    rfps_uploaded: data?.rfps_uploaded ?? 0,
  }
}

/**
 * Increments a usage counter for the current month.
 * Creates the row if it doesn't exist.
 */
export async function incrementUsage(
  croProfileId: string,
  field: 'proposals_created' | 'rfps_uploaded'
) {
  const supabase = createSupabaseServerClient()
  const month = new Date().toISOString().slice(0, 7)

  // Upsert + increment via RPC is cleanest but we'll do it in two steps
  // to avoid needing a custom function
  const { data: existing } = await supabase
    .from('usage_tracking')
    .select('id, proposals_created, rfps_uploaded')
    .eq('cro_profile_id', croProfileId)
    .eq('month', month)
    .single()

  if (existing) {
    await supabase
      .from('usage_tracking')
      .update({
        [field]: (existing[field] ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('usage_tracking')
      .insert({
        cro_profile_id: croProfileId,
        month,
        [field]: 1,
      })
  }
}
