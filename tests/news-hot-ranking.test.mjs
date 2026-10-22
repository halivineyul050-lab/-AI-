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


test('hot ranking reads summaries and keeps database round trips bounded above 1000 candidates', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const file of ['schema.sql', 'migrations/003_article_sources.sql', 'migrations/019_article_source_links.sql']) db.exec(readFileSync(new URL('../backend/' + file, import.meta.url), 'utf8'));
  const article = db.prepare("INSERT INTO articles(id,slug,kind,topic,title,excerpt,body_text,cover_url,published_date,read_time,created_at) VALUES (?,?,'news','AI',?,'Summary',?,'','2026-10-22','1 minute',?)");
  const source = db.prepare('INSERT INTO article_source_links(source_url_hash,article_id,source_url,source_name,source_title,source_published_at,discovered_at,feed_url) VALUES (?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  for (let i = 0; i < 1002; i++) {
    const id = i === 1001 ? 'zz-leader' : 'event-' + i;
    article.run(id,id,id,'Large article body '.repeat(i === 1001 ? 100000 : 1),at(i === 1001 ? 12 : 1));
    for (let n = 0; n < (i === 1001 ? 5 : 2); n++) {
      const url = 'https://source-' + n + '.example/' + id;
      source.run(sourceUrlHash(url),id,url,'Source ' + n,id,at(i === 1001 ? 12 : 1),at(1),'');
    }
  }
  db.exec('COMMIT');
  let queries = 0, bodyTransferred = false;
  const batches = [];
  const observed = { prepare(sql) { const statement = db.prepare(sql); return { all(...args) { queries++; if (sql.includes('WHERE article_id IN')) batches.push(args); const rows = statement.all(...args); if (rows.some(row => Object.hasOwn(row, 'body_text'))) bodyTransferred = true; return rows; } }; } };
  const ranking = getNewsHotRanking(observed, now, 10);
  assert.equal(ranking[0].id, 'zz-leader');
  assert.ok(batches.every(batch => batch.length <= 1000));
  assert.ok(batches.at(-1).includes('zz-leader'), 'Leader evidence must be read from the last batch');
  assert.equal(ranking[0].sourceCount, 5);
  assert.equal(ranking.length, 10);
  assert.equal(bodyTransferred, false, 'Ranking must not fetch article bodies');
  assert.ok(queries <= 3, '1002 events require at most one article query and two relation queries; got ' + queries);
});
