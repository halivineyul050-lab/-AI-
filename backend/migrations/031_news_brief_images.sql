CREATE TABLE IF NOT EXISTS news_cover_images (id TEXT PRIMARY KEY, mime_type TEXT NOT NULL, image_bytes BLOB NOT NULL);
PRAGMA user_version = 31;
