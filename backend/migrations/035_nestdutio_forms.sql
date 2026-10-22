CREATE TABLE nestdutio_form_records(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES nestdutio_projects(id) ON DELETE CASCADE,version_id TEXT NOT NULL,form_id TEXT NOT NULL,request_key TEXT NOT NULL,body_hash TEXT NOT NULL,schema_json TEXT NOT NULL,values_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(project_id,form_id,request_key));
CREATE INDEX nestdutio_records_project ON nestdutio_form_records(project_id,created_at,id);
PRAGMA user_version=35;
