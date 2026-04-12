-- Task 3.3: Add ai_metadata jsonb column to engagement_messages.
-- Stores the gap analysis output and resolved item tracking for AI-drafted followups.
-- Structure: { gap_analysis: { confirmed, unaddressed, concerns }, resolved_items: string[] }

ALTER TABLE engagement_messages
  ADD COLUMN IF NOT EXISTS ai_metadata jsonb;

COMMENT ON COLUMN engagement_messages.ai_metadata IS
  'AI analysis metadata for followup messages: gap_analysis + resolved_items tracking.';
