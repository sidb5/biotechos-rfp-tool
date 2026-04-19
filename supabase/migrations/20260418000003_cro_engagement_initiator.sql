-- Add initiator column to distinguish who created the engagement.
-- 'biotech' = biotech user reached out to a CRO (existing flow).
-- 'cro'     = CRO user pasted an inbound RFP/quote-request to start tracking it.
-- Existing rows are biotech-initiated.

ALTER TABLE cro_engagements
  ADD COLUMN IF NOT EXISTS initiator text NOT NULL DEFAULT 'biotech';

ALTER TABLE cro_engagements
  ADD CONSTRAINT cro_engagements_initiator_check
  CHECK (initiator IN ('biotech', 'cro'));
