CREATE TABLE IF NOT EXISTS news_sync_config (id INTEGER PRIMARY KEY, document TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS news_sync_sources (id TEXT PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS news_sync_items (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, identity_key TEXT NOT NULL UNIQUE, url_key TEXT NOT NULL, article_id TEXT, published_at TEXT, status TEXT NOT NULL, document TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_news_sync_items_url ON news_sync_items(url_key);
CREATE INDEX IF NOT EXISTS idx_news_sync_items_status ON news_sync_items(status);
CREATE TABLE IF NOT EXISTS news_sync_runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, document TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_news_sync_items_article ON news_sync_items(article_id);
PRAGMA user_version = 24;
