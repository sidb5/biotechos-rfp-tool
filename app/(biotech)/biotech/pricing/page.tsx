import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'
import { getBiotechPlan } from '@shared/lib/get-biotech-plan'
import PricingClient from '@shared/components/PricingClient'

export default async function BiotechPricingPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const plan = await getBiotechPlan(user.id)

  return (
    <PricingClient
      currentPlan={plan}
      checkoutPath="/api/biotech/billing/create-checkout"
    />
  )
}
