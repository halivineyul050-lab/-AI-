CREATE TABLE nestdutio_project_targets (
 project_id TEXT PRIMARY KEY REFERENCES nestdutio_projects(id) ON DELETE CASCADE,
 target TEXT NOT NULL CHECK(target IN ('web','wechat'))
);
CREATE TABLE nestdutio_wechat_settings (
 project_id TEXT PRIMARY KEY REFERENCES nestdutio_projects(id) ON DELETE CASCADE,
 document TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
PRAGMA user_version = 44;
