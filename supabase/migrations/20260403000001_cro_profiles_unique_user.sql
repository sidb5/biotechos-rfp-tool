-- Add unique constraint on user_id so the profile API can upsert correctly.
-- One CRO profile per user account.
alter table cro_profiles
  add constraint cro_profiles_user_id_key unique (user_id);
