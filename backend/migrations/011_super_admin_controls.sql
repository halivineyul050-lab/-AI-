ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_users_super_admin ON users(is_super_admin, status);

PRAGMA user_version = 11;
