import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@shared/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@shared/lib/email'
import crypto from 'crypto'

export const runtime = 'nodejs'

// Common free / personal email providers to block
const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.fr', 'yahoo.de',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de',
  'outlook.com', 'outlook.co.uk', 'live.com', 'live.co.uk', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'mail.com', 'email.com', 'usa.com', 'myself.com', 'consultant.com',
  'zoho.com', 'zohomail.com',
  'yandex.com', 'yandex.ru',
  'gmx.com', 'gmx.de', 'gmx.net',
  'tutanota.com', 'tutanota.de', 'tuta.io',
  'fastmail.com', 'hushmail.com',
  'inbox.com', 'shortmail.com',
  'rediffmail.com', 'in.com',
  'qq.com', '163.com', '126.com', 'sina.com',
])

/**
 * POST /api/verify/domain
 * Body: { email: string }   ← full work email address, e.g. john@yourlab.com
 *
 * 1. Extracts the domain from the email
 * 2. Rejects free/personal email providers
 * 3. Generates a secure token, stores it on the profile with 24h expiry
 * 4. Sends a verification email to that address with a confirmation link
 * 5. Returns { sent: true, email } — verification is NOT instant
 *
 * When the user clicks the link, /api/verify/confirm marks them verified.
 */
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let email: string
  try {
    const body = await request.json()
    email = (body.email as string ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) throw new Error('missing email')
  } catch {
    return NextResponse.json(
      { valid: false, reason: 'Please enter your full work email address (e.g. you@yourlab.com).' },
      { status: 400 }
    )
  }

  const domain = email.split('@')[1]

  // Block free providers
  if (FREE_PROVIDERS.has(domain)) {
    return NextResponse.json({
      valid: false,
      reason: 'Please use your company work email, not a personal email provider like Gmail or Outlook.',
    })
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({
      valid: false,
      reason: 'That doesn\'t look like a valid email address.',
    })
  }

  // Get profile
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({
      valid: false,
      reason: 'Please complete your profile before verifying.',
    }, { status: 400 })
  }

  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  // Store token on profile
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  await service
    .from('cro_profiles')
    .update({
      pending_verification_email: email,
      verification_token: token,
      verification_token_expires_at: expiresAt.toISOString(),
    })
    .eq('id', profile.id)

  // Send verification email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cro-rfp-tool.vercel.app'
  const confirmUrl = `${appUrl}/api/verify/confirm?token=${token}`

  await sendEmail({
    to: email,
    subject: 'Confirm your work email — Proposal Engine',
    templateName: 'domain_verification',
    userId: user.id,
    html: buildVerificationEmail(profile.company_name, confirmUrl, email),
  })

  return NextResponse.json({ sent: true, email })
}

function buildVerificationEmail(companyName: string, confirmUrl: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#16a34a;padding:20px 32px;">
          <p style="margin:0;color:#ffffff;font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">Proposal Engine</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Confirm your work email</h1>
          <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
            Hi${companyName ? ` from ${companyName}` : ''},
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
            Click the button below to confirm that <strong>${email}</strong> is your work email.
            This verifies your business on Proposal Engine and unlocks the referral programme.
          </p>
          <table cellpadding="0" cellspacing="0">
            <tr><td style="border-radius:8px;background:#16a34a;">
              <a href="${confirmUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">
                Confirm my work email →
              </a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
            This link expires in 24 hours. If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Sent to ${email} · <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cro-rfp-tool.vercel.app'}/settings/notifications" style="color:#9ca3af;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
