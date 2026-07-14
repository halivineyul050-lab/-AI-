ALTER TABLE articles ADD COLUMN source_name TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN source_url TEXT NOT NULL DEFAULT '';

PRAGMA user_version = 3;
