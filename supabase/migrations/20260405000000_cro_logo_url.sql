-- Add logo_url column to cro_profiles
alter table cro_profiles
  add column if not exists logo_url text;
