CREATE TABLE IF NOT EXISTS image_generation_jobs (
  id VARCHAR(36) COLLATE utf8mb4_bin PRIMARY KEY,
  user_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
  reservation_id VARCHAR(36) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  state VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'complete', 'failed')),
  response_json LONGTEXT,
  error_json TEXT,
  created_at VARCHAR(32) NOT NULL,
  completed_at VARCHAR(32),
  expires_at BIGINT NOT NULL,
  INDEX idx_image_jobs_owner_state(user_id, state),
  INDEX idx_image_jobs_state_expiry(state, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
