-- Add email identity fields to cro_profiles for outbound quote/proposal emails.
-- Mirrors biotech_user_settings pattern: sender_display_name + sender_email.

ALTER TABLE cro_profiles
  ADD COLUMN IF NOT EXISTS sender_display_name text,
  ADD COLUMN IF NOT EXISTS sender_email text;

COMMENT ON COLUMN cro_profiles.sender_display_name IS
  'Shown in email From field — e.g. "Jane Smith via BiotechOS"';
COMMENT ON COLUMN cro_profiles.sender_email IS
  'Reply-To on all outbound quotes/proposals. Biotech replies go to this inbox.';
