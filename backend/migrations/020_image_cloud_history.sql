CREATE TABLE IF NOT EXISTS image_cloud_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model_name TEXT NOT NULL,
  ratio TEXT NOT NULL,
  style TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_length INTEGER NOT NULL CHECK (byte_length BETWEEN 1 AND 10485760),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_image_cloud_history_user_created
  ON image_cloud_history(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS image_cloud_history_chunks (
  image_id TEXT NOT NULL REFERENCES image_cloud_history(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  image_bytes BLOB NOT NULL,
  PRIMARY KEY (image_id, chunk_index)
);

PRAGMA user_version = 20;
