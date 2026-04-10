import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'

export const runtime = 'nodejs'

const PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  pro:     process.env.STRIPE_PRO_PRICE_ID,
}

// POST /api/billing/create-checkout
// Body: { plan: 'starter' | 'pro', annual?: boolean }
export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_REPLACE_ME') {
    return NextResponse.json(
      { error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to your environment.' },
      { status: 503 }
    )
  }

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name')
    .eq('user_id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await request.json()
  const plan = body.plan as 'starter' | 'pro'
  const priceId = PRICE_IDS[plan]

  if (!priceId || priceId === 'price_REPLACE_ME') {
    return NextResponse.json({ error: `Price ID for ${plan} not configured` }, { status: 503 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' })

  // Get or create Stripe customer
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('cro_profile_id', profile.id)
    .single()

  let customerId = sub?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: profile.company_name,
      metadata: { cro_profile_id: profile.id },
    })
    customerId = customer.id
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/settings/billing?success=1`,
    cancel_url:  `${appUrl}/pricing`,
    metadata: { cro_profile_id: profile.id },
    subscription_data: {
      metadata: { cro_profile_id: profile.id },
    },
  })

  return NextResponse.json({ url: session.url })
}
