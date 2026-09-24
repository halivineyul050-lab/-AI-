const DATABASE_NAME = 'nikai-image-history';
const STORE_NAME = 'images';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地历史操作失败'));
  });
}

function normalizeRecord(record) {
  if (!(record?.blob instanceof Blob) || !record.blob.type.startsWith('image/')) throw new Error('图片数据无效');
  return {
    id: String(record.id || crypto.randomUUID()),
    blob: record.blob,
    prompt: String(record.prompt || ''),
    modelName: String(record.modelName || ''),
    ratio: String(record.ratio || '1:1'),
    style: String(record.style || '自动'),
    mimeType: String(record.mimeType || record.blob.type || 'image/png'),
    createdAt: Number(record.createdAt) || Date.now()
  };
}

export function createImageHistory({ indexedDB = globalThis.indexedDB, limit = 50 } = {}) {
  if (!indexedDB?.open) throw new Error('当前浏览器不支持本地生图历史');
  let databasePromise;
  const database = () => {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法打开本地生图历史'));
    });
    return databasePromise;
  };
  const store = async (mode = 'readonly') => (await database()).transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  const list = async () => (await requestResult((await store()).getAll())).sort((a, b) => b.createdAt - a.createdAt);
  return {
    async addMany(records) {
      const target = await store('readwrite');
      for (const record of records.map(normalizeRecord)) await requestResult(target.put(record));
      const items = await list();
      if (items.length > limit) {
        const writable = await store('readwrite');
        for (const record of items.slice(limit)) await requestResult(writable.delete(record.id));
      }
    },
    list,
    async remove(id) { await requestResult((await store('readwrite')).delete(String(id))); },
    async clear() { await requestResult((await store('readwrite')).clear()); }
  };
}
