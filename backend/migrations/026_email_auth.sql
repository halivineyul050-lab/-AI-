CREATE TABLE user_email_verifications (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, verified_at TEXT NOT NULL);
CREATE TABLE auth_email_codes (id TEXT PRIMARY KEY, normalized_email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX auth_email_codes_lookup ON auth_email_codes(normalized_email,purpose,created_at);
PRAGMA user_version = 26;
