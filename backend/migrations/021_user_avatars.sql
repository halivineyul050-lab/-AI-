CREATE TABLE IF NOT EXISTS user_avatars (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  image_bytes BLOB NOT NULL CHECK (length(image_bytes) BETWEEN 1 AND 2097152)
);
PRAGMA user_version = 21;
