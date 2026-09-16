import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const normalizeTitle = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

export function validateArtifact(artifact, expectedCount = 69) {
  const articles = Array.isArray(artifact?.articles) ? artifact.articles : [];
  const issues = [];
  if (articles.length !== expectedCount) issues.push(`expected ${expectedCount} articles, received ${articles.length}`);
  for (const key of ['id', 'slug', 'title']) {
    const values = articles.map((article) => key === 'title' ? normalizeTitle(article[key]) : article[key]);
    if (new Set(values).size !== values.length) issues.push(`duplicate ${key}`);
  }
  const image = /!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]+\]\]|<img\b|(?:封面图|配图|图片)(?:位置|内容|说明|文案)\s*[：:]/i;
  for (const article of articles) {
    if (!article.id || !article.slug || !article.title || !article.body_text || !article.excerpt || !article.published_date) issues.push(`${article.source_file || article.id}: missing required field`);
    if (article.kind !== 'news' || article.status !== 'published') issues.push(`${article.source_file || article.id}: invalid publication state`);
    if (article.cover_url !== '') issues.push(`${article.source_file || article.id}: cover must be empty`);
    if (image.test(article.body_text)) issues.push(`${article.source_file || article.id}: body contains image residue`);
  }
  return issues;
}

export function planUpserts(articles, existingRows) {
  const byId = new Map(existingRows.map((row) => [row.id, row]));
  const bySlug = new Map(existingRows.map((row) => [row.slug, row]));
  const byTitle = new Map(existingRows.map((row) => [normalizeTitle(row.title), row]));
  return articles.map((article) => {
    const existing = byId.get(article.id) || bySlug.get(article.slug) || byTitle.get(normalizeTitle(article.title));
    return { ...article, id: existing?.id || article.id, slug: existing?.slug || article.slug, operation: existing ? 'update' : 'insert' };
  });
}

const connectionOptions = (env = process.env) => ({
  socketPath: env.NIKAI_DB_SOCKET || '/var/lib/mysql/mysql.sock',
  host: env.NIKAI_DB_HOST || undefined,
  port: Number(env.NIKAI_DB_PORT || 3306),
  user: env.NIKAI_DB_USER,
  password: env.NIKAI_DB_PASSWORD,
  database: env.NIKAI_DB_NAME || 'nikai_ai',
  charset: 'utf8mb4_unicode_ci',
});

export async function importArticles({ artifact, apply = false, snapshotPath = '', env = process.env }) {
  const issues = validateArtifact(artifact);
  if (issues.length) throw new Error(`Artifact validation failed:\n${issues.join('\n')}`);
  const connection = await mysql.createConnection(connectionOptions(env));
  try {
    const [existingRows] = await connection.query('SELECT * FROM articles');
    const planned = planUpserts(artifact.articles, existingRows);
    const matchedIds = new Set(planned.filter((item) => item.operation === 'update').map((item) => item.id));
    const before = existingRows.filter((row) => matchedIds.has(row.id));
    if (snapshotPath) writeFileSync(snapshotPath, `${JSON.stringify({ created_at: new Date().toISOString(), rows: before }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    const summary = {
      apply,
      total: planned.length,
      insert: planned.filter((item) => item.operation === 'insert').length,
      update: planned.filter((item) => item.operation === 'update').length,
      existing_articles: existingRows.length,
    };
    if (!apply) return summary;
    await connection.beginTransaction();
    try {
      const sql = `INSERT INTO articles (
        id, slug, kind, topic, title, excerpt, cover_url, body_text, published_date, read_time,
        source_name, source_url, status, cms_managed_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ'), 1)
      ON DUPLICATE KEY UPDATE kind=VALUES(kind), topic=VALUES(topic), title=VALUES(title), excerpt=VALUES(excerpt),
        cover_url=VALUES(cover_url), body_text=VALUES(body_text), published_date=VALUES(published_date),
        read_time=VALUES(read_time), source_name=VALUES(source_name), source_url=VALUES(source_url), status=VALUES(status),
        cms_managed_at=VALUES(cms_managed_at), updated_at=VALUES(cms_managed_at), revision=revision+1`;
      for (const item of planned) {
        await connection.query(sql, [
          item.id, item.slug, item.kind, item.topic, item.title, item.excerpt, '', item.body_text,
          item.published_date, `${item.read_time} 分钟`, item.source_name, item.source_url, 'published',
        ]);
      }
      await connection.query("UPDATE content_state SET revision=revision+1, updated_at=DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ') WHERE id=1");
      await connection.commit();
      return summary;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] || '') === resolve(currentFile)) {
  const artifactPath = process.argv[2];
  if (!artifactPath) throw new Error('Usage: node scripts/import-obsidian-news.mjs <artifact.json> [--apply] [--snapshot <path>]');
  const snapshotIndex = process.argv.indexOf('--snapshot');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  importArticles({ artifact, apply: process.argv.includes('--apply'), snapshotPath: snapshotIndex >= 0 ? process.argv[snapshotIndex + 1] : '' })
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
