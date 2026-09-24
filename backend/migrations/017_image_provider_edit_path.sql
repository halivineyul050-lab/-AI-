ALTER TABLE image_providers
  ADD COLUMN edit_path TEXT NOT NULL DEFAULT '/v1/images/edits';

PRAGMA user_version = 17;
