-- Add is_complete column to cro_profiles
alter table cro_profiles
  add column if not exists is_complete boolean default false;
