CREATE TABLE IF NOT EXISTS article_source_links (
  source_url_hash TEXT PRIMARY KEY CHECK (length(source_url_hash) = 64),
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  feed_url TEXT NOT NULL DEFAULT '',
  source_title TEXT NOT NULL DEFAULT '',
  source_published_at TEXT,
  discovered_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_article_source_links_article ON article_source_links(article_id);
CREATE INDEX IF NOT EXISTS idx_article_source_links_published ON article_source_links(source_published_at);
CREATE INDEX IF NOT EXISTS idx_article_source_links_discovered ON article_source_links(discovered_at);

PRAGMA user_version = 18;
