-- cro_user_settings: per-user CRO preferences (capture mode, etc.)
-- Mirrors biotech_user_settings for the CRO persona.
-- New users default to 'assisted'. Existing CRO users grandfather into 'native'.

create table if not exists cro_user_settings (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null unique references auth.users on delete cascade,
  capture_mode text        not null default 'assisted'
                           check (capture_mode in ('assisted', 'native')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- RLS: users can only see and update their own row
alter table cro_user_settings enable row level security;

create policy "cro_user_settings_select_own"
  on cro_user_settings for select
  using (auth.uid() = user_id);

create policy "cro_user_settings_insert_own"
  on cro_user_settings for insert
  with check (auth.uid() = user_id);

create policy "cro_user_settings_update_own"
  on cro_user_settings for update
  using (auth.uid() = user_id);

-- Grandfather existing cro_profiles users into native mode
insert into cro_user_settings (user_id, capture_mode)
select user_id, 'native'
from cro_profiles
on conflict (user_id) do nothing;
