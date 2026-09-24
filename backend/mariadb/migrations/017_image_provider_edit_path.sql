ALTER TABLE image_providers
  ADD COLUMN IF NOT EXISTS edit_path VARCHAR(1024) NOT NULL DEFAULT '/v1/images/edits';
