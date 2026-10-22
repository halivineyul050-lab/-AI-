CREATE TABLE IF NOT EXISTS image_cloud_history (
  id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  generation_id VARCHAR(191) NOT NULL,
  prompt TEXT NOT NULL,
  model_name VARCHAR(191) NOT NULL,
  ratio VARCHAR(32) NOT NULL,
  style VARCHAR(100) NOT NULL,
  mime_type VARCHAR(32) NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_length INT UNSIGNED NOT NULL CHECK (byte_length BETWEEN 1 AND 10485760),
  created_at VARCHAR(24) COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (id),
  KEY idx_image_cloud_history_user_created (user_id, created_at, id),
  CONSTRAINT fk_image_cloud_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS image_cloud_history_chunks (
  image_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  image_bytes MEDIUMBLOB NOT NULL,
  PRIMARY KEY (image_id, chunk_index),
  CONSTRAINT fk_image_cloud_history_chunk_image FOREIGN KEY (image_id) REFERENCES image_cloud_history(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
