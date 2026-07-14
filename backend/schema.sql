PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  official_url TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('free', 'freemium', 'paid')),
  language TEXT NOT NULL CHECK (language IN ('zh', 'multi')),
  login_requirement TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  content_updated_date TEXT NOT NULL,
  editor_score INTEGER NOT NULL DEFAULT 0 CHECK (editor_score BETWEEN 0 AND 100),
  popularity INTEGER NOT NULL DEFAULT 0 CHECK (popularity BETWEEN 0 AND 100),
  is_sponsored INTEGER NOT NULL DEFAULT 0 CHECK (is_sponsored IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category_id, status);
CREATE INDEX IF NOT EXISTS idx_tools_popularity ON tools(popularity DESC, editor_score DESC);
CREATE INDEX IF NOT EXISTS idx_tools_updated ON tools(content_updated_date DESC);

CREATE TABLE IF NOT EXISTS tool_platforms (
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'desktop', 'mobile', 'api')),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tool_id, platform)
);

CREATE TABLE IF NOT EXISTS tool_features (
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tool_id, feature)
);

CREATE TABLE IF NOT EXISTS tool_use_cases (
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  use_case TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tool_id, use_case)
);

CREATE TABLE IF NOT EXISTS tool_badges (
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tool_id, badge)
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('tutorial', 'news')),
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  body_text TEXT NOT NULL DEFAULT '',
  published_date TEXT NOT NULL,
  read_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_kind_date ON articles(kind, published_date DESC);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  accent TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE TABLE IF NOT EXISTS collection_tools (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, tool_id)
);

CREATE TABLE IF NOT EXISTS tool_submissions (
  id TEXT PRIMARY KEY,
  tracking_code TEXT NOT NULL UNIQUE,
  idempotency_key TEXT UNIQUE,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  summary TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'duplicate')),
  source TEXT NOT NULL DEFAULT 'sidebar',
  review_note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_active_url
  ON tool_submissions(normalized_url)
  WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS idx_submissions_status_date ON tool_submissions(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'suppressed')),
  topic_slugs_json TEXT NOT NULL DEFAULT '[]',
  consent_version TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'news_sidebar',
  consent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unsubscribed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS analytics_events (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  page_type TEXT NOT NULL,
  path TEXT NOT NULL,
  properties_json TEXT NOT NULL DEFAULT '{}',
  client_time TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ip_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_name_time ON analytics_events(event_name, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session_time ON analytics_events(session_id, received_at DESC);

CREATE TABLE IF NOT EXISTS outbound_clicks (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL REFERENCES tools(id),
  placement TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL,
  user_agent_family TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_outbound_tool_time ON outbound_clicks(tool_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
