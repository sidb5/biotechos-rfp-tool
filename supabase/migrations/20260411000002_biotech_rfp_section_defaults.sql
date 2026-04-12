-- Task: Section templates — lets users save their own default text per RFP section.
-- Stored as jsonb on biotech_user_settings to avoid a new table.
-- Shape: { s1_header: "...", s2_overview: "...", ... } — only keys with content stored.

ALTER TABLE biotech_user_settings
  ADD COLUMN IF NOT EXISTS rfp_section_defaults jsonb DEFAULT '{}';

COMMENT ON COLUMN biotech_user_settings.rfp_section_defaults IS
  'User-saved default content per RFP section key. Used as starting point for new RFPs.';
