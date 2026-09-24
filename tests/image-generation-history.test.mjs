import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageHistory } from '../image-generation-history.js';

function memoryIndexedDb() {
  const rows = new Map();
  const request = (operation) => {
    const value = {};
    queueMicrotask(() => {
      try { value.result = operation(); value.onsuccess?.(); }
      catch (error) { value.error = error; value.onerror?.(); }
    });
    return value;
  };
  const store = {
    put(value) { return request(() => { rows.set(value.id, structuredClone(value)); }); },
    getAll() { return request(() => [...rows.values()].map((value) => structuredClone(value))); },
    delete(id) { return request(() => rows.delete(id)); },
    clear() { return request(() => rows.clear()); },
    createIndex() {}
  };
  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    transaction() { return { objectStore: () => store }; }
  };
  return { open() { const value = request(() => database); queueMicrotask(() => value.onupgradeneeded?.()); return value; } };
}

function record(number) {
  return { id: `id-${number}`, blob: new Blob([String(number)], { type: 'image/png' }), prompt: `prompt ${number}`, modelName: 'Model', ratio: '1:1', style: '自动', mimeType: 'image/png', createdAt: number };
}

test('local image history lists newest first and keeps only the newest 50 records', async () => {
  const history = createImageHistory({ indexedDB: memoryIndexedDb(), limit: 50 });
  await history.addMany(Array.from({ length: 51 }, (_, index) => record(index + 1)));
  const items = await history.list();
  assert.equal(items.length, 50);
  assert.equal(items[0].id, 'id-51');
  assert.equal(items.at(-1).id, 'id-2');
  assert.ok(items[0].blob instanceof Blob);
});

test('local image history deletes one record and clears all records', async () => {
  const history = createImageHistory({ indexedDB: memoryIndexedDb() });
  await history.addMany([record(1), record(2)]);
  await history.remove('id-2');
  assert.deepEqual((await history.list()).map((item) => item.id), ['id-1']);
  await history.clear();
  assert.deepEqual(await history.list(), []);
});

test('local image history rejects records without an image Blob', async () => {
  const history = createImageHistory({ indexedDB: memoryIndexedDb() });
  await assert.rejects(history.addMany([{ ...record(1), blob: null }]), /图片数据无效/);
});
