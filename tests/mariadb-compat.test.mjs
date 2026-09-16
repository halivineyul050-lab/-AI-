import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateMariaSql } from '../backend/mariadb-compat.mjs';

test('MariaDB dialect translates SQLite timestamps, inserts and upserts', () => {
  assert.match(translateMariaSql("INSERT OR IGNORE INTO x (id) VALUES (?)"), /^INSERT IGNORE/);
  assert.match(translateMariaSql("UPDATE x SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"), /UTC_TIMESTAMP/);
  assert.match(translateMariaSql('INSERT INTO x (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value'), /ON DUPLICATE KEY UPDATE value = VALUES\(value\)/);
  assert.match(translateMariaSql('PRAGMA user_version'), /schema_migrations/);
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
  assert.match(translateMariaSql("CAST(json_extract(properties_json, '$.query') AS TEXT)"), /AS CHAR/);
});
