CREATE TABLE IF NOT EXISTS nestdutio_generation_checkpoints(task_id VARCHAR(64) PRIMARY KEY,snapshot_json LONGTEXT NOT NULL,updated_at VARCHAR(32) NOT NULL,expires_at VARCHAR(32) NOT NULL,resumed_from_task_id VARCHAR(64),KEY nestdutio_checkpoint_expiry(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nestdutio_task_resumes(task_id VARCHAR(64) PRIMARY KEY,source_task_id VARCHAR(64) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
