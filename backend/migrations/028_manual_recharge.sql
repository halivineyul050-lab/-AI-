CREATE TABLE manual_recharge_config (id INTEGER PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE manual_recharge_assets (id TEXT PRIMARY KEY, mime_type TEXT NOT NULL, image_bytes BLOB NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE manual_recharge_orders (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,user_name TEXT NOT NULL,package_name TEXT NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents>0),credits INTEGER NOT NULL CHECK(credits BETWEEN 1 AND 1000000000),channel TEXT NOT NULL CHECK(channel IN ('alipay','wechat')),delivery TEXT NOT NULL CHECK(delivery IN ('direct','code')),status TEXT NOT NULL CHECK(status IN ('created','pending','approved','rejected','cancelled')),qr_asset_id TEXT NOT NULL REFERENCES manual_recharge_assets(id),receiver_name TEXT NOT NULL,proof_asset_id TEXT REFERENCES manual_recharge_assets(id),note TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,submitted_at TEXT,reviewed_at TEXT,reviewed_by TEXT,encrypted_code TEXT);
CREATE INDEX manual_recharge_user ON manual_recharge_orders(user_id,status,created_at);
CREATE INDEX manual_recharge_status ON manual_recharge_orders(status,created_at);
PRAGMA user_version = 28;

