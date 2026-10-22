import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../backend/database.mjs';

test('SQLite fills a historical migration gap without lowering the schema version or losing content', t => {
  assert.notEqual(process.env.NIKAI_DB_ENGINE, 'mariadb');
  const directory = mkdtempSync(join(tmpdir(), 'nikai-sqlite-gap-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'fixture.db');
  let db = openDatabase(file);
  db.exec("UPDATE content_state SET revision = 29 WHERE id = 1; DROP TABLE article_source_links; DELETE FROM schema_migrations WHERE version = 19; PRAGMA user_version = 44");
  db.close();
  db = openDatabase(file);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 44);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 44);
    assert.equal(db.prepare('SELECT name FROM schema_migrations WHERE version = 19').get().name, 'article_source_links');
    assert.equal(db.prepare('SELECT revision FROM content_state WHERE id = 1').get().revision, 29);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM article_source_links').get().count, 0);
  } finally { db.close(); }
  db = openDatabase(file);
  try { assert.equal(db.prepare('PRAGMA user_version').get().user_version, 44); db.exec('PRAGMA user_version = 99'); }
  finally { db.close(); }
  db = openDatabase(file);
  try { assert.equal(db.prepare('PRAGMA user_version').get().user_version, 99, 'Do not lower a marker from a newer application'); }
  finally { db.close(); }
});
