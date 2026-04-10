import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'

/**
 * POST /api/verify/ein
 * Body: { ein: string }
 * Returns: { valid: boolean, reason?: string }
 *
 * Validates EIN format: XX-XXXXXXX (9 digits total, hyphen after 2nd digit).
 * If valid, updates current user's cro_profile with:
 *   ein, verification_method='ein', is_verified=true, verified_at=now
 * Also generates referral_code if not already set.
 *
 * Note: v1 is format-only. Full IRS API verification is Phase 2.
 */
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let ein: string
  try {
    const body = await request.json()
    ein = (body.ein as string ?? '').trim()
    if (!ein) throw new Error('missing ein')
  } catch {
    return NextResponse.json({ valid: false, reason: 'Please enter your EIN.' }, { status: 400 })
  }

  // Normalise: remove spaces, dashes for digit check
  const digitsOnly = ein.replace(/\D/g, '')
  if (digitsOnly.length !== 9) {
    return NextResponse.json({ valid: false, reason: 'EIN must be exactly 9 digits (format: 12-3456789).' })
  }

  // Standard format: XX-XXXXXXX
  const formatted = `${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2)}`

  // First two digits must be a valid EIN prefix (01–99, but a few are reserved)
  const prefix = parseInt(digitsOnly.slice(0, 2), 10)
  if (prefix === 0) {
    return NextResponse.json({ valid: false, reason: 'Invalid EIN prefix.' })
  }

  // Update profile
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name, referral_code')
    .eq('user_id', user.id)
    .single()

  if (profile) {
    const updates: Record<string, unknown> = {
      ein: formatted,
      verification_method: 'ein',
      is_verified: true,
      verified_at: new Date().toISOString(),
    }

    if (!profile.referral_code) {
      updates.referral_code = generateReferralCode(profile.company_name)
    }

    await supabase
      .from('cro_profiles')
      .update(updates)
      .eq('id', profile.id)
  }

  return NextResponse.json({ valid: true, ein: formatted })
}

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
