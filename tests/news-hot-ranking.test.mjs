import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { getNewsHotRanking } from '../backend/database.mjs';
import { sourceUrlHash } from '../backend/article-source-links.mjs';

const now = Date.parse('2026-10-22T04:00:00Z');
const at = hours => new Date(now - hours * 3_600_000).toISOString();

for (const sourceCount of [1, 2]) test(`hot ranking considers older leaders beyond 200 newer ${sourceCount}-source articles`, t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const file of ['schema.sql', 'migrations/003_article_sources.sql', 'migrations/019_article_source_links.sql']) {
    db.exec(readFileSync(new URL(`../backend/${file}`, import.meta.url), 'utf8'));
  }
  const article = db.prepare(`INSERT INTO articles
    (id,slug,kind,topic,title,excerpt,cover_url,published_date,read_time,created_at)
    VALUES (?,?,'news','AI',?,'Summary','','2026-10-22','1 minute',?)`);
  const source = db.prepare(`INSERT INTO article_source_links
    (source_url_hash,article_id,source_url,source_name,source_title,source_published_at,discovered_at,feed_url)
    VALUES (?,?,?,?,?,?,?,'')`);
  function add(id, count, hours) {
    article.run(id, id, id, at(hours));
    for (let i = 0; i < count; i++) {
      const url = `https://source-${i}.example/${id}`;
      source.run(sourceUrlHash(url), id, url, `Source ${i}`, id, at(hours), at(hours));
    }
  }
  add('popular', 5, 12);
  assert.equal(getNewsHotRanking(db, now, 10)[0].id, 'popular');
  db.exec('BEGIN');
  for (let i = 0; i < 205; i++) add(`newer-${i}`, sourceCount, 1);
  db.exec('COMMIT');
  const ranking = getNewsHotRanking(db, now, 10);
  assert.equal(ranking[0]?.id, 'popular');
  assert.equal(ranking[0].sourceCount, 5);
  assert.ok(ranking.length <= 10);
});
