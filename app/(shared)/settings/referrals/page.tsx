import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import AppShell from '@shared/components/AppShell'
import ReferralsClient from '@shared/components/ReferralsClient'

function generateReferralCode(companyName: string): string {
  const prefix = companyName
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X')
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `${prefix}-${suffix}`
}

export default async function ReferralsPage() {
  const supabase = createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get the CRO profile (with referral + verification columns)
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name, referral_code, is_verified')
    .eq('user_id', user.id)
    .single()

  // Auto-generate referral code for existing users who don't have one yet
  let referralCode = profile?.referral_code ?? null
  if (profile?.id && !referralCode && profile.company_name) {
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const newCode = generateReferralCode(profile.company_name)
    await service
      .from('cro_profiles')
      .update({ referral_code: newCode })
      .eq('id', profile.id)
    referralCode = newCode
  }

  let referrals: Record<string, unknown>[] = []
  let totalReferrals = 0
  let completedReferrals = 0
  let freeMonthsEarned = 0

  if (profile?.id) {
    // Fetch referrals where this user is the referrer
    const { data: refs } = await supabase
      .from('referrals')
      .select('id, status, referee_email, created_at, reward_applied_at')
      .eq('referrer_id', profile.id)
      .order('created_at', { ascending: false })

    referrals = refs ?? []
    totalReferrals = referrals.length
    completedReferrals = referrals.filter(r => ['completed', 'rewarded'].includes(r.status as string)).length

    // Count reward months earned
    const { data: rewards } = await supabase
      .from('referral_rewards')
      .select('months_granted')
      .eq('cro_profile_id', profile.id)

    freeMonthsEarned = (rewards ?? []).reduce((sum, r) => sum + ((r.months_granted as number) ?? 0), 0)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cro-rfp-tool.vercel.app'

  return (
    <AppShell
      title="Referrals"
      backHref="/dashboard"
      backLabel="Dashboard"
    >
      <div className="px-5 py-6">
        {!profile && (
          <div className="max-w-2xl mx-auto text-center py-12">
            <p className="text-sm text-gray-500 mb-4">Complete your profile first to get your referral code.</p>
            <a
              href="/profile"
              className="px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
            >
              Set up your profile →
            </a>
          </div>
        )}
        {profile && (
          <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400">Loading…</div>}>
            <ReferralsClient
              referralCode={referralCode}
              isVerified={profile.is_verified ?? false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              referrals={referrals as any}
              totalReferrals={totalReferrals}
              completedReferrals={completedReferrals}
              freeMonthsEarned={freeMonthsEarned}
              appUrl={appUrl}
            />
          </Suspense>
        )}
      </div>
    </AppShell>
  )
}
