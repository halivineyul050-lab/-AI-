CREATE TABLE IF NOT EXISTS nestdutio_generation_checkpoints(task_id TEXT PRIMARY KEY,snapshot_json TEXT NOT NULL,updated_at TEXT NOT NULL,expires_at TEXT NOT NULL,resumed_from_task_id TEXT);
CREATE INDEX IF NOT EXISTS nestdutio_checkpoint_expiry ON nestdutio_generation_checkpoints(expires_at);

CREATE TABLE IF NOT EXISTS nestdutio_task_resumes(task_id TEXT PRIMARY KEY,source_task_id TEXT NOT NULL);

PRAGMA user_version = 41;
