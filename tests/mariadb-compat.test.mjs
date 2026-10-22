import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMariaMigrations, createMariaResponseBuffer, translateMariaSql } from '../backend/mariadb-compat.mjs';

test('each timed-out MariaDB call can isolate a late worker response from the next call', () => {
  const first = createMariaResponseBuffer();
  const second = createMariaResponseBuffer();
  assert.notEqual(first.buffer, second.buffer);
  Atomics.store(first.state, 1, 1);
  first.bytes[0] = 65;
  assert.equal(Atomics.load(second.state, 1), 0);
  assert.equal(second.bytes[0], 0);
});

test('MariaDB dialect translates SQLite timestamps, inserts and upserts', () => {
  assert.match(translateMariaSql("INSERT OR IGNORE INTO x (id) VALUES (?)"), /^INSERT IGNORE/);
  assert.match(translateMariaSql("UPDATE x SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"), /UTC_TIMESTAMP/);
  assert.match(translateMariaSql('INSERT INTO x (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value'), /ON DUPLICATE KEY UPDATE value = VALUES\(value\)/);
  assert.match(translateMariaSql('PRAGMA user_version'), /schema_migrations/);
});

test("MariaDB accepts the portable LIKE escape syntax used by search queries", () => {
  const sql = translateMariaSql("SELECT name FROM tools WHERE name LIKE ? ESCAPE '!'");
  assert.equal(sql, "SELECT name FROM tools WHERE name LIKE ? ESCAPE '!'");
});

test('MariaDB dialect translates relative date windows', () => {
  assert.match(translateMariaSql("created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 seconds')"), /INTERVAL 10 SECOND/);
  assert.match(translateMariaSql("content_updated_date >= date('now', '-6 days')"), /INTERVAL 6 DAY/);
});

test('MariaDB dialect translates SQLite case-insensitive ordering', () => {
  assert.equal(translateMariaSql('SELECT * FROM tools ORDER BY name COLLATE NOCASE ASC'), 'SELECT * FROM tools ORDER BY name COLLATE utf8mb4_unicode_ci ASC');
});

test('MariaDB dialect translates monitoring time buckets and JSON text casts', () => {
  const hourly = translateMariaSql("SELECT CAST(((julianday(received_at) - julianday(?)) * 24.0) + 0.0000001 AS INTEGER) bucket_index");
  assert.match(hourly, /TIMESTAMPDIFF\(HOUR, \?, received_at\)/);
  assert.match(translateMariaSql("SELECT date(received_at, '+8 hours') AS day"), /DATE_ADD\(received_at, INTERVAL 8 HOUR\)/);
  assert.match(translateMariaSql("CAST(json_extract(properties_json, '$.query') AS TEXT)"), /AS CHAR\) COLLATE utf8mb4_unicode_ci/);
  assert.match(translateMariaSql("json_type(properties_json, '$.tool_id') = 'text'"), /JSON_TYPE\(JSON_EXTRACT\(properties_json, '\$\.tool_id'\)\) = 'STRING'/);
});

test('MariaDB dialect translates provider default-model transactions', () => {
  assert.equal(translateMariaSql('BEGIN IMMEDIATE'), 'START TRANSACTION');
  assert.match(translateMariaSql("UPDATE image_models SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE is_default = 1"), /UTC_TIMESTAMP/);
});

test('MariaDB applies the image-provider and announcement migrations once', () => {
  const calls = [];
  const applied = new Set();
  const db = {
    prepare(sql) {
      if (sql.startsWith('SELECT')) return { get: (version) => applied.has(version) ? { version } : undefined };
      return { run: (...params) => { applied.add(params[0]); calls.push({ type: 'record', params }); } };
    },
    exec(sql) { calls.push({ type: 'exec', sql }); }
  };

  applyMariaMigrations(db);
  applyMariaMigrations(db);

  assert.equal(calls.filter((call) => call.type === 'exec').length, applied.size);
  assert.ok(applied.has(42), 'named profile migration applied');
  assert.ok(applied.has(43), 'per-request usage migration applied');
  assert.ok(applied.has(44), 'native WeChat project migration applied');
  assert.ok(calls.some(call=>call.type==='exec' && /CREATE TABLE IF NOT EXISTS nestdutio_request_usage/.test(call.sql)));
  assert.ok(calls.some(call=>call.type==='exec' && /CREATE TABLE IF NOT EXISTS model_profiles/.test(call.sql)));
  assert.ok(calls.some(call=>call.type==='exec' && /ALTER TABLE nestdutio_tasks ADD COLUMN IF NOT EXISTS progress_json MEDIUMTEXT NULL/.test(call.sql)));
  assert.match(calls[0].sql, /CREATE TABLE(?: IF NOT EXISTS)? image_providers/);
  assert.match(calls[0].sql, /CREATE TABLE(?: IF NOT EXISTS)? image_models/);
  assert.doesNotMatch(calls[0].sql, /PRAGMA/i);
  assert.match(calls[0].sql, /name VARCHAR\(191\) NOT NULL/);
  assert.match(calls[0].sql, /base_url VARCHAR\(191\) NOT NULL/);
  assert.match(calls[0].sql, /model_id VARCHAR\(191\) NOT NULL/);
  assert.match(calls[0].sql, /last_test_message LONGTEXT NOT NULL DEFAULT ''/);
  assert.match(calls[0].sql, /CHECK \(timeout_ms BETWEEN 10000 AND 180000\)/);
  assert.match(calls[0].sql, /CHECK \(max_images BETWEEN 1 AND 4\)/);
  assert.match(calls.filter((call) => call.type === 'exec')[2].sql, /CREATE TABLE IF NOT EXISTS site_announcements/);
  assert.match(calls.filter((call) => call.type === 'exec')[3].sql, /ADD COLUMN IF NOT EXISTS edit_path VARCHAR\(1024\) NOT NULL DEFAULT '\/v1\/images\/edits'/);
  assert.match(calls.filter((call) => call.type === 'exec')[4].sql, /ADD COLUMN IF NOT EXISTS balance_path VARCHAR\(1024\) NOT NULL DEFAULT ''/);
  assert.match(calls.find(call=>call.type==='exec' && /CREATE TABLE IF NOT EXISTS image_cloud_history_chunks/.test(call.sql)).sql, /CREATE TABLE IF NOT EXISTS image_cloud_history_chunks/);
  assert.match(calls.find((call) => call.type === 'exec' && /SELECT 1/.test(call.sql)).sql, /SELECT 1/);
  assert.match(calls.find(call=>call.type==='exec'&&/CREATE TABLE IF NOT EXISTS news_sync_config/.test(call.sql)).sql,/CREATE TABLE IF NOT EXISTS news_sync_config/);
  assert.match(calls.find(call=>call.type==='exec'&&/CREATE TABLE IF NOT EXISTS assistant_usage/.test(call.sql)).sql,/CREATE TABLE IF NOT EXISTS assistant_usage/);
  assert.match(calls.find(call=>call.type==='exec'&&/CREATE TABLE IF NOT EXISTS auth_email_codes/.test(call.sql)).sql,/CREATE TABLE IF NOT EXISTS auth_email_codes/);
  assert.match(calls.find(call=>call.type==='exec'&&/CREATE TABLE credit_wallets/.test(call.sql)).sql,/CREATE TABLE credit_wallets/);
  assert.match(calls.find(call=>call.type==='exec'&&/CREATE TABLE manual_recharge_orders/.test(call.sql)).sql,/CREATE TABLE manual_recharge_orders/);
  assert.match(calls.find(call=>call.type==='exec'&&/CREATE TABLE(?: IF NOT EXISTS)? credit_purchase_claims/.test(call.sql)).sql,/CREATE TABLE(?: IF NOT EXISTS)? credit_purchase_claims/);
  assert.match(calls.find(call=>call.type==='exec'&&/CREATE TABLE IF NOT EXISTS image_generation_jobs/.test(call.sql)).sql,/CREATE TABLE IF NOT EXISTS image_generation_jobs/);
  assert.match(calls.find(call=>call.type==='exec'&&/CREATE TABLE IF NOT EXISTS news_cover_images/.test(call.sql)).sql,/CREATE TABLE IF NOT EXISTS news_cover_images/);
  assert.match(calls.find(call=>call.type==='exec'&&/CREATE TABLE IF NOT EXISTS explainer_tasks/.test(call.sql)).sql,/CREATE TABLE IF NOT EXISTS explainer_tasks/);
  assert.deepEqual(calls.find(call=>call.type==='record' && call.params[0]===40).params, [40, 'nestdutio_progress']);
  assert.ok(calls.some(call=>call.type==='exec' && /CREATE TABLE IF NOT EXISTS nestdutio_generation_checkpoints/.test(call.sql)));
  assert.ok(calls.some(call=>call.type==='exec' && /CREATE TABLE IF NOT EXISTS nestdutio_task_resumes/.test(call.sql)));
  assert.deepEqual(calls.find(call=>call.type==='record' && call.params[0]===41).params, [41, 'nestdutio_checkpoints']);
  assert.deepEqual(calls.find(call=>call.type==='record' && call.params[0]===42).params, [42, 'model_profiles']);
  assert.deepEqual(calls.at(-1).params, [44, 'nestdutio_wechat']);
});

