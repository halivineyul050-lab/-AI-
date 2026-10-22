CREATE TABLE credit_config (id INTEGER PRIMARY KEY, config_json TEXT NOT NULL);
CREATE TABLE credit_wallets (user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance BETWEEN 0 AND 1000000000), frozen INTEGER NOT NULL DEFAULT 0 CHECK(frozen >= 0 AND frozen <= balance));
CREATE TABLE credit_gift_claims (user_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE credit_codes (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, credits INTEGER NOT NULL, label TEXT NOT NULL, expires_at TEXT, disabled INTEGER NOT NULL DEFAULT 0, redeemed_by TEXT, redeemed_at TEXT, created_by TEXT, created_at TEXT NOT NULL);
CREATE TABLE credit_reservations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE, model_record_id TEXT, count INTEGER NOT NULL, unit_credits INTEGER NOT NULL, reserved_credits INTEGER NOT NULL, success_count INTEGER, created_at TEXT NOT NULL, settled_at TEXT);
CREATE TABLE credit_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, reference_id TEXT, created_at TEXT NOT NULL);
CREATE INDEX credit_ledger_user ON credit_ledger(user_id,created_at);
PRAGMA user_version = 27;
