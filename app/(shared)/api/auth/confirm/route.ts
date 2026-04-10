import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'
import { sendEmail } from '@shared/lib/email'
import { welcomeTemplate } from '@shared/lib/email-templates'

/**
 * GET /api/auth/confirm?code=xxx[&next=/dashboard]
 *
 * Handles email confirmation links sent by Supabase (PKCE flow).
 * This replaces /auth/callback as the emailRedirectTo destination so we can:
 *  1. Exchange the auth code for a session
 *  2. Detect new signups and send a branded welcome email via Resend
 *  3. Redirect to an appropriate page
 *
 * Also handles token_hash flow (older Supabase or custom template links):
 * GET /api/auth/confirm?token_hash=xxx&type=signup|recovery|email_change
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') ?? 'signup'
  const next = searchParams.get('next') ?? '/dashboard'

  const supabase = createSupabaseServerClient()

  // ── PKCE flow (code) ────────────────────────────────────────────────────────
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.session) {
      const msg = error?.message ?? 'Could not verify your link'
      return NextResponse.redirect(
        `${origin}/auth/error?message=${encodeURIComponent(msg)}&type=${type}`
      )
    }

    // Send welcome email for brand-new confirmed accounts
    const user = data.session.user
    const isNewUser = isRecentlyCreated(user.created_at)
    if (isNewUser && type !== 'recovery') {
      const firstName = extractFirstName(user.email)
      const { subject, html } = welcomeTemplate({ firstName })
      sendEmail({
        to: user.email!,
        subject,
        html,
        templateName: 'welcome',
        userId: user.id,
      }).catch(console.error)
    }

    // Recovery → send to reset-password page
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/auth/reset-password`)
    }

    return NextResponse.redirect(`${origin}${next}`)
  }

  // ── Token hash flow ─────────────────────────────────────────────────────────
  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'recovery' | 'email_change' | 'magiclink',
    })

    if (error || !data.session) {
      const msg = error?.message ?? 'Could not verify your link'
      return NextResponse.redirect(
        `${origin}/auth/error?message=${encodeURIComponent(msg)}&type=${type}`
      )
    }

    const user = data.session.user
    if (type === 'signup') {
      const firstName = extractFirstName(user.email)
      const { subject, html } = welcomeTemplate({ firstName })
      sendEmail({
        to: user.email!,
        subject,
        html,
        templateName: 'welcome',
        userId: user.id,
      }).catch(console.error)
      return NextResponse.redirect(`${origin}${next}`)
    }

    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/auth/reset-password`)
    }

    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(
    `${origin}/auth/error?message=${encodeURIComponent('Missing confirmation code. Please check your link and try again.')}`
  )
}

/** True if account was created in the last 10 minutes (new signup) */
function isRecentlyCreated(createdAt?: string): boolean {
  if (!createdAt) return false
  return Date.now() - new Date(createdAt).getTime() < 10 * 60 * 1000
}

/** Extract first name from email prefix for personalisation */
function extractFirstName(email?: string | null): string | undefined {
  if (!email) return undefined
  const prefix = email.split('@')[0]
  // Handle dot/underscore separated names: john.smith → John
  const first = prefix.split(/[._+-]/)[0]
  if (!first || first.length < 2) return undefined
  return first.charAt(0).toUpperCase() + first.slice(1)
}
