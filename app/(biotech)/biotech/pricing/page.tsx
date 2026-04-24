import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'
import { getBiotechPlan } from '@shared/lib/get-biotech-plan'
import BiotechPricingClient from '@shared/components/BiotechPricingClient'

export default async function BiotechPricingPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const plan = await getBiotechPlan(user.id)

  return <BiotechPricingClient currentPlan={plan} />
}
