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
    assert.match(response.headers.get('content-security-policy'), /img-src 'self' data: blob:/);
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
    assert.match(html, /\/image-generation\.css\?v=20260920-2/);
    assert.match(html, /\/image-generation\.js\?v=20260920-2/);
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

test('AI image studio stylesheet defines responsive, accessible creation and canvas states', () => {
  const css = readFileSync('image-generation.css', 'utf8');
  for (const selector of [
    '.generation-composer', '.generation-results', '.result-card', '.canvas-toolbar',
    '.canvas-workspace', '.is-active', '.is-busy', '.has-reference', '.has-results',
    '.is-selected', '.studio-message[data-tone="error"]'
  ]) assert.ok(css.includes(selector), selector);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.inspiration-row\{[^}]*scrollbar-width:none/);
  assert.match(css, /var\(--brand\)/);
  assert.match(css, /var\(--bg-surface\)/);
  assert.doesNotMatch(css, /\.image-generation-main\s*\{[^}]*(?:^|;)width:\s*\d{4,}px/s);
});

test('AI image studio script validates local input and simulates results without network calls', () => {
  const script = readFileSync('image-generation.js', 'utf8');
  assert.match(script, /15\s*\*\s*1024\s*\*\s*1024/);
  assert.match(script, /file\?*\.type\?*\.startsWith\(['"]image\/['"]\)/);
  assert.match(script, /function validateReferenceFile\s*\(/);
  assert.match(script, /function createDemoResults\s*\(/);
  assert.match(script, /startSimulatedGeneration/);
  assert.match(script, /downloadResult/);
  assert.match(script, /sendResultToCanvas/);
  assert.match(script, /URL\.createObjectURL/);
  assert.match(script, /URL\.revokeObjectURL/);
  assert.match(script, /演示结果/);
  assert.match(script, /1000/);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|api[_-]?key|openai\.com/i);

  for (const asset of ['demo-square.svg', 'demo-landscape.svg', 'demo-portrait.svg']) {
    const path = join('assets', 'image-generation', asset);
    assert.match(readFileSync(path, 'utf8'), /<svg[\s>]/);
  }
});

test('AI image studio canvas decodes, edits, deletes, and exports local images', () => {
  const script = readFileSync('image-generation.js', 'utf8');
  assert.match(script, /function createCanvasController\s*\(/);
  assert.match(script, /addImage\s*\(/);
  assert.match(script, /image\.decode\s*\(/);
  assert.match(script, /setPointerCapture\s*\(/);
  assert.match(script, /pointermove/);
  assert.match(script, /removeSelected\s*\(/);
  assert.match(script, /setScale\s*\(/);
  assert.match(script, /setRatio\s*\(/);
  assert.match(script, /Math\.min\([^\n]+Math\.max/);
  assert.match(script, /toBlob\s*\([\s\S]*?,\s*['"]image\/png['"]\s*\)/);
  assert.match(script, /canvas-export/);
  assert.match(script, /Math\.min\(canvas\.width\s*\*\s*\.72\s*\/\s*image\.naturalWidth,\s*canvas\.height\s*\*\s*\.72\s*\/\s*image\.naturalHeight\)/);
});
