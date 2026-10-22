import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplication } from '../server.mjs';

test('published free-city game serves its actual dependencies and canonical GET/HEAD paths', async t => {
  const root = mkdtempSync(join(tmpdir(), 'nikai-free-city-routes-'));
  const app = buildApplication({ dbPath: join(root, 'test.db'), autoSeed: false, environment: 'test', logger: false });
  const address = await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${address.port}`;
  const page = await fetch(base + '/games/free-city-3d');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<base href="\/games\/free-city-3d\/">/);
  const directory = await (await fetch(base + '/games')).text();
  assert.match(directory, /href="\/games\/free-city-3d"/);
  const cards = [...directory.matchAll(/class="[^"]*\bgame-card\b[^"]*"/g)];
  assert.equal(cards.length, 11);
  assert.match(directory, /11 款小游戏/);
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  assert.match(sitemap, /<loc>[^<]*\/games\/free-city-3d<\/loc>/);
  const gameBase = new URL('/games/free-city-3d/', base);
  const entries = [...html.matchAll(/(?:src|href|data-engine-src)="([^"]+)"/g)].map(match => new URL(match[1], gameBase));
  for (const url of entries) assert.equal((await fetch(url)).status, 200, url.pathname);
  const main = await (await fetch(new URL('main.js', gameBase))).text();
  for (const match of main.matchAll(/from "(\.\/[^\"]+)"/g)) {
    const module = await fetch(new URL(match[1], gameBase));
    assert.equal(module.status, 200, match[1]);
    assert.match(module.headers.get('content-type'), /javascript/);
  }
  for (const method of ['GET', 'HEAD']) {
    const old = await fetch(base + '/games/free-city-3d/index.html?play=1', { method, redirect: 'manual' });
    assert.equal(old.status, 308);
    assert.equal(old.headers.get('location'), '/games/free-city-3d?play=1');
    if (method === 'HEAD') assert.equal((await old.arrayBuffer()).byteLength, 0);
  }
  for (const path of ['/games/free-city-3d/%2e%2e%2findex.html', '/games/free-city-3d/%5cindex.html', '/games/free-city-3d/%00main.js']) {
    assert.equal((await fetch(base + path, { redirect: 'manual' })).status, 404, path);
  }
});
