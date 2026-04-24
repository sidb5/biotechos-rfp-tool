import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'
import { getBiotechPlan, getBiotechUsage } from '@shared/lib/get-biotech-plan'
import { PLAN_NAMES, FEATURES } from '@shared/lib/feature-flags'
import BillingClient from '@shared/components/BillingClient'

export default async function BiotechBillingPage({
  searchParams,
}: {
  searchParams: { success?: string }
}) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const plan  = await getBiotechPlan(user.id)
  const usage = await getBiotechUsage(user.id)

  const { data: sub } = await supabase
    .from('biotech_subscriptions')
    .select('status, current_period_end, cancel_at_period_end, stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const proposalLimit = FEATURES.proposals_per_month[plan]
  const showSuccess = searchParams.success === '1'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-8">
          <nav className="mb-1.5 text-xs text-gray-500">
            <a href="/biotech/settings" className="hover:text-gray-700 transition-colors">Settings</a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-700">Billing</span>
          </nav>
          <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your subscription and payment details.</p>
        </header>

        <BillingClient
          plan={plan}
          planName={PLAN_NAMES[plan]}
          status={sub?.status ?? 'active'}
          periodEnd={sub?.current_period_end ?? null}
          cancelAtPeriodEnd={sub?.cancel_at_period_end ?? false}
          hasStripeCustomer={!!sub?.stripe_customer_id}
          proposalsUsed={usage.briefs_created}
          proposalLimit={proposalLimit === Infinity ? null : proposalLimit}
          showSuccess={showSuccess}
          checkoutPath="/api/biotech/billing/create-checkout"
          portalPath="/api/biotech/billing/create-portal"
          usageLabel="Briefs this month"
          pricingHref="/biotech/pricing"
        />
      </div>
    </div>
  )
}
