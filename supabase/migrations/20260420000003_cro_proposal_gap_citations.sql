-- Add gap_citations JSONB column to proposals.
-- Stores source attribution for any SME-confirmed values used in the draft.

alter table proposals add column if not exists gap_citations jsonb default '[]'::jsonb;
