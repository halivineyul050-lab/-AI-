ALTER TABLE categories ADD COLUMN cms_managed_at TEXT;
ALTER TABLE categories ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tools ADD COLUMN cms_managed_at TEXT;
ALTER TABLE tools ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE articles ADD COLUMN cms_managed_at TEXT;
ALTER TABLE articles ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE collections ADD COLUMN cms_managed_at TEXT;
ALTER TABLE collections ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE content_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO content_state (id, revision) VALUES (1, 1);

CREATE INDEX idx_categories_cms_status ON categories(status, sort_order);
CREATE INDEX idx_articles_cms_status ON articles(status, published_date DESC);
CREATE INDEX idx_collections_cms_status ON collections(status, sort_order);

PRAGMA user_version = 6;
