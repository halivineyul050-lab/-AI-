import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplication } from '../server.mjs';

test('pricing page runs its supplied inline interactions with a page-scoped policy', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nikai-pricing-'));
  const app = buildApplication({ dbPath: join(directory, 'test.db'), logger: false, adminToken: 'pricing-test-admin', analyticsSalt: 'pricing-test-salt' });
  try {
    const address = await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;
    const page = await fetch(`${base}/video-pricing.html`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /视频生成模型完整价格表/);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self' 'unsafe-inline'/);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'self' https:\/\/ai\.fun\.tv/);
    for (const path of ['/', '/admin.html']) {
      const other = await fetch(base + path);
      const policy = other.headers.get('content-security-policy');
      assert.doesNotMatch(policy.match(/script-src[^;]+/)[0], /unsafe-inline/);
      assert.doesNotMatch(policy, /ai\.fun\.tv/);
    }
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});
