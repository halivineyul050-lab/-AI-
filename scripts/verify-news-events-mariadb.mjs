import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase, getNewsHotRanking, getArticle } from '../backend/database.mjs';
import { openMariaDatabase } from '../backend/mariadb-compat.mjs';
import { sourceUrlHash, listArticleSourceLinks } from '../backend/article-source-links.mjs';
import { runNewsPublisherOnce } from '../backend/news-publisher.mjs';
import { attachArticleSources } from '../backend/content-admin.mjs';
import { createTableSql } from './migrate-sqlite-to-mariadb.mjs';
import { applyProductionMigrations } from './apply-production-migrations.mjs';

export function assertIsolatedNewsMariaEnvironment(env) {
  if (env.NIKAI_MARIADB_ISOLATED !== '1' || env.NIKAI_DB_HOST !== '127.0.0.1'
    || !/^nikai_verify_[a-f0-9]{8,32}$/.test(env.NIKAI_DB_NAME || '')
    || !Number.isInteger(Number(env.NIKAI_DB_PORT)) || Number(env.NIKAI_DB_PORT) < 1024 || Number(env.NIKAI_DB_PORT) > 65535
    || env.NIKAI_DB_SOCKET) throw Error('An explicitly isolated loopback MariaDB fixture is required');
}

export async function verifyNewsEventsMariaDb(env) {
  assertIsolatedNewsMariaEnvironment(env);
  let db, sqlite;
  const originalFetch = globalThis.fetch;
  const checks = [];
  try {
    db = openMariaDatabase(env);
    const version = db.prepare('SELECT VERSION() AS version').get().version;
    assert.match(version, /10\.5\.29-MariaDB/);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ?').get(env.NIKAI_DB_NAME).count), 0, 'Fixture database must be empty');
    assert.notEqual(process.env.NIKAI_DB_ENGINE, 'mariadb', 'SQLite schema fixture must not inherit a real database');
    sqlite = openDatabase(':memory:');
    for (const table of ['articles', 'audit_logs', 'content_state', 'news_sync_items']) {
      const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all();
      const indexes = sqlite.prepare(`PRAGMA index_list(${table})`).all().map(index => ({ ...index, columns: sqlite.prepare(`PRAGMA index_info(${index.name})`).all().map(c => c.name) }));
      const constrained = new Set([...columns.filter(c => c.pk).map(c => c.name), ...indexes.flatMap(i => i.columns)]);
      db.exec(createTableSql(table, { columns, constrained }));
      for (const index of indexes.filter(i => i.origin !== 'pk')) db.exec(`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX \`${index.name}\` ON \`${table}\` (${index.columns.map(c => '\`' + c + '\`').join(',')})`);
    }
    sqlite.close(); sqlite = undefined;
    db.exec('CREATE TABLE schema_migrations(version INT PRIMARY KEY,name VARCHAR(191)); INSERT INTO content_state(id,revision) VALUES(1,1)');
    for (let version = 14; version <= 44; version++) if (version !== 19) db.prepare('INSERT INTO schema_migrations(version,name) VALUES(?,?)').run(version, 'fixture-existing');
    const runCommand = (_command, args, options) => {
      try {
        const sql = options.input || args[args.indexOf('-e') + 1];
        if (/^SELECT COUNT/i.test(sql)) return { status: 0, stdout: String(Object.values(db.prepare(sql).get())[0]) };
        db.exec(sql); return { status: 0, stdout: '' };
      } catch (error) { return { status: 1, stderr: error.message }; }
    };
    const migrations = () => applyProductionMigrations({ stageDir: resolve(fileURLToPath(new URL('..', import.meta.url))), appDir: '.', environment: { ...env, NIKAI_DB_ENGINE: 'mariadb' }, runCommand });
    assert.deepEqual(migrations().applied, [19]);
    assert.deepEqual(migrations().applied, []);
    checks.push('missing-019-migration-after-044-and-idempotent-rerun');

    let urls = [], action, calls = 0;
    const feed = 'https://feed.example/rss.xml';
    globalThis.fetch = async (url, options = {}) => {
      if (String(url) === feed) return new Response('<rss><channel>' + urls.map(link => `<item><title>Verified release</title><link>${link}</link><pubDate>${new Date().toUTCString()}</pubDate></item>`).join('') + '</channel></rss>');
      if (String(url) === 'https://model.example/v1/responses') {
        calls++;
        const payload = JSON.parse(options.body), input = JSON.parse(payload.input.find(i => i.role === 'user').content[0].text);
        return Response.json({ output_text: JSON.stringify(action(input)) });
      }
      if (urls.includes(String(url))) return new Response('<html></html>');
      throw Error('Unexpected external request in isolated MariaDB fixture');
    };
    const run = (links, choose, dryRun = false) => {
      urls = links; action = choose;
      return runNewsPublisherOnce({ db, apiKey: 'fixture-only', baseUrl: 'https://model.example', feeds: [feed], dryRun, logger: { warn() {} } });
    };
    const publish = input => ({ action: 'publish_new', targetArticleId: null, sourceIds: input.sources.map(s => s.id), article: { topic: 'AI', title: 'Verified fixture release', excerpt: 'A detailed fixture summary', body: 'The verified fixture release article body.', readTime: '2 minutes' } });
    const first = await run(['https://one.example/event', 'https://two.example/event'], publish);
    assert.equal(first.published, true);
    const id = first.article.id, before = db.prepare('SELECT * FROM articles WHERE id=?').get(id);
    const attached = await run(['https://three.example/event'], input => ({ action: 'attach_sources', targetArticleId: id, sourceIds: input.sources.map(s => s.id), article: null }));
    assert.equal(attached.attached, true);
    assert.deepEqual(db.prepare('SELECT * FROM articles WHERE id=?').get(id), before);
    assert.equal(getNewsHotRanking(db)[0].sourceCount, 3);
    assert.equal(listArticleSourceLinks(db, id, getArticle(db, id)).length, 3);
    const callsBefore = calls;
    assert.equal((await run(['https://three.example/event'], () => { throw Error('Duplicate reached model'); })).reason, 'all_sources_seen');
    assert.equal(calls, callsBefore);
    checks.push('real-mariadb-publish-attach-detail-hot-and-idempotent-collection');
    const state = () => JSON.stringify(['articles', 'article_source_links', 'content_state', 'audit_logs'].map(t => db.prepare('SELECT * FROM ' + t + ' ORDER BY ' + (t === 'article_source_links' ? 'source_url_hash' : 'id')).all()));
    const snapshot = state();
    const dry = await run(['https://four.example/event'], input => ({ action: 'attach_sources', targetArticleId: id, sourceIds: input.sources.map(s => s.id), article: null }), true);
    assert.equal(dry.dryRun, true); assert.equal(state(), snapshot);
    assert.equal((await run(['https://four.example/event'], input => ({ ...publish(input), sourceIds: ['unknown'] }))).reason, 'invalid_model_output');
    assert.equal(state(), snapshot);
    checks.push('dry-run-and-unknown-source-do-not-mutate');
    db.prepare(`INSERT INTO articles(id,slug,kind,topic,title,excerpt,cover_url,body_text,published_date,read_time,status) VALUES(?,?,'news','AI','Other event','Other summary','','Other event article body.','2026-10-22','1 min','published')`).run('other-event', 'other-event');
    assert.throws(() => attachArticleSources(db, 'other-event', [{ link: 'https://new.example/event' }, { link: 'https://one.example/event' }]), { code: 'article_source_already_linked' });
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM article_source_links WHERE article_id=?').get('other-event').count), 0);
    checks.push('partial-source-write-rolls-back-on-ownership-conflict');
    db.exec("CREATE TRIGGER fixture_reject_source BEFORE INSERT ON article_source_links FOR EACH ROW BEGIN IF NEW.source_url LIKE '%reject.example%' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture rollback'; END IF; END");
    const articlesBefore = Number(db.prepare('SELECT COUNT(*) AS count FROM articles').get().count);
    await assert.rejects(() => run(['https://reject.example/event'], publish), /fixture rollback/);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM articles').get().count), articlesBefore);
    db.exec('DROP TRIGGER fixture_reject_source');
    checks.push('trigger-injected-source-failure-rolls-back-new-article');
    const options = { host: env.NIKAI_DB_HOST, port: Number(env.NIKAI_DB_PORT), user: env.NIKAI_DB_USER, password: env.NIKAI_DB_PASSWORD, database: env.NIKAI_DB_NAME, charset: 'utf8mb4_unicode_ci' };
    let left, right;
    try {
      left = await mysql.createConnection(options);
      right = await mysql.createConnection(options);
      await right.query('SET SESSION innodb_lock_wait_timeout=3');
      await left.beginTransaction(); await right.beginTransaction();
      const url = 'https://concurrent.example/event', hash = sourceUrlHash(url), stamp = new Date().toISOString();
      const insert = "INSERT IGNORE INTO article_source_links(source_url_hash,article_id,source_url,source_name,feed_url,source_title,discovered_at) VALUES(?,?,?,'Fixture','','Fixture',?)";
      await left.query(insert, [hash, id, url, stamp]);
      const pending = right.query(insert, [hash, 'other-event', url, stamp]).then(value => ({ value }), error => ({ error }));
      let locked = false;
      for (let i = 0; i < 20; i++) {
        const [rows] = await left.query('SELECT trx_state AS state FROM information_schema.innodb_trx WHERE trx_mysql_thread_id=?', [right.threadId]);
        if (rows.some(row => row.state === 'LOCK WAIT')) { locked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await left.commit();
      const result = await pending;
      if (result.error) throw result.error;
      assert.equal(locked, true, 'Competing insert must actually wait on the first transaction');
      assert.equal(result.value[0].affectedRows, 0);
      const [owner] = await right.query('SELECT article_id FROM article_source_links WHERE source_url_hash=?', [hash]);
      assert.equal(owner[0].article_id, id);
      await right.rollback();
      checks.push('real-concurrent-source-ownership-lock-wait-and-single-winner');
    } finally {
      await Promise.allSettled([left?.rollback(), right?.rollback()]);
      await Promise.allSettled([left?.end(), right?.end()]);
    }
    const loader = await mysql.createConnection(options), timings = [];
    try {
      for (const count of [1000, 10000]) {
        await loader.query('DELETE FROM article_source_links'); await loader.query('DELETE FROM articles');
        const now = Date.now(), articles = [], sources = [];
        for (let i = 0; i <= count; i++) {
          const key = i === 0 ? 'leader' : 'event-' + i, stamp = new Date(now - (i === 0 ? 12 : 1) * 3600000).toISOString();
          articles.push([key, key, key, stamp]);
          for (let n = 0; n < (i === 0 ? 5 : 2); n++) { const url = 'https://source-' + n + '.example/' + key; sources.push([sourceUrlHash(url), key, url, 'Fixture', '', key, stamp, stamp]); }
        }
        await loader.beginTransaction();
        for (let i = 0; i < articles.length; i += 200) await loader.query("INSERT INTO articles(id,slug,title,created_at,kind,topic,excerpt,cover_url,body_text,published_date,read_time,status) VALUES " + articles.slice(i, i + 200).map(() => "(?,?,?,?,'news','AI','Summary','','Body','2026-10-22','1 min','published')").join(','), articles.slice(i, i + 200).flat());
        for (let i = 0; i < sources.length; i += 200) await loader.query('INSERT INTO article_source_links(source_url_hash,article_id,source_url,source_name,feed_url,source_title,source_published_at,discovered_at) VALUES ' + sources.slice(i, i + 200).map(() => '(?,?,?,?,?,?,?,?)').join(','), sources.slice(i, i + 200).flat());
        await loader.commit();
        getNewsHotRanking(db, now);
        const samples = [];
        for (let i = 0; i < 5; i++) { const start = performance.now(), ranking = getNewsHotRanking(db, now); samples.push(performance.now() - start); assert.equal(ranking.length, 10); assert.equal(ranking[0].id, 'leader'); }
        const ordered = [...samples].sort((a,b) => a-b);
        timings.push({ articles: count + 1, sourceRows: sources.length, medianMs: +ordered[2].toFixed(2), maxMs: +ordered[4].toFixed(2), samplesMs: samples.map(n => +n.toFixed(2)) });
      }
    } finally { await Promise.allSettled([loader.rollback()]); await loader.end(); }
    checks.push('mariadb-1001-and-10001-event-ranking-correctness-and-timing');
    return { pass: true, version, checks, database: env.NIKAI_DB_NAME, timings };
  } finally { globalThis.fetch = originalFetch; sqlite?.close(); db?.close(); }
}
