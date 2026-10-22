ALTER TABLE credit_reservations ADD COLUMN billing_mode VARCHAR(16) NOT NULL DEFAULT 'fixed';
ALTER TABLE credit_reservations ADD COLUMN charged_credits BIGINT NULL;
CREATE TABLE IF NOT EXISTS nestdutio_task_usage(task_id VARCHAR(64) PRIMARY KEY,snapshot_json LONGTEXT NOT NULL,budget_credits INT NOT NULL,prompt_tokens BIGINT NOT NULL DEFAULT 0,completion_tokens BIGINT NOT NULL DEFAULT 0,request_count INT NOT NULL DEFAULT 0,charged_credits BIGINT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
