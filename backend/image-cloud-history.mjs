import { randomUUID } from 'node:crypto';

const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_USER_BYTES = 1024 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * MAX_USER_BYTES;
const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const fields = 'id, generation_id AS generationId, prompt, model_name AS modelName, ratio, style, mime_type AS mimeType, byte_length AS byteLength, created_at AS createdAt';

function cursorEncode(row) {
  return Buffer.from(JSON.stringify([row.createdAt, row.id])).toString('base64url');
}

function cursorDecode(value) {
  if (!value || typeof value !== 'string' || value.length > 512) throw new Error('Invalid history cursor');
  let result;
  try { result = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { throw new Error('Invalid history cursor'); }
  if (!Array.isArray(result) || result.length !== 2 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result[0]) || !/^[0-9a-f-]{36}$/.test(result[1]) || cursorEncode({ createdAt: result[0], id: result[1] }) !== value) throw new Error('Invalid history cursor');
  return result;
}

export function createImageCloudHistoryStore(db, { now = Date.now, mariadb = process.env.NIKAI_DB_ENGINE === 'mariadb', maxUserBytes = MAX_USER_BYTES, maxTotalBytes = MAX_TOTAL_BYTES } = {}) {
  const insert = db.prepare('INSERT INTO image_cloud_history (id, user_id, generation_id, prompt, model_name, ratio, style, mime_type, byte_length, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertChunk = db.prepare(`INSERT INTO image_cloud_history_chunks (image_id, chunk_index, image_bytes) VALUES (?, ?, ${mariadb ? 'FROM_BASE64(?)' : '?'})`);
  const selectImage = db.prepare(`SELECT ${fields} FROM image_cloud_history WHERE user_id = ? AND id = ?`);
  const selectChunks = db.prepare(`SELECT ${mariadb ? 'TO_BASE64(image_bytes)' : 'image_bytes'} AS bytes FROM image_cloud_history_chunks WHERE image_id = ? ORDER BY chunk_index`);
  const count = db.prepare('SELECT COUNT(*) AS total FROM image_cloud_history WHERE user_id = ?');
  const userBytes = db.prepare('SELECT COALESCE(SUM(byte_length), 0) AS used FROM image_cloud_history WHERE user_id = ?');
  const totalBytes = db.prepare('SELECT COALESCE(SUM(byte_length), 0) AS used FROM image_cloud_history');
  return {
    save(userId, { generationId, prompt, modelName, ratio, style, images }) {
      if (!userId || !Array.isArray(images) || images.length < 1) throw new Error('Invalid cloud history');
      const createdAt = new Date(now()).toISOString();
      const prepared = images.map((image) => {
        const bytes = Buffer.from(image.bytes);
        if (!allowedMimes.has(image.mimeType) || !bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Invalid cloud image');
        return { id: image.id || randomUUID(), mimeType: image.mimeType, bytes };
      });
      db.exec('BEGIN IMMEDIATE');
      try {
        const incomingBytes = prepared.reduce((sum, image) => sum + image.bytes.length, 0);
        if (Number(userBytes.get(userId).used) + incomingBytes > maxUserBytes
          || Number(totalBytes.get().used) + incomingBytes > maxTotalBytes) {
          throw new Error('Cloud image history quota exceeded');
        }
        const items = prepared.map((image) => {
          insert.run(image.id, userId, generationId, prompt, modelName, ratio, style, image.mimeType, image.bytes.length, createdAt);
          for (let offset = 0, index = 0; offset < image.bytes.length; offset += CHUNK_BYTES, index++) {
            const chunk = image.bytes.subarray(offset, offset + CHUNK_BYTES);
            insertChunk.run(image.id, index, mariadb ? chunk.toString('base64') : chunk);
          }
          return { id: image.id, generationId, prompt, modelName, ratio, style, mimeType: image.mimeType, byteLength: image.bytes.length, createdAt };
        });
        db.exec('COMMIT');
        return items;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    list(userId, { limit = 24, cursor = null } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid history limit');
      const position = cursor ? cursorDecode(cursor) : null;
      const sql = `SELECT ${fields} FROM image_cloud_history WHERE user_id = ?${position ? ' AND (created_at < ? OR (created_at = ? AND id < ?))' : ''} ORDER BY created_at DESC, id DESC LIMIT ?`;
      const rows = position ? db.prepare(sql).all(userId, position[0], position[0], position[1], limit + 1) : db.prepare(sql).all(userId, limit + 1);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      return { items, total: Number(count.get(userId).total), nextCursor: hasMore ? cursorEncode(items.at(-1)) : null };
    },
    getImage(userId, id) {
      const metadata = selectImage.get(userId, id);
      if (!metadata) return null;
      const bytes = Buffer.concat(selectChunks.all(id).map((row) => mariadb ? Buffer.from(row.bytes, 'base64') : Buffer.from(row.bytes)));
      if (bytes.length !== Number(metadata.byteLength)) throw new Error('Cloud image is incomplete');
      return { ...metadata, bytes };
    },
    remove(userId, id) { return db.prepare('DELETE FROM image_cloud_history WHERE user_id = ? AND id = ?').run(userId, id).changes > 0; },
    clear(userId) { return db.prepare('DELETE FROM image_cloud_history WHERE user_id = ?').run(userId).changes; }
  };
}
