CREATE TABLE image_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL UNIQUE,
  generation_path TEXT NOT NULL DEFAULT '/v1/images/generations',
  encrypted_api_key TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL DEFAULT 60000 CHECK (timeout_ms BETWEEN 10000 AND 180000),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_test_status TEXT NOT NULL DEFAULT 'untested' CHECK (last_test_status IN ('untested', 'success', 'failed')),
  last_test_message TEXT NOT NULL DEFAULT '',
  last_tested_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE image_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES image_providers(id),
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  supported_ratios_json TEXT NOT NULL,
  max_images INTEGER NOT NULL CHECK (max_images BETWEEN 1 AND 4),
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(provider_id, model_id)
);

CREATE INDEX idx_image_providers_enabled ON image_providers(enabled, name);
CREATE INDEX idx_image_models_provider ON image_models(provider_id, sort_order);
CREATE INDEX idx_image_models_available ON image_models(enabled, is_default, sort_order);
CREATE UNIQUE INDEX uq_image_models_default ON image_models(is_default) WHERE is_default = 1;

PRAGMA user_version = 14;
