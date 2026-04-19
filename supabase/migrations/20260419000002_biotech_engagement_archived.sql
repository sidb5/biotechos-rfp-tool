-- Add archived flag to cro_engagements so users can soft-delete engagements
-- they are no longer pursuing without losing the history.

ALTER TABLE cro_engagements
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Index for fast filtering on the engagements list
CREATE INDEX IF NOT EXISTS cro_engagements_archived_idx
  ON cro_engagements (user_id, archived, updated_at DESC)
  WHERE archived = false;
