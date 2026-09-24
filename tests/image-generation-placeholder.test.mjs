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
    assert.doesNotMatch(html, /studio-mode-canvas|canvas-panel|canvas-stage|送入画布|图片画布/);
    assert.match(html, /id="studio-mode-history"[^>]+aria-controls="history-panel"/);
    assert.match(html, /id="generation-form"/);
    assert.match(html, /id="model-select"[^>]+name="modelRecordId"/);
    assert.match(html, /id="prompt-input"[^>]+maxlength="1000"/);
    assert.match(html, /id="reference-input"[^>]+accept="image\/png,image\/jpeg,image\/webp"[^>]+aria-describedby="reference-help reference-error"/);
    assert.match(html, /id="reference-trigger"[^>]+aria-describedby="reference-help reference-error"/);
    assert.match(html, /id="reference-error"[^>]+role="alert"/);
    assert.match(html, /<select id="ratio-select" name="ratio"/);
    assert.match(html, /name="style"/);
    assert.match(html, /name="count"/);
    assert.match(html, /id="generation-status"[^>]+aria-live="polite"/);
    assert.match(html, /id="generation-results"/);
    assert.match(html, /id="history-panel"[^>]+role="tabpanel"/);
    for (const id of ['history-status', 'history-grid', 'history-empty', 'history-clear']) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, /<script type="module" src="\/image-generation\.js\?v=/);
    assert.match(html, /\/image-generation\.css\?v=20260924-studio-1/);
    assert.match(html, /\/image-generation\.js\?v=20260924-reference-1/);
    assert.doesNotMatch(html, /api[_-]?key|sk-[a-z0-9]|openai\.com/i);

    const scriptResponse = await fetch(`${base}/image-generation.js`);
    assert.equal(scriptResponse.status, 200);
    const script = await scriptResponse.text();
    assert.match(script, /fetch\(['"]\/api\/v1\/image-models['"]/);
    assert.match(script, /fetch\(['"]\/api\/v1\/image-generations['"]/);

    const historyScriptResponse = await fetch(`${base}/image-generation-history.js`);
    assert.equal(historyScriptResponse.status, 200);
    assert.match(historyScriptResponse.headers.get('content-type'), /javascript/);
    assert.match(await historyScriptResponse.text(), /export function createImageHistory/);

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

test('AI image studio stylesheet defines responsive creation and history states without canvas styles', () => {
  const css = readFileSync('image-generation.css', 'utf8');
  for (const selector of [
    '.generation-composer', '.generation-results', '.result-card', '.is-active',
    '.is-busy', '.has-reference', '.has-results', '.studio-message[data-tone="error"]'
  ]) assert.ok(css.includes(selector), selector);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.inspiration-row\{[^}]*scrollbar-width:none/);
  assert.match(css, /var\(--brand\)/);
  assert.match(css, /var\(--bg-surface\)/);
  assert.doesNotMatch(css, /\.image-generation-main\s*\{[^}]*(?:^|;)width:\s*\d{4,}px/s);
  for (const selector of ['.history-panel', '.history-grid', '.history-card', '.history-empty']) assert.ok(css.includes(selector), selector);
  assert.match(css, /@media\(max-width:640px\)[\s\S]*\.history-grid\{[^}]*grid-template-columns:1fr/);
  assert.doesNotMatch(css, /\.canvas-|#canvas-/);
});

test('AI image studio script validates local input and connects generation to configured models', () => {
  const script = readFileSync('image-generation.js', 'utf8');
  assert.match(script, /10\s*\*\s*1024\s*\*\s*1024/);
  assert.match(script, /image\/png/);
  assert.match(script, /function validateReferenceFile\s*\(/);
  assert.match(script, /function loadImageModels\s*\(/);
  assert.match(script, /submitImageGeneration/);
  assert.match(script, /downloadResult/);
  assert.doesNotMatch(script, /sendResultToCanvas|createCanvasController|validateCanvasFile|canvas-stage|canvas-export/);
  assert.match(script, /new AbortController\s*\(/);
  assert.match(script, /new FormData\s*\(/);
  assert.match(script, /URL\.createObjectURL/);
  assert.match(script, /URL\.revokeObjectURL/);
  assert.match(script, /1000/);
  assert.doesNotMatch(script, /createDemoResults|startSimulatedGeneration|演示结果|api[_-]?key|openai\.com/i);
});

test('AI image studio has no canvas editing mode or result action', () => {
  const html = readFileSync('image-generation.html', 'utf8');
  const script = readFileSync('image-generation.js', 'utf8');
  assert.doesNotMatch(html, /canvas-panel|canvas-stage|canvas-upload|studio-mode-canvas|送入画布/);
  assert.doesNotMatch(script, /createCanvasController|sendResultToCanvas|validateCanvasFile|canvas-stage|canvas-export/);
});
