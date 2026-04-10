import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'

/**
 * POST /api/referral/apply
 * Body: { referral_code: string }
 *
 * Called after a new user completes business verification.
 * 1. Finds the referrer by referral_code
 * 2. Creates a referral record
 * 3. Extends trial_ends_at by 30 days for both referee and referrer
 * 4. Marks referral as 'rewarded'
 * 5. Creates referral_rewards records for both parties
 */
export async function POST(request: Request) {
  // Auth check
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let referralCode: string
  try {
    const body = await request.json()
    referralCode = (body.referral_code as string ?? '').trim().toUpperCase()
    if (!referralCode) throw new Error('missing referral_code')
  } catch {
    return NextResponse.json({ error: 'referral_code is required' }, { status: 400 })
  }

  // Service client for bypassing RLS
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find referrer profile by referral_code
  const { data: referrerProfile } = await service
    .from('cro_profiles')
    .select('id, company_name, is_verified')
    .eq('referral_code', referralCode)
    .single()

  if (!referrerProfile) {
    return NextResponse.json({ error: 'Invalid referral code.' }, { status: 404 })
  }

  // Get referee profile (current user)
  const { data: refereeProfile } = await service
    .from('cro_profiles')
    .select('id, is_verified')
    .eq('user_id', user.id)
    .single()

  if (!refereeProfile) {
    return NextResponse.json({ error: 'Complete your profile before applying a referral.' }, { status: 400 })
  }

  if (!refereeProfile.is_verified) {
    return NextResponse.json({ error: 'Business verification required to use a referral code.' }, { status: 403 })
  }

  // Prevent self-referral
  if (referrerProfile.id === refereeProfile.id) {
    return NextResponse.json({ error: 'You cannot use your own referral code.' }, { status: 400 })
  }

  // Check if this referee has already used a referral code
  const { data: existingReferral } = await service
    .from('referrals')
    .select('id')
    .eq('referee_id', refereeProfile.id)
    .not('status', 'eq', 'expired')
    .maybeSingle()

  if (existingReferral) {
    return NextResponse.json({ error: 'You have already used a referral code.' }, { status: 409 })
  }

  const now = new Date()
  const rewardExpiry = new Date(now)
  rewardExpiry.setDate(rewardExpiry.getDate() + 365)

  // Create referral record
  const { data: referral, error: referralError } = await service
    .from('referrals')
    .insert({
      referrer_id: referrerProfile.id,
      referee_id: refereeProfile.id,
      referral_code: referralCode,
      status: 'rewarded',
      referee_email: user.email ?? null,
      completed_at: now.toISOString(),
      reward_applied_at: now.toISOString(),
    })
    .select('id')
    .single()

  if (referralError || !referral) {
    return NextResponse.json({ error: 'Failed to create referral record.' }, { status: 500 })
  }

  // Extend trial for referee (30 days from now)
  const trialEnd = new Date(now)
  trialEnd.setDate(trialEnd.getDate() + 30)
  await extendTrial(service, refereeProfile.id, trialEnd)

  // Extend trial for referrer (30 days from their current period end or now)
  await extendTrialByDays(service, referrerProfile.id, 30)

  // Create reward records
  await service.from('referral_rewards').insert([
    {
      cro_profile_id: refereeProfile.id,
      referral_id: referral.id,
      reward_type: 'free_month',
      months_granted: 1,
      expires_at: rewardExpiry.toISOString(),
    },
    {
      cro_profile_id: referrerProfile.id,
      referral_id: referral.id,
      reward_type: 'free_month',
      months_granted: 1,
      expires_at: rewardExpiry.toISOString(),
    },
  ])

  return NextResponse.json({
    success: true,
    referrer_company: referrerProfile.company_name,
    trial_days: 30,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extendTrial(
  service: SupabaseClient<any>,
  croProfileId: string,
  trialEnd: Date
) {
  const { data: sub } = await service
    .from('subscriptions')
    .select('id, trial_ends_at')
    .eq('cro_profile_id', croProfileId)
    .single()

  if (sub) {
    await service
      .from('subscriptions')
      .update({ trial_ends_at: trialEnd.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', sub.id)
  } else {
    // Create a free subscription with trial
    await service.from('subscriptions').insert({
      cro_profile_id: croProfileId,
      plan: 'free',
      status: 'trialing',
      trial_ends_at: trialEnd.toISOString(),
    })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extendTrialByDays(
  service: SupabaseClient<any>,
  croProfileId: string,
  days: number
) {
  const { data: sub } = await service
    .from('subscriptions')
    .select('id, trial_ends_at, current_period_end')
    .eq('cro_profile_id', croProfileId)
    .single()

  const baseDate = sub?.trial_ends_at
    ? new Date(sub.trial_ends_at)
    : sub?.current_period_end
      ? new Date(sub.current_period_end)
      : new Date()

  const newEnd = new Date(baseDate)
  newEnd.setDate(newEnd.getDate() + days)

  if (sub) {
    await service
      .from('subscriptions')
      .update({ trial_ends_at: newEnd.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', sub.id)
  } else {
    await service.from('subscriptions').insert({
      cro_profile_id: croProfileId,
      plan: 'free',
      status: 'trialing',
      trial_ends_at: newEnd.toISOString(),
    })
  }
}
