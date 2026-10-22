CREATE TABLE explainer_provider (id INTEGER PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE explainer_usage (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, active_until INTEGER NOT NULL DEFAULT 0, request_id TEXT NOT NULL DEFAULT '', PRIMARY KEY (user_id, day));
CREATE TABLE explainer_tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_key TEXT NOT NULL, state TEXT NOT NULL, question TEXT NOT NULL, mode TEXT NOT NULL, level TEXT NOT NULL, result TEXT NOT NULL DEFAULT '', error_code TEXT NOT NULL DEFAULT '', reservation TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,request_key));
CREATE INDEX explainer_tasks_state_updated ON explainer_tasks(state,updated_at);
PRAGMA user_version = 32;
