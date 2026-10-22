ALTER TABLE manual_recharge_orders ADD COLUMN package_id TEXT;
ALTER TABLE manual_recharge_orders ADD COLUMN first_purchase INTEGER NOT NULL DEFAULT 0;
ALTER TABLE manual_recharge_orders ADD COLUMN original_price_cents INTEGER;
CREATE TABLE credit_purchase_claims(user_id TEXT PRIMARY KEY,order_id TEXT NOT NULL,created_at TEXT NOT NULL);
INSERT OR IGNORE INTO credit_purchase_claims(user_id,order_id,created_at)
SELECT user_id,MIN(id),MIN(COALESCE(reviewed_at,created_at)) FROM manual_recharge_orders WHERE status='approved' GROUP BY user_id;
UPDATE manual_recharge_orders SET package_id='starter',first_purchase=1,original_price_cents=600 WHERE price_cents=1 AND credits=600;
UPDATE credit_config SET config_json=json_set(config_json,'$.firstPurchase',json_object('enabled',1,'packageId','starter','priceCents',1,'originalPriceCents',600)) WHERE json_extract(config_json,'$.firstPurchase') IS NULL;
PRAGMA user_version = 29;
