CREATE TABLE nestdutio_publications(project_id TEXT PRIMARY KEY REFERENCES nestdutio_projects(id) ON DELETE CASCADE,slug TEXT NOT NULL UNIQUE,state TEXT NOT NULL DEFAULT 'offline',live_version TEXT,previous_version TEXT,candidate_version TEXT,candidate_token TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
PRAGMA user_version=34;
