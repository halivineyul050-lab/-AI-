CREATE TABLE nestdutio_projects(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,draft_version TEXT,published_version TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE nestdutio_versions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES nestdutio_projects(id) ON DELETE CASCADE,artifact TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX nestdutio_version_project ON nestdutio_versions(project_id,created_at);
CREATE TABLE nestdutio_config(id INTEGER PRIMARY KEY,document TEXT NOT NULL);
CREATE TABLE nestdutio_tasks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,project_id TEXT NOT NULL REFERENCES nestdutio_projects(id) ON DELETE CASCADE,request_key TEXT NOT NULL,base_version TEXT,prompt TEXT NOT NULL,state TEXT NOT NULL,version_id TEXT,error_code TEXT NOT NULL DEFAULT '',reservation_id TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,request_key));
CREATE INDEX nestdutio_task_state ON nestdutio_tasks(state,updated_at);
PRAGMA user_version=33;
