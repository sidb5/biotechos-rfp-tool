-- Notifications table for in-app draft-ready alerts (Tasks 11 + 12).
-- One row per notification. RLS: user can only see their own rows.

CREATE TABLE IF NOT EXISTS notifications (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  engagement_id uuid        REFERENCES cro_engagements (id) ON DELETE CASCADE,
  draft_id      uuid,                      -- engagement_messages.id of the AI draft
  type          text        NOT NULL DEFAULT 'draft_ready',
  title         text        NOT NULL,      -- e.g. "Response from Biotech Corp"
  body_text     text,                      -- subtitle shown in notification list
  read          boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own notifications
CREATE POLICY "notifications_user_select" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_user_update" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role inserts (no RLS bypass needed — anon/user can't insert)
-- Service role bypasses RLS automatically, so no INSERT policy needed for service key usage.

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications (user_id, read, created_at DESC)
  WHERE read = false;
