-- Trigger to prevent capture_mode from being changed after engagement creation.
-- The app has no API route that changes it, but this adds a DB-level guarantee.

CREATE OR REPLACE FUNCTION prevent_capture_mode_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.capture_mode <> OLD.capture_mode THEN
    RAISE EXCEPTION 'capture_mode is immutable after engagement creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_capture_mode_immutable ON cro_engagements;

CREATE TRIGGER enforce_capture_mode_immutable
  BEFORE UPDATE ON cro_engagements
  FOR EACH ROW EXECUTE FUNCTION prevent_capture_mode_change();
