CREATE TABLE IF NOT EXISTS model_profiles (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK (kind IN ('chat','image')),
 endpoint TEXT NOT NULL,
 model TEXT NOT NULL,
 encrypted_key TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

PRAGMA user_version = 42;
