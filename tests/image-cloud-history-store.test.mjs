import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../backend/database.mjs';
import { createImageCloudHistoryStore } from '../backend/image-cloud-history.mjs';
import { registerUser } from '../backend/auth.mjs';

test('image history migration creates durable image storage with an account cascade', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nikai-image-cloud-store-'));
  const db = openDatabase(join(directory, 'history.db'));
  try {
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'image_cloud_history'").get());
    const foreignKey = db.prepare('PRAGMA foreign_key_list(image_cloud_history)').all().find((key) => key.from === 'user_id');
    assert.equal(foreignKey.table, 'users');
    assert.equal(foreignKey.on_delete, 'CASCADE');
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 44);
    assert.ok(db.prepare('SELECT 1 FROM schema_migrations WHERE version = 20').get());
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('account history stores complete images, pages by owner and removes only selected records', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nikai-image-cloud-store-'));
  const path = join(directory, 'history.db');
  let db = openDatabase(path);
  try {
    const first = await registerUser(db, { displayName: '一', email: 'cloud-first@example.com', normalizedEmail: 'cloud-first@example.com', password: 'correct-horse-battery', consentVersion: '2026-09' });
    const second = await registerUser(db, { displayName: '二', email: 'cloud-second@example.com', normalizedEmail: 'cloud-second@example.com', password: 'correct-horse-battery', consentVersion: '2026-09' });
    const bytes = Buffer.alloc(5 * 1024 * 1024, 42);
    const store = createImageCloudHistoryStore(db);
    const images = [{ id: '00000000-0000-4000-8000-000000000001', mimeType: 'image/png', bytes }, { id: '00000000-0000-4000-8000-000000000002', mimeType: 'image/png', bytes: Buffer.from([1, 2, 3]) }];
    store.save(first.user.id, { generationId: 'test', prompt: 'hello', modelName: 'Model', ratio: '1:1', style: '自动', images });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM image_cloud_history_chunks WHERE image_id = ?').get(images[0].id).count, 2);
    assert.deepEqual(store.getImage(first.user.id, images[0].id).bytes, bytes);
    assert.equal(store.getImage(second.user.id, images[0].id), null);
    const page = store.list(first.user.id, { limit: 1 });
    assert.equal(page.total, 2);
    assert.ok(page.nextCursor);
    assert.equal(store.list(first.user.id, { limit: 1, cursor: page.nextCursor }).items.length, 1);
    assert.equal(store.list(second.user.id).total, 0);
    db.close();
    db = openDatabase(path);
    const reopened = createImageCloudHistoryStore(db);
    assert.deepEqual(reopened.getImage(first.user.id, images[0].id).bytes, bytes);
    assert.equal(reopened.remove(second.user.id, images[0].id), false);
    assert.equal(reopened.remove(first.user.id, images[0].id), true);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM image_cloud_history_chunks WHERE image_id = ?').get(images[0].id).count, 0);
    assert.equal(reopened.clear(first.user.id), 1);
    assert.equal(reopened.list(first.user.id).total, 0);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('cloud history keeps more than fifty images and rolls back incomplete generations', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nikai-image-cloud-limit-'));
  const db = openDatabase(join(directory, 'history.db'));
  try {
    const email = 'cloud-limit@example.com';
    const { user } = await registerUser(db, { displayName: '测试', email, normalizedEmail: email, password: 'correct-horse-battery', consentVersion: '2026-09' });
    const store = createImageCloudHistoryStore(db);
    const metadata = { generationId: 'batch', prompt: 'test', modelName: 'Model', ratio: '1:1', style: '自动' };
    const images = Array.from({ length: 51 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, mimeType: 'image/png', bytes: Buffer.from([index + 1]) }));
    store.save(user.id, { ...metadata, images });
    assert.equal(store.list(user.id).total, 51);
    const first = store.list(user.id, { limit: 24 });
    const second = store.list(user.id, { limit: 24, cursor: first.nextCursor });
    const third = store.list(user.id, { limit: 24, cursor: second.nextCursor });
    assert.equal(new Set([...first.items, ...second.items, ...third.items].map((item) => item.id)).size, 51);
    assert.throws(() => store.save(user.id, { ...metadata, images: [{ id: '00000000-0000-4000-8000-999999999999', mimeType: 'image/png', bytes: Buffer.from([1]) }, images[0]] }));
    assert.equal(store.list(user.id).total, 51);
    assert.equal(store.getImage(user.id, '00000000-0000-4000-8000-999999999999'), null);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('cloud history rejects new bytes at account and site limits without deleting saved images', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nikai-image-cloud-quota-'));
  const db = openDatabase(join(directory, 'history.db'));
  try {
    const first = (await registerUser(db, { displayName: '一', email: 'quota-one@example.com', normalizedEmail: 'quota-one@example.com', password: 'correct-horse-battery', consentVersion: '2026-09' })).user;
    const second = (await registerUser(db, { displayName: '二', email: 'quota-two@example.com', normalizedEmail: 'quota-two@example.com', password: 'correct-horse-battery', consentVersion: '2026-09' })).user;
    const store = createImageCloudHistoryStore(db, { maxUserBytes: 5, maxTotalBytes: 8 });
    const details = { generationId: 'quota', prompt: 'test', modelName: 'Model', ratio: '1:1', style: '自动' };
    const image = (id, size) => [{ id, mimeType: 'image/png', bytes: Buffer.alloc(size, 1) }];
    const firstId = '00000000-0000-4000-8000-000000000101';
    store.save(first.id, { ...details, images: image(firstId, 4) });
    assert.throws(() => store.save(first.id, { ...details, images: image('00000000-0000-4000-8000-000000000102', 2) }), /quota/i);
    store.save(second.id, { ...details, images: image('00000000-0000-4000-8000-000000000103', 4) });
    assert.throws(() => store.save(second.id, { ...details, images: image('00000000-0000-4000-8000-000000000104', 1) }), /quota/i);
    assert.equal(store.list(first.id).total, 1);
    assert.deepEqual(store.getImage(first.id, firstId).bytes, Buffer.alloc(4, 1));
    store.remove(first.id, firstId);
    assert.doesNotThrow(() => store.save(second.id, { ...details, images: image('00000000-0000-4000-8000-000000000105', 1) }));
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
