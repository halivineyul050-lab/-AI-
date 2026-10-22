import { randomUUID } from 'node:crypto';
import { inspectImage } from './image-generation-gateway.mjs';
import { HttpError } from './validation.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function readAvatar(request) {
  const mimeType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!allowedMimes.has(mimeType)) throw new HttpError(415, 'invalid_avatar_type', '请选择 JPG、PNG 或 WebP 图片');
  if (Number(request.headers['content-length']) > MAX_BYTES) throw new HttpError(413, 'avatar_too_large', '头像图片不能超过 2MB');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new HttpError(413, 'avatar_too_large', '头像图片不能超过 2MB');
    chunks.push(chunk);
  }
  let image;
  try { image = inspectImage(Buffer.concat(chunks)); } catch { throw new HttpError(422, 'invalid_avatar', '图片无法识别，请重新选择'); }
  if (image.mimeType !== mimeType) throw new HttpError(422, 'invalid_avatar', '图片格式与文件类型不符');
  return image;
}

export function createAvatarStore(db) {
  const mariadb = db.backend === 'mariadb';
  const save = db.prepare(`INSERT INTO user_avatars (user_id, revision, mime_type, image_bytes)
    VALUES (?, ?, ?, ${mariadb ? 'FROM_BASE64(?)' : '?'})
    ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, mime_type = excluded.mime_type, image_bytes = excluded.image_bytes`);
  const read = db.prepare(`SELECT mime_type AS mimeType, ${mariadb ? 'TO_BASE64(image_bytes)' : 'image_bytes'} AS bytes FROM user_avatars WHERE user_id = ?`);
  return {
    save(userId, image) { save.run(userId, randomUUID(), image.mimeType, mariadb ? image.bytes.toString('base64') : image.bytes); },
    get(userId) {
      const row = read.get(userId);
      return row ? { mimeType: row.mimeType, bytes: Buffer.from(row.bytes, mariadb ? 'base64' : undefined) } : null;
    },
    reset(userId) { db.prepare('DELETE FROM user_avatars WHERE user_id = ?').run(userId); }
  };
}
