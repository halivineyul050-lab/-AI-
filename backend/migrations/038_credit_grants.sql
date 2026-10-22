CREATE TABLE credit_grants(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),credits INTEGER NOT NULL CHECK(credits>0),reason TEXT NOT NULL,actor TEXT NOT NULL,request_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
PRAGMA user_version = 38;
