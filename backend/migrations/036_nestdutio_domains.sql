CREATE TABLE nestdutio_domains(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES nestdutio_projects(id) ON DELETE CASCADE,domain TEXT NOT NULL,token TEXT NOT NULL,state TEXT NOT NULL,verified_at TEXT,expires_at TEXT,last_error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(project_id,domain));
CREATE INDEX nestdutio_domains_state ON nestdutio_domains(state,updated_at);
CREATE TABLE nestdutio_domain_bindings(domain TEXT PRIMARY KEY,claim_id TEXT NOT NULL UNIQUE REFERENCES nestdutio_domains(id) ON DELETE CASCADE);
PRAGMA user_version=36;
