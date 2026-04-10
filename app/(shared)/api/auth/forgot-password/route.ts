import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Triggers Supabase's password reset flow. Supabase sends the email;
 * the reset link points to /api/auth/confirm?type=recovery which
 * then redirects to /auth/reset-password.
 *
 * Always returns success (don't reveal whether email exists).
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url)

  let email: string
  try {
    const body = await request.json()
    email = (body.email as string ?? '').trim().toLowerCase()
    if (!email) throw new Error('missing email')
  } catch {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()

  // Point Supabase reset link at our confirm route so we can intercept
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/api/auth/confirm?type=recovery`,
  })

  // Always respond with success — never reveal if email exists
  return NextResponse.json({ ok: true })
}
