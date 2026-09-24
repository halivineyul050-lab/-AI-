CREATE TABLE IF NOT EXISTS site_announcements (
  id VARCHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  summary VARCHAR(240) NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  available_at VARCHAR(40) NOT NULL,
  button_label VARCHAR(40) NOT NULL DEFAULT '',
  button_url VARCHAR(2048) NOT NULL DEFAULT '',
  version BIGINT NOT NULL CHECK (version BETWEEN 1 AND 1000000),
  enabled TINYINT NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  created_at VARCHAR(40) NOT NULL DEFAULT (DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')),
  updated_at VARCHAR(40) NOT NULL DEFAULT (DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')),
  PRIMARY KEY (id),
  KEY idx_site_announcements_public (enabled, available_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
