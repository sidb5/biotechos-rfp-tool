-- ── Email verification token columns on cro_profiles ────────────────────────
-- Used for work-email-based domain verification (Task 28 fix).
-- User enters work email → we send a token link → they click → verified.

alter table cro_profiles
  add column if not exists pending_verification_email  text,
  add column if not exists verification_token          text,
  add column if not exists verification_token_expires_at timestamptz;
