import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getPlan } from '@shared/lib/get-plan'
import AppShell from '@shared/components/AppShell'
import PricingClient from '@shared/components/PricingClient'

export default async function PricingPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const currentPlan = profile ? await getPlan(profile.id) : 'free'

  // Social proof count (Mechanic C)
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { count } = await service
    .from('cro_profiles')
    .select('id', { count: 'exact', head: true })
  const croCount = Math.max(1, Math.floor((count ?? 1) / 10) * 10)

  return (
    <AppShell title="Pricing">
      <PricingClient currentPlan={currentPlan} croCount={croCount} />
    </AppShell>
  )
}
