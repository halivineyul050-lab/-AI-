import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplication } from '../server.mjs';
import { openDatabase, getNewsHotRanking } from '../backend/database.mjs';
import { runNewsPublisherOnce } from '../backend/news-publisher.mjs';
import { createAdminContent, attachArticleSources } from '../backend/content-admin.mjs';
import { listArticleSourceLinks } from '../backend/article-source-links.mjs';

const feed = 'https://feed.example/rss.xml';
const articleBody = { topic: 'AI', title: 'A verified release', excerpt: 'A detailed release summary', body: 'A detailed article body with the verified release facts.', readTime: '2 minutes' };
function database(t) {
  assert.notEqual(process.env.NIKAI_DB_ENGINE, 'mariadb', 'This fixture must never use a configured MariaDB');
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  return db;
}
function publisher(t, db) {
  const original = globalThis.fetch;
  let urls = [], decide, modelCalls = 0;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === feed) return new Response('<rss><channel>' + urls.map(link => `<item><title>Verified release</title><link>${link}</link><pubDate>${new Date().toUTCString()}</pubDate></item>`).join('') + '</channel></rss>');
    if (String(url) === 'https://model.example/v1/responses') {
      modelCalls++;
      const request = JSON.parse(options.body);
      const input = JSON.parse(request.input.find(item => item.role === 'user').content[0].text);
      return Response.json({ output_text: JSON.stringify(decide(input)) });
    }
    if (urls.includes(String(url))) return new Response('<html><head></head></html>');
    throw Error('Unexpected network request in isolated fixture');
  };
  return {
    async run(sources, decision, options = {}) {
      urls = sources; decide = decision;
      return runNewsPublisherOnce({ db, apiKey: 'fixture-key', baseUrl: 'https://model.example', feeds: [feed], logger: { warn() {} }, ...options });
    },
    calls: () => modelCalls
  };
}
const publish = input => ({ action: 'publish_new', targetArticleId: null, sourceIds: input.sources.map(s => s.id), article: articleBody });
const context = { actor: 'fixture', requestId: 'fixture' };
function create(db, id, sourceItems = []) {
  return createAdminContent(db, 'articles', { id, ...articleBody, kind: 'news', cover: '', date: new Date().toISOString().slice(0, 10), status: 'published' }, context, { articleSourceItems: sourceItems }).item;
}

test('publisher creates one event, attaches later evidence and skips duplicate collection', async t => {
  const db = database(t), runner = publisher(t, db);
  const first = await runner.run(['https://one.example/release', 'https://two.example/release'], publish);
  assert.equal(first.published, true);
  const saved = db.prepare('SELECT * FROM articles WHERE id = ?').get(first.article.id);
  assert.equal(listArticleSourceLinks(db, saved.id, saved).length, 2);
  const attached = await runner.run(['https://three.example/release'], input => {
    assert.ok(input.recentArticles.some(item => item.id === saved.id));
    return { action: 'attach_sources', targetArticleId: saved.id, sourceIds: input.sources.map(s => s.id), article: null };
  });
  assert.equal(attached.attached, true);
  assert.equal(attached.insertedSourceCount, 1);
  assert.deepEqual(db.prepare('SELECT * FROM articles WHERE id = ?').get(saved.id), saved);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM articles').get().count, 1);
  assert.equal(getNewsHotRanking(db)[0].sourceCount, 3);
  const calls = runner.calls();
  const duplicate = await runner.run(['https://three.example/release'], () => { throw Error('Duplicate must not reach model'); });
  assert.equal(duplicate.reason, 'all_sources_seen');
  assert.equal(runner.calls(), calls);
});

test('publisher rejects unknown source and target IDs without inserting content', async t => {
  const db = database(t), runner = publisher(t, db);
  const unknownSource = await runner.run(['https://one.example/release'], () => ({ action: 'publish_new', targetArticleId: null, sourceIds: ['unknown'], article: articleBody }));
  assert.equal(unknownSource.reason, 'invalid_model_output');
  const unknownTarget = await runner.run(['https://one.example/release'], input => ({ action: 'attach_sources', targetArticleId: 'not-in-anchor-set', sourceIds: [input.sources[0].id], article: null }));
  assert.equal(unknownTarget.reason, 'invalid_model_output');
  assert.equal(db.prepare('SELECT COUNT(*) count FROM articles').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM article_source_links').get().count, 0);
});

test('source ownership conflict rolls back earlier inserts in the attachment transaction', t => {
  const db = database(t);
  create(db, 'first-event', [{ link: 'https://one.example/existing' }]);
  create(db, 'second-event');
  assert.throws(() => attachArticleSources(db, 'second-event', [{ link: 'https://two.example/new' }, { link: 'https://one.example/existing' }]), { code: 'article_source_already_linked' });
  assert.equal(db.prepare('SELECT COUNT(*) count FROM article_source_links WHERE article_id = ?').get('second-event').count, 0);
  assert.equal(db.prepare('SELECT article_id FROM article_source_links').get().article_id, 'first-event');
  db.prepare("UPDATE articles SET status = 'draft' WHERE id = ?").run('second-event');
  assert.throws(() => attachArticleSources(db, 'second-event', [{ link: 'https://two.example/new' }]), { code: 'news_event_changed' });
});

test('invalid new-event evidence rolls back the article and its revision records', t => {
  const db = database(t);
  const before = db.prepare('SELECT * FROM content_state WHERE id = 1').get();
  const auditBefore = db.prepare('SELECT COUNT(*) count FROM audit_logs').get().count;
  assert.throws(() => create(db, 'invalid-event', [{ link: 'https://valid.example/release', feedUrl: 'javascript:invalid' }]), { name: 'TypeError', message: /Source URL/ });
  assert.equal(db.prepare('SELECT COUNT(*) count FROM articles').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM article_source_links').get().count, 0);
  assert.deepEqual(db.prepare('SELECT * FROM content_state WHERE id = 1').get(), before);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM audit_logs').get().count, auditBefore);
});

function persistedState(db) {
  return {
    articles: db.prepare('SELECT * FROM articles ORDER BY id').all(),
    sources: db.prepare('SELECT * FROM article_source_links ORDER BY source_url_hash').all(),
    state: db.prepare('SELECT * FROM content_state ORDER BY id').all(),
    audit: db.prepare('SELECT * FROM audit_logs ORDER BY id').all()
  };
}

test('new-event and attachment dry runs leave all relevant persisted state unchanged', async t => {
  const db = database(t), runner = publisher(t, db);
  const initial = persistedState(db);
  const dryPublish = await runner.run(['https://one.example/release'], publish, { dryRun: true });
  assert.equal(dryPublish.dryRun, true);
  assert.equal(dryPublish.published, false);
  assert.deepEqual(persistedState(db), initial);
  const first = await runner.run(['https://one.example/release'], publish);
  const beforeAttachment = persistedState(db);
  const result = await runner.run(['https://two.example/release'], input => ({ action: 'attach_sources', targetArticleId: first.article.id, sourceIds: input.sources.map(s => s.id), article: null }), { dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.attached, false);
  assert.deepEqual(persistedState(db), beforeAttachment);
});


test('local public hot API validates limits, excludes drafts and exposes only public evidence', async t => {
  assert.notEqual(process.env.NIKAI_DB_ENGINE, 'mariadb');
  const root = mkdtempSync(join(tmpdir(), 'nikai-news-event-api-'));
  let app;
  t.after(async () => { await app?.close(); rmSync(root, { recursive: true, force: true }); });
  app = buildApplication({ dbPath: join(root, 'fixture.db'), autoSeed: false, environment: 'test', logger: false });
  create(app.db, 'public-event', [{ link: 'https://one.example/public' }, { link: 'https://two.example/public' }, { link: 'https://three.example/public' }]);
  create(app.db, 'second-event', [{ link: 'https://one.example/second' }, { link: 'https://two.example/second' }]);
  create(app.db, 'private-event', [{ link: 'https://one.example/private' }, { link: 'https://two.example/private' }, { link: 'https://three.example/private' }, { link: 'https://four.example/private' }]);
  app.db.prepare("UPDATE articles SET status = 'draft' WHERE id = ?").run('private-event');
  const address = await app.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + address.port;
  const response = await fetch(base + '/api/v1/news/hot?limit=1');
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.windowHours, 48);
  assert.equal(data.halfLifeHours, 24);
  assert.ok(Number.isFinite(Date.parse(data.generatedAt)));
  assert.deepEqual(data.items.map(item => item.id), ['public-event']);
  assert.equal(data.items[0].sourceCount, 3);
  const all = await (await fetch(base + '/api/v1/news/hot')).json();
  assert.deepEqual(all.data.items.map(item => item.id), ['public-event', 'second-event']);
  assert.equal(Object.hasOwn(data.items[0], 'heat'), false);
  for (const limit of ['0', '11', '1.5', 'invalid']) {
    assert.equal((await fetch(base + '/api/v1/news/hot?limit=' + limit)).status, 422);
  }
  const detail = await (await fetch(base + '/api/v1/articles/public-event')).json();
  assert.equal(detail.data.sources.length, 3);
  for (const source of detail.data.sources) assert.deepEqual(Object.keys(source).sort(), ['discoveredAt', 'sourceName', 'sourcePublishedAt', 'sourceTitle', 'sourceUrl']);
  assert.equal((await fetch(base + '/api/v1/articles/private-event')).status, 404);
});
