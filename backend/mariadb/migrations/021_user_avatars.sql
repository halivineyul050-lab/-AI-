CREATE TABLE IF NOT EXISTS user_avatars (
  user_id VARCHAR(191) NOT NULL,
  revision VARCHAR(36) NOT NULL,
  mime_type VARCHAR(32) NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  image_bytes MEDIUMBLOB NOT NULL CHECK (OCTET_LENGTH(image_bytes) BETWEEN 1 AND 2097152),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_avatar_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
