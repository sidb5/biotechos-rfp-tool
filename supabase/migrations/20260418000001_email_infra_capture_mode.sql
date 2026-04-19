-- email_infra: capture_mode on user settings and engagements
--
-- New users default to 'assisted'. Existing users grandfather into 'native'
-- (preserves current behavior). Engagement capture_mode is snapshotted at
-- creation time and never changes.

-- ── biotech_user_settings ─────────────────────────────────────────────────────

alter table biotech_user_settings
  add column if not exists capture_mode text not null default 'assisted';

-- Grandfather existing rows into native mode
update biotech_user_settings
  set capture_mode = 'native'
  where capture_mode = 'assisted';  -- only rows that existed before this migration

-- ── cro_engagements ───────────────────────────────────────────────────────────

alter table cro_engagements
  add column if not exists capture_mode    text not null default 'native',
  add column if not exists reply_to_address text;

-- Existing engagements stay native (already set by default above)

-- Add a check constraint so only valid values are accepted
alter table cro_engagements
  drop constraint if exists cro_engagements_capture_mode_check;

alter table cro_engagements
  add constraint cro_engagements_capture_mode_check
  check (capture_mode in ('assisted', 'native'));

alter table biotech_user_settings
  drop constraint if exists biotech_user_settings_capture_mode_check;

alter table biotech_user_settings
  add constraint biotech_user_settings_capture_mode_check
  check (capture_mode in ('assisted', 'native'));
