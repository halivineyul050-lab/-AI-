CREATE TABLE IF NOT EXISTS nestdutio_request_usage (
  task_id VARCHAR(64) NOT NULL,
  request_index INT NOT NULL,
  document MEDIUMTEXT NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (task_id, request_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
