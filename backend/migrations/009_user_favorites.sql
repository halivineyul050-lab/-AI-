CREATE TABLE user_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, tool_id)
);

CREATE INDEX idx_user_favorites_user ON user_favorites(user_id, created_at DESC);

PRAGMA user_version = 9;
