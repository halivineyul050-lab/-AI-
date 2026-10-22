import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { launchSandboxedBrowser } from '../backend/nestdutio/browser.mjs';

test('long conversations scroll inside the viewport and keep the composer reachable', { timeout: 45000 }, async t => {
  const root = resolve(import.meta.dirname, '../public');
  const html = readFileSync(resolve(root, 'nestdutio.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
    const path = resolve(root, `.${pathname}`);
    if (path.startsWith(root) && extname(path) === '.css') {
      try { res.setHeader('Content-Type', 'text/css'); res.end(readFileSync(path)); return; } catch {}
    }
    res.statusCode = 404; res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser, cleanup = async () => {};
  t.after(async () => { await browser?.close(); await cleanup(); await new Promise(r => server.close(r)); });
  const executable = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await (await import('@sparticuz/chromium')).default.executablePath();
  ({ browser, cleanup } = await launchSandboxedBrowser(executable, 20000));
  const page = await browser.newPage();
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 1024, height: 600 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const before = await page.locator('.composer').boundingBox();
    await page.evaluate(() => {
      const log = document.querySelector('#messages');
      log.innerHTML = Array.from({ length: 100 }, (_, i) => `<div class="message user">第 ${i} 条需求：${'请继续调整作品。'.repeat(10)}</div>`).join('');
    });
    const state = await page.evaluate(() => {
      const log = document.querySelector('#messages');
      const box = document.querySelector('.composer').getBoundingClientRect();
      log.scrollTop = log.scrollHeight;
      return { top: box.top, bottom: box.bottom, pageHeight: document.documentElement.scrollHeight, viewport: innerHeight, scrollable: log.scrollHeight > log.clientHeight, scrollTop: log.scrollTop };
    });
    assert.ok(state.bottom <= viewport.height + 1, JSON.stringify({ viewport, state }));
    assert.ok(Math.abs(state.top - before.y) <= 1, 'message growth moved the composer');
    assert.ok(state.pageHeight <= state.viewport + 1, 'conversation expanded the document');
    assert.ok(state.scrollable && state.scrollTop > 0, 'message history must scroll internally');
  }
});
