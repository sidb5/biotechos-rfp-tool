-- Add modality columns to cros_directory
-- small_molecule: CRO has experience with small molecule compounds
-- biologic: CRO has experience with biologics (antibodies, proteins, gene therapy, etc.)

ALTER TABLE cros_directory
  ADD COLUMN IF NOT EXISTS small_molecule boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS biologic boolean DEFAULT false;

-- Index for quick filtering
CREATE INDEX IF NOT EXISTS idx_cros_directory_small_molecule ON cros_directory (small_molecule);
CREATE INDEX IF NOT EXISTS idx_cros_directory_biologic ON cros_directory (biologic);
