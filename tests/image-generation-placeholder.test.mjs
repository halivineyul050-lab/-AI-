import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildApplication } from '../server.mjs';

test('AI image placeholder is routed, crawlable, and contains no inactive generator controls', async () => {
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
    assert.match(html, /GPT 图片生成 API/);
    assert.match(html, /即将上线/);
    assert.doesNotMatch(html, /<(?:form|input|textarea)\b/i);
    assert.doesNotMatch(html, /fetch\s*\(/);

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
