PRAGMA foreign_keys = OFF;

CREATE TABLE tools_v4 (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  official_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL REFERENCES categories(id),
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('unknown', 'free', 'freemium', 'trial', 'paid', 'contact')),
  language TEXT NOT NULL CHECK (language IN ('unknown', 'zh', 'multi')),
  login_requirement TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  content_updated_date TEXT NOT NULL,
  editor_score INTEGER NOT NULL DEFAULT 0 CHECK (editor_score BETWEEN 0 AND 100),
  popularity INTEGER NOT NULL DEFAULT 0 CHECK (popularity BETWEEN 0 AND 100),
  data_quality_status TEXT NOT NULL DEFAULT 'basic' CHECK (data_quality_status IN ('basic', 'enriched', 'verified')),
  first_published_at TEXT,
  last_verified_at TEXT,
  imported_at TEXT,
  is_sponsored INTEGER NOT NULL DEFAULT 0 CHECK (is_sponsored IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO tools_v4 (
  id, slug, name, domain, official_url, canonical_url, category_id,
  summary, description, pricing_type, language, login_requirement, region,
  content_updated_date, editor_score, popularity, data_quality_status,
  first_published_at, last_verified_at, is_sponsored, status, created_at, updated_at
)
SELECT
  id, slug, name, domain, official_url, official_url, category_id,
  summary, description, pricing_type, language, login_requirement, region,
  content_updated_date, editor_score, popularity, 'verified',
  created_at, content_updated_date, is_sponsored, status, created_at, updated_at
FROM tools;

DROP TABLE tools;
ALTER TABLE tools_v4 RENAME TO tools;

CREATE INDEX idx_tools_category ON tools(category_id, status);
CREATE INDEX idx_tools_popularity ON tools(popularity DESC, editor_score DESC);
CREATE INDEX idx_tools_updated ON tools(content_updated_date DESC);
CREATE INDEX idx_tools_canonical_url ON tools(canonical_url);
CREATE INDEX idx_tools_domain_name ON tools(domain, name COLLATE NOCASE);

INSERT OR IGNORE INTO categories (id, name, icon, sort_order) VALUES
  ('agent', 'AI 智能体', 'bot', 9),
  ('design', 'AI 设计', 'palette', 10),
  ('education', 'AI 学习', 'graduation-cap', 11),
  ('model', 'AI 模型', 'boxes', 12),
  ('detection', 'AI 检测', 'scan-search', 13),
  ('prompt', 'AI 提示词', 'braces', 14),
  ('business', 'AI 商业', 'briefcase', 15);

CREATE TABLE catalog_import_batches (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  source_file TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'dry_run')),
  discovered_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  manifest_hash TEXT NOT NULL DEFAULT '',
  report_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT
);

CREATE INDEX idx_import_batches_provider_date
  ON catalog_import_batches(provider, started_at DESC);

CREATE TABLE tool_sources (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_detail_url TEXT NOT NULL,
  source_listing_url TEXT NOT NULL DEFAULT '',
  source_category_key TEXT NOT NULL DEFAULT '',
  source_category_name TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  import_batch_id TEXT REFERENCES catalog_import_batches(id),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  UNIQUE(provider, source_key),
  UNIQUE(provider, source_detail_url)
);

CREATE INDEX idx_tool_sources_tool ON tool_sources(tool_id);
CREATE INDEX idx_tool_sources_batch ON tool_sources(import_batch_id);

PRAGMA foreign_keys = ON;
PRAGMA user_version = 4;
