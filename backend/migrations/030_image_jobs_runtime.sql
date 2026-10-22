CREATE TABLE IF NOT EXISTS image_generation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES credit_reservations(id),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'complete', 'failed')),
  response_json TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_image_jobs_owner_state ON image_generation_jobs(user_id, state);
CREATE INDEX IF NOT EXISTS idx_image_jobs_state_expiry ON image_generation_jobs(state, expires_at);
PRAGMA user_version = 30;
