-- Add org_type to cro_profiles so each seller-side account records which
-- type of service org they are (CRO vs CDMO). Existing rows default to 'CRO'
-- (backward-compatible). Signup flow should write the tenant's orgType.

ALTER TABLE cro_profiles
  ADD COLUMN IF NOT EXISTS org_type text
    NOT NULL DEFAULT 'CRO'
    CHECK (org_type IN ('CRO', 'CDMO'));

COMMENT ON COLUMN cro_profiles.org_type IS
  'Derived from the tenant domain at signup time (CRO = crorfp.com, CDMO = cdmorfp.com)';
