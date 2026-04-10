import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/verify/confirm?token=<hex>
 *
 * Called when user clicks the verification link in their email.
 * Looks up the token in cro_profiles, marks the profile as verified,
 * generates a referral code if needed, then redirects to
 * /settings/referrals?verified=1
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cro-rfp-tool.vercel.app'

  if (!token) {
    return NextResponse.redirect(`${appUrl}/settings/referrals?verify_error=missing_token`)
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find the profile with this token
  const { data: profile } = await service
    .from('cro_profiles')
    .select('id, company_name, referral_code, pending_verification_email, verification_token_expires_at')
    .eq('verification_token', token)
    .single()

  if (!profile) {
    return NextResponse.redirect(`${appUrl}/settings/referrals?verify_error=invalid_token`)
  }

  // Check expiry
  if (!profile.verification_token_expires_at || new Date(profile.verification_token_expires_at) < new Date()) {
    return NextResponse.redirect(`${appUrl}/settings/referrals?verify_error=expired_token`)
  }

  const email = profile.pending_verification_email as string | null
  const domain = email ? email.split('@')[1] : null

  const updates: Record<string, unknown> = {
    is_verified: true,
    verified_domain: domain,
    verification_method: 'domain',
    verified_at: new Date().toISOString(),
    // Clear the token
    verification_token: null,
    verification_token_expires_at: null,
    pending_verification_email: null,
  }

  // Generate referral code if not already set
  if (!profile.referral_code) {
    updates.referral_code = generateReferralCode(profile.company_name as string)
  }

  await service
    .from('cro_profiles')
    .update(updates)
    .eq('id', profile.id)

  return NextResponse.redirect(`${appUrl}/settings/referrals?verified=1`)
}

function generateReferralCode(companyName: string): string {
  const prefix = (companyName ?? '')
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
