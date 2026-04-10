import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'
import { getPlan, getUsage } from '@shared/lib/get-plan'
import { canAccess, PLAN_NAMES, FEATURES } from '@shared/lib/feature-flags'
import AppShell from '@shared/components/AppShell'
import BillingClient from '@shared/components/BillingClient'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { success?: string }
}) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name')
    .eq('user_id', user.id)
    .single()

  if (!profile) redirect('/profile')

  const plan = await getPlan(profile.id)
  const usage = await getUsage(profile.id)

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, cancel_at_period_end, stripe_customer_id')
    .eq('cro_profile_id', profile.id)
    .single()

  const proposalLimit = FEATURES.proposals_per_month[plan]
  const showSuccess = searchParams.success === '1'

  return (
    <AppShell title="Billing">
      <BillingClient
        plan={plan}
        planName={PLAN_NAMES[plan]}
        status={sub?.status ?? 'active'}
        periodEnd={sub?.current_period_end ?? null}
        cancelAtPeriodEnd={sub?.cancel_at_period_end ?? false}
        hasStripeCustomer={!!sub?.stripe_customer_id}
        proposalsUsed={usage.proposals_created}
        proposalLimit={proposalLimit === Infinity ? null : proposalLimit}
        showSuccess={showSuccess}
      />
    </AppShell>
  )
}
