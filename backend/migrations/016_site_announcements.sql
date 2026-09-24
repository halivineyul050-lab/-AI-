CREATE TABLE site_announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  available_at TEXT NOT NULL,
  button_label TEXT NOT NULL DEFAULT '',
  button_url TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 1000000),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_site_announcements_public ON site_announcements(enabled, available_at DESC);

PRAGMA user_version = 16;
