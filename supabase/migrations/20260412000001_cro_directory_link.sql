-- Add cros_directory_id FK to cro_profiles
-- Allows linking a CRO user's profile to the curated CRO directory entry
-- Nullable: most CRO users won't have a directory match at signup

ALTER TABLE cro_profiles
  ADD COLUMN IF NOT EXISTS cros_directory_id uuid REFERENCES cros_directory(id);
