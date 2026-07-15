CREATE TABLE feedback_messages (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('content', 'bug', 'suggestion', 'cooperation', 'other')),
  message TEXT NOT NULL,
  contact_email TEXT,
  page_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'archived')),
  consent_version TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_feedback_status_date ON feedback_messages(status, submitted_at DESC);

PRAGMA user_version = 7;
