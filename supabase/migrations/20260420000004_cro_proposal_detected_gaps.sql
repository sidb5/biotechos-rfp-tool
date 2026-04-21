-- Cache gap detection results on the proposal so the UI doesn't re-run Claude on every page load
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS detected_gaps jsonb;
