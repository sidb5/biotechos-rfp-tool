-- Add quote_data column to proposals for Quick Quote builder state
-- Also adds share_token and share fields for QQ7

alter table proposals
  add column if not exists quote_data jsonb,
  add column if not exists share_token text unique default encode(gen_random_bytes(8), 'hex'),
  add column if not exists share_enabled boolean default false,
  add column if not exists share_views integer default 0,
  add column if not exists share_first_viewed_at timestamptz,
  add column if not exists share_last_viewed_at timestamptz;
