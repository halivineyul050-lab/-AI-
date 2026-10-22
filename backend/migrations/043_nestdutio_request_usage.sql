CREATE TABLE nestdutio_request_usage (
  task_id TEXT NOT NULL REFERENCES nestdutio_tasks(id) ON DELETE CASCADE,
  request_index INTEGER NOT NULL,
  document TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, request_index)
);
PRAGMA user_version = 43;
