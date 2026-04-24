import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'

export const runtime = 'nodejs'

const PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  pro:     process.env.STRIPE_PRO_PRICE_ID,
}

// POST /api/biotech/billing/create-checkout
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

  // Look up company name from biotech_user_settings (best-effort)
  const { data: settings } = await supabase
    .from('biotech_user_settings')
    .select('company_name')
    .eq('user_id', user.id)
    .maybeSingle()

  const body = await request.json()
  const plan = body.plan as 'starter' | 'pro'
  const priceId = PRICE_IDS[plan]

  if (!priceId || priceId === 'price_REPLACE_ME') {
    return NextResponse.json({ error: `Price ID for ${plan} not configured` }, { status: 503 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' })

  // Get or create Stripe customer
  const { data: sub } = await supabase
    .from('biotech_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let customerId = sub?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name:  settings?.company_name ?? user.email ?? undefined,
      metadata: { biotech_user_id: user.id },
    })
    customerId = customer.id
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/biotech/settings/billing?success=1`,
    cancel_url:  `${appUrl}/biotech/pricing`,
    metadata: { biotech_user_id: user.id },
    subscription_data: {
      metadata: { biotech_user_id: user.id },
    },
  })

  return NextResponse.json({ url: session.url })
}
