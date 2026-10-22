CREATE TABLE assistant_provider (id INTEGER PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE assistant_usage (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, active_until INTEGER NOT NULL DEFAULT 0, request_id TEXT NOT NULL DEFAULT '', PRIMARY KEY (user_id, day));
PRAGMA user_version = 25;
