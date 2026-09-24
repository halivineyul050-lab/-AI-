CREATE TABLE IF NOT EXISTS image_providers (
  id VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  base_url VARCHAR(191) NOT NULL,
  generation_path VARCHAR(1024) NOT NULL DEFAULT '/v1/images/generations',
  encrypted_api_key LONGTEXT NOT NULL,
  timeout_ms BIGINT NOT NULL DEFAULT 60000 CHECK (timeout_ms BETWEEN 10000 AND 180000),
  enabled TINYINT NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_test_status VARCHAR(32) NOT NULL DEFAULT 'untested' CHECK (last_test_status IN ('untested', 'success', 'failed')),
  last_test_message LONGTEXT NOT NULL DEFAULT '',
  last_tested_at VARCHAR(1024) NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at VARCHAR(1024) NOT NULL DEFAULT (DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')),
  updated_at VARCHAR(1024) NOT NULL DEFAULT (DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')),
  PRIMARY KEY (id),
  UNIQUE KEY uq_image_providers_name (name),
  UNIQUE KEY uq_image_providers_base_url (base_url)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS image_models (
  id VARCHAR(191) NOT NULL,
  provider_id VARCHAR(191) NOT NULL,
  model_id VARCHAR(191) NOT NULL,
  display_name VARCHAR(1024) NOT NULL,
  supported_ratios_json LONGTEXT NOT NULL,
  max_images BIGINT NOT NULL CHECK (max_images BETWEEN 1 AND 4),
  sort_order BIGINT NOT NULL DEFAULT 0,
  enabled TINYINT NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_default TINYINT NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  default_slot TINYINT GENERATED ALWAYS AS (IF(is_default = 1, 1, NULL)) PERSISTENT,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at VARCHAR(1024) NOT NULL DEFAULT (DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')),
  updated_at VARCHAR(1024) NOT NULL DEFAULT (DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')),
  PRIMARY KEY (id),
  UNIQUE KEY uq_image_models_provider_model (provider_id, model_id),
  UNIQUE KEY uq_image_models_default (default_slot),
  KEY idx_image_models_provider (provider_id, sort_order),
  KEY idx_image_models_available (enabled, is_default, sort_order),
  CONSTRAINT fk_image_models_provider FOREIGN KEY (provider_id) REFERENCES image_providers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_image_providers_enabled ON image_providers(enabled, name);
