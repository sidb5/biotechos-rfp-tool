-- Add enquiry_template column to rfp_internal_briefs.
-- Stores the last-generated outreach email template so it can be reused
-- without calling Claude again on subsequent visits.
-- Structure: { subject, body, generated_at, brief_hash }

ALTER TABLE rfp_internal_briefs
  ADD COLUMN IF NOT EXISTS enquiry_template jsonb;

COMMENT ON COLUMN rfp_internal_briefs.enquiry_template IS
  'Cached outreach template: { subject, body, generated_at, brief_hash }. Avoids redundant AI calls on revisit.';
