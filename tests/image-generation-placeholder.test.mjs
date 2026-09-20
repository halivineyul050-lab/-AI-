import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildApplication } from '../server.mjs';

test('AI image studio is routed, crawlable, and exposes the complete creation workflow', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nikai-image-placeholder-'));
  const app = buildApplication({
    dbPath: join(directory, 'test.db'),
    logger: false,
    adminToken: 'image-placeholder-admin',
    analyticsSalt: 'image-placeholder-salt'
  });
  try {
    const address = await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/image-generation`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>AI 生图/);
    assert.match(html, /href="\/image-generation"[^>]+aria-current="page"/);
    assert.match(html, /id="studio-mode-generate"/);
    assert.match(html, /id="studio-mode-canvas"/);
    assert.match(html, /id="generation-form"/);
    assert.match(html, /id="prompt-input"[^>]+maxlength="1000"/);
    assert.match(html, /id="reference-input"[^>]+accept="image\/\*"/);
    assert.match(html, /<select name="ratio"/);
    assert.match(html, /<option value="1:1">1:1<\/option>/);
    assert.match(html, /name="style"/);
    assert.match(html, /name="count"/);
    assert.match(html, /id="generation-status"[^>]+aria-live="polite"/);
    assert.match(html, /id="generation-results"/);
    assert.match(html, /id="canvas-stage"/);
    assert.match(html, /id="canvas-export"/);
    assert.match(html, /<script defer src="\/image-generation\.js\?v=/);
    assert.doesNotMatch(html, /api[_-]?key|sk-[a-z0-9]|openai\.com/i);

    const scriptResponse = await fetch(`${base}/image-generation.js`);
    assert.equal(scriptResponse.status, 200);
    const script = await scriptResponse.text();
    assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);

    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.match(sitemap, /\/image-generation<\/loc>/);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('every static site header links to AI image generation exactly once before utilities', () => {
  const pages = readdirSync('.', { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name)
    .filter((name) => readFileSync(name, 'utf8').includes('<nav class="site-nav"'));

  assert.ok(pages.length >= 19);
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const siteNav = html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || '';
    assert.equal((siteNav.match(/href="\/image-generation"/g) || []).length, 1, page);
    assert.ok(siteNav.indexOf('href="/image-generation"') < siteNav.indexOf('href="/utilities"'), page);
  }
  const home = readFileSync('index.html', 'utf8');
  assert.match(home, /class="primary-nav"[\s\S]*href="\/image-generation"[\s\S]*href="\/utilities"/);
});
