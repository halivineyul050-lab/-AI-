import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplication } from '../server.mjs';
import { launchSandboxedBrowser } from '../backend/nestdutio/browser.mjs';

test('comparison cards keep desktop copy wide and mobile copy and verdict labels readable', { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'nikai-compare-layout-'));
  const app = buildApplication({ dbPath: join(directory, 'test.db'), logger: false });
  let browser, cleanup = async () => {};
  t.after(async () => { await browser?.close(); await cleanup(); await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const address = await app.listen(0, '127.0.0.1');
  const executable = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await (await import('@sparticuz/chromium')).default.executablePath();
  ({ browser, cleanup } = await launchSandboxedBrowser(executable, 20000));
  const page = await browser.newPage();
  for (const width of [1440, 768, 620, 390, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal((await page.goto(`http://127.0.0.1:${address.port}/compare`)).status(), 200);
    const geometry = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      cards: [...document.querySelectorAll('.seo-collection-tool')].map(card => {
        const copy = card.lastElementChild, label = copy.querySelector('dt'), text = document.createRange();
        text.selectNodeContents(label);
        return { cardWidth: card.getBoundingClientRect().width, copyWidth: copy.getBoundingClientRect().width, labelLines: text.getClientRects().length };
      })
    }));
    assert.ok(geometry.cards.length >= 3);
    assert.ok(geometry.scroll <= geometry.client, `horizontal overflow at ${width}px: ${JSON.stringify(geometry)}`);
    for (const card of geometry.cards) {
      assert.ok(card.copyWidth > card.cardWidth * .8, `copy squeezed at ${width}px: ${JSON.stringify(card)}`);
      assert.ok(card.labelLines === 1, `verdict label wrapped at ${width}px`);
    }
  }
  const href = await page.locator('.seo-collection-tool h3 a').first().getAttribute('href');
  assert.equal((await page.goto(`http://127.0.0.1:${address.port}${href}`)).status(), 200);
  assert.ok(await page.locator('h1').innerText());
});
