-- Add quote fields to cro_engagements for the quote-track workflow.
-- These are populated when the biotech logs a formal quote from a CRO,
-- as an alternative to the full RFP path.

alter table cro_engagements
  add column if not exists quoted_amount      numeric(14, 2),
  add column if not exists quoted_currency    text    default 'USD',
  add column if not exists quoted_timeline    text,
  add column if not exists quote_valid_until  date,
  add column if not exists quote_notes        text;

-- quote_received is a valid stage value alongside rfp_sent.
-- No enum constraint exists on stage (it is a plain text column), so no alter needed.
