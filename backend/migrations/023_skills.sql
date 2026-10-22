CREATE TABLE skills_catalog (id INTEGER PRIMARY KEY, document TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE skills_provider (id INTEGER PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE skills_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
PRAGMA user_version = 23;
