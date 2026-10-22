ALTER TABLE image_providers ADD COLUMN balance_path TEXT NOT NULL DEFAULT '';
ALTER TABLE image_providers ADD COLUMN balance_value_field TEXT NOT NULL DEFAULT 'balance';
ALTER TABLE image_providers ADD COLUMN balance_currency_field TEXT NOT NULL DEFAULT '';

PRAGMA user_version = 18;
