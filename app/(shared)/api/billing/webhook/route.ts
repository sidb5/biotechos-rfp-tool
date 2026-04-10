import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// Stripe sends raw body — must disable Next.js body parsing
export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function upsertSubscription(
  supabase: ReturnType<typeof getServiceClient>,
  stripeSubscription: Stripe.Subscription
) {
  const croProfileId = stripeSubscription.metadata?.cro_profile_id
  if (!croProfileId) return

  const item = stripeSubscription.items.data[0]
  const priceId = item?.price.id

  let plan: 'free' | 'starter' | 'pro' = 'free'
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) plan = 'starter'
  else if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'pro'

  const status = stripeSubscription.status as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = stripeSubscription as any

  await supabase
    .from('subscriptions')
    .upsert({
      cro_profile_id:          croProfileId,
      stripe_customer_id:      stripeSubscription.customer as string,
      stripe_subscription_id:  stripeSubscription.id,
      plan,
      status,
      current_period_start:    sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
      current_period_end:      sub.current_period_end   ? new Date(sub.current_period_end   * 1000).toISOString() : null,
      cancel_at_period_end:    stripeSubscription.cancel_at_period_end,
      updated_at:              new Date().toISOString(),
    }, { onConflict: 'cro_profile_id' })
}

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_REPLACE_ME') {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' })
  const supabase = getServiceClient()

  const body = await request.text()
  const sig  = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        await upsertSubscription(supabase, sub)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const croProfileId = sub.metadata?.cro_profile_id
        if (croProfileId) {
          await supabase
            .from('subscriptions')
            .update({ plan: 'free', status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('cro_profile_id', croProfileId)
        }
        break
      }

      case 'invoice.payment_failed': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = event.data.object as any
        const subId = (invoice.subscription ?? invoice.parent?.subscription_details?.subscription) as string | null
        if (subId) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subId)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = event.data.object as any
        const subId = (invoice.subscription ?? invoice.parent?.subscription_details?.subscription) as string | null
        if (subId) {
          await supabase
            .from('subscriptions')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subId)
        }
        break
      }
    }
  } catch (err) {
    console.error('[webhook] handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
