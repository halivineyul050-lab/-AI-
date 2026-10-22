ALTER TABLE credit_reservations ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE credit_reservations ADD COLUMN charged_credits INTEGER;
CREATE TABLE nestdutio_task_usage(task_id TEXT PRIMARY KEY,snapshot_json TEXT NOT NULL,budget_credits INTEGER NOT NULL,prompt_tokens INTEGER NOT NULL DEFAULT 0,completion_tokens INTEGER NOT NULL DEFAULT 0,request_count INTEGER NOT NULL DEFAULT 0,charged_credits INTEGER);
PRAGMA user_version = 37;
