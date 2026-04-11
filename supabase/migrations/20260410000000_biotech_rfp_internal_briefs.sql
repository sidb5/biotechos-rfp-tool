-- Migration: biotech_rfp_internal_briefs
-- Creates the private internal knowledge vault for biotech users.
-- This table is NEVER exposed to CROs. All AI outbound generation
-- must filter out sensitive fields before prompting.

create table rfp_internal_briefs (
  id               uuid        default gen_random_uuid() primary key,
  user_id          uuid        references auth.users(id) on delete cascade,
  title            text,
  raw_inputs       jsonb       default '{"text": "", "docs": [], "voice_transcript": ""}'::jsonb,
  extracted_data   jsonb,       -- 12-field structured object set in Task 1.2
  classification   text,        -- tox | pk | efficacy | in_vitro | combination | etc
  status           text        default 'active',   -- active | archived
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- RLS: each user sees only their own briefs
alter table rfp_internal_briefs enable row level security;

create policy "biotech_own_briefs"
  on rfp_internal_briefs
  for all
  using (auth.uid() = user_id);

-- Auto-update updated_at on any change
create or replace function update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rfp_internal_briefs_updated_at
  before update on rfp_internal_briefs
  for each row
  execute function update_updated_at_column();
