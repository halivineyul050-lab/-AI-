import { randomUUID } from 'node:crypto';
import { HttpError } from './validation.mjs';

const allowedFields = new Set(['title', 'summary', 'body', 'availableAt', 'buttonLabel', 'buttonUrl', 'version', 'enabled']);

function invalid(message) {
  throw new HttpError(422, 'invalid_announcement', message);
}

function plainText(value, name, max, required = false) {
  if (typeof value !== 'string') invalid(`${name}格式无效`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max || /<\/?[a-z][^>]*>/i.test(normalized)) invalid(`${name}需为纯文本，且不能超过${max}个字符`);
  return normalized;
}

function normalizeAnnouncement(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('公告内容格式无效');
  if (Object.keys(input).some((key) => !allowedFields.has(key))) invalid('公告包含未知字段');
  const title = plainText(input.title, '标题', 120, true);
  if (title.length < 2) invalid('标题至少需要2个字符');
  const summary = plainText(input.summary ?? '', '简介', 240);
  const body = plainText(input.body, '正文', 4000, true);
  let availableAt;
  if (typeof input.availableAt !== 'string' || !input.availableAt.trim() || !Number.isFinite(Date.parse(input.availableAt))) invalid('发布时间无效');
  availableAt = new Date(input.availableAt).toISOString();
  const buttonLabel = plainText(input.buttonLabel ?? '', '按钮文字', 40);
  const buttonUrl = plainText(input.buttonUrl ?? '', '按钮链接', 2048);
  if (Boolean(buttonLabel) !== Boolean(buttonUrl)) invalid('按钮文字和链接需要同时填写');
  if (buttonUrl) {
    if (!buttonUrl.startsWith('/') || buttonUrl.startsWith('//') || /[\s\\]/.test(buttonUrl)) invalid('按钮链接仅支持站内路径');
    try {
      const parsed = new URL(buttonUrl, 'https://local.invalid');
      if (parsed.origin !== 'https://local.invalid') invalid('按钮链接仅支持站内路径');
    } catch { invalid('按钮链接无效'); }
  }
  const version = Number(input.version);
  if (!Number.isInteger(version) || version < 1 || version > 1_000_000) invalid('公告版本必须是1到1000000之间的整数');
  if (typeof input.enabled !== 'boolean') invalid('启用状态无效');
  return { title, summary, body, availableAt, buttonLabel, buttonUrl, version, enabled: input.enabled ? 1 : 0 };
}

function adminItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    availableAt: row.available_at,
    buttonLabel: row.button_label,
    buttonUrl: row.button_url,
    version: Number(row.version),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicItem(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    availableAt: row.available_at,
    buttonLabel: row.button_label,
    buttonUrl: row.button_url,
    version: Number(row.version)
  };
}

export function createSiteAnnouncementStore(db) {
  const selectColumns = 'id, title, summary, body, available_at, button_label, button_url, version, enabled, created_at, updated_at';
  return {
    listAdmin() {
      return db.prepare(`SELECT ${selectColumns} FROM site_announcements ORDER BY available_at DESC, created_at DESC`).all().map(adminItem);
    },
    listPublished(now = new Date().toISOString()) {
      return db.prepare(`SELECT ${selectColumns} FROM site_announcements WHERE enabled = 1 AND available_at <= ? ORDER BY available_at DESC, created_at DESC`).all(now).map(publicItem);
    },
    get(id) {
      return adminItem(db.prepare(`SELECT ${selectColumns} FROM site_announcements WHERE id = ?`).get(id));
    },
    create(input) {
      const item = normalizeAnnouncement(input);
      const id = randomUUID();
      db.prepare(`INSERT INTO site_announcements (id, title, summary, body, available_at, button_label, button_url, version, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, item.title, item.summary, item.body, item.availableAt, item.buttonLabel, item.buttonUrl, item.version, item.enabled);
      return this.get(id);
    },
    update(id, input) {
      const item = normalizeAnnouncement(input);
      const result = db.prepare(`UPDATE site_announcements SET title = ?, summary = ?, body = ?, available_at = ?, button_label = ?, button_url = ?, version = ?, enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(item.title, item.summary, item.body, item.availableAt, item.buttonLabel, item.buttonUrl, item.version, item.enabled, id);
      return Number(result.changes) ? this.get(id) : null;
    },
    remove(id) {
      return Number(db.prepare('DELETE FROM site_announcements WHERE id = ?').run(id).changes) > 0;
    }
  };
}
