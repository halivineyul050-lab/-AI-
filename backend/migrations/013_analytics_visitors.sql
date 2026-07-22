CREATE TABLE IF NOT EXISTS analytics_visitors (
  visitor_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

INSERT OR IGNORE INTO analytics_visitors (visitor_id, first_seen_at, last_seen_at)
SELECT visitor_id, MIN(received_at), MAX(received_at)
FROM analytics_events
WHERE event_name = 'page_view' AND visitor_id <> ''
GROUP BY visitor_id;

CREATE INDEX IF NOT EXISTS idx_analytics_visitors_first_seen ON analytics_visitors(first_seen_at);

PRAGMA user_version = 13;
