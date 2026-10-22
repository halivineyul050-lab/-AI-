CREATE TABLE creator_page (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
PRAGMA user_version = 22;
