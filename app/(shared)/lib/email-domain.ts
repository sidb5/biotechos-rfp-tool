// email-domain.ts — corporate email domain gate (Task 13)
//
// Rules:
//   1. Reject free consumer email providers and disposable providers.
//   2. In non-production environments ONLY, a comma-separated dev allowlist
//      of exact email addresses can bypass the check.
//   3. In production (NODE_ENV === 'production'), the allowlist is ignored
//      entirely — no bypass, regardless of what the env var says.
//
// Client usage:  reads NEXT_PUBLIC_DEV_EMAIL_ALLOWLIST (baked in at build time)
// Server usage:  reads DEV_EMAIL_ALLOWLIST (preferred) or NEXT_PUBLIC_DEV_EMAIL_ALLOWLIST

export const BLOCK_MESSAGE =
  'Please use your work email. Free providers like Gmail are not supported.';

// ── Blocked domains ───────────────────────────────────────────────────────────

const FREE_DOMAINS = new Set([
  // Google
  'gmail.com', 'googlemail.com', 'google.com',
  // Yahoo
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.fr', 'yahoo.de',
  'yahoo.es', 'yahoo.it', 'ymail.com', 'rocketmail.com',
  // Microsoft consumer
  'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de',
  'hotmail.it', 'hotmail.es', 'live.com', 'live.co.uk', 'msn.com',
  'passport.com', 'windowslive.com',
  // Apple
  'icloud.com', 'me.com', 'mac.com',
  // AOL
  'aol.com', 'aim.com',
  // ProtonMail
  'protonmail.com', 'protonmail.ch', 'pm.me', 'proton.me',
  // Tutanota
  'tutanota.com', 'tuta.io', 'tutamail.com', 'tuta.com',
  // Zoho (consumer)
  'zoho.com', 'zohomail.com',
  // Other free
  'mail.com', 'email.com', 'gmx.com', 'gmx.net', 'gmx.de',
  'web.de', 'freenet.de', 'libero.it', 'virgilio.it',
  // Disposable / temporary
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info',
  'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net',
  'guerrillamail.org', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'maildrop.cc', 'dispostable.com',
  '10minutemail.com', 'trashmail.com', 'fakeinbox.com',
  'spamgourmet.com', 'spamfree.eu', 'mailnull.com',
  'filzmail.com', 'trashmail.me', 'trashmail.at',
  'mailnesia.com', 'maildrop.cc', 'discard.email',
]);

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Returns true if the domain of the given email is in the blocked-provider list.
 * Call this before isDevAllowlisted — blocking takes logical precedence,
 * but allowlist is the bypass so check allowlist first in practice.
 */
export function isBlockedDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return false;
  return FREE_DOMAINS.has(domain);
}

/**
 * Returns true if the exact email address is in the dev allowlist AND
 * we are NOT running in production mode.
 * In production (NODE_ENV === 'production'), always returns false.
 */
export function isDevAllowlisted(email: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;

  // Server-side prefers the non-public var; client-side gets the NEXT_PUBLIC_ one
  const rawList: string =
    process.env.DEV_EMAIL_ALLOWLIST ??
    process.env.NEXT_PUBLIC_DEV_EMAIL_ALLOWLIST ??
    '';

  if (!rawList.trim()) return false;

  const allowed = rawList
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Full gate check. Returns { ok: true } if the email is allowed through,
 * or { ok: false, message: string } if it should be blocked.
 */
export function checkCorporateEmail(email: string): { ok: boolean; message?: string } {
  if (!email.trim()) return { ok: false, message: BLOCK_MESSAGE };

  // Dev allowlist bypasses the block check
  if (isDevAllowlisted(email)) return { ok: true };

  if (isBlockedDomain(email)) return { ok: false, message: BLOCK_MESSAGE };

  return { ok: true };
}
