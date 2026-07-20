ALTER TABLE feedback_messages RENAME TO feedback_messages_legacy;

CREATE TABLE feedback_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('content', 'bug', 'suggestion', 'cooperation', 'other')),
  message TEXT NOT NULL,
  contact_email TEXT,
  page_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'replied', 'archived')),
  consent_version TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO feedback_messages (
  id, category, message, contact_email, page_url, status, consent_version, submitted_at, updated_at
)
SELECT id, category, message, contact_email, page_url, status, consent_version, submitted_at, updated_at
FROM feedback_messages_legacy;

DROP TABLE feedback_messages_legacy;
CREATE INDEX idx_feedback_status_date ON feedback_messages(status, submitted_at DESC);
CREATE INDEX idx_feedback_user_date ON feedback_messages(user_id, submitted_at DESC);

ALTER TABLE tool_submissions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_submissions_user_date ON tool_submissions(user_id, submitted_at DESC);

ALTER TABLE newsletter_subscriptions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_newsletter_user ON newsletter_subscriptions(user_id, updated_at DESC);

CREATE TABLE user_tool_history (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, tool_id)
);

CREATE INDEX idx_user_history_user ON user_tool_history(user_id, viewed_at DESC);

CREATE TABLE user_notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_digest INTEGER NOT NULL DEFAULT 1 CHECK (weekly_digest IN (0, 1)),
  new_tool_alerts INTEGER NOT NULL DEFAULT 1 CHECK (new_tool_alerts IN (0, 1)),
  favorite_update_alerts INTEGER NOT NULL DEFAULT 1 CHECK (favorite_update_alerts IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE email_delivery_log (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES newsletter_subscriptions(id) ON DELETE CASCADE,
  digest_key TEXT NOT NULL,
  provider_message_id TEXT,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(subscription_id, digest_key)
);

CREATE INDEX idx_email_delivery_date ON email_delivery_log(sent_at DESC);

PRAGMA user_version = 12;
