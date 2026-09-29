CREATE TABLE IF NOT EXISTS article_source_links (
  source_url_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  article_id VARCHAR(191) NOT NULL,
  source_url LONGTEXT NOT NULL,
  source_name VARCHAR(512) NOT NULL DEFAULT '',
  feed_url LONGTEXT NOT NULL,
  source_title LONGTEXT NOT NULL,
  source_published_at VARCHAR(64) NULL,
  discovered_at VARCHAR(64) NOT NULL,
  created_at VARCHAR(64) NOT NULL DEFAULT (DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')),
  PRIMARY KEY (source_url_hash),
  KEY idx_article_source_links_article (article_id),
  KEY idx_article_source_links_published (source_published_at),
  KEY idx_article_source_links_discovered (discovered_at),
  CONSTRAINT fk_article_source_links_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
