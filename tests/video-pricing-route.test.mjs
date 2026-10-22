import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { buildApplication } from '../server.mjs';

async function setup(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'nikai-pricing-route-'));
  const app = buildApplication({ dbPath: resolve(root, 'test.db'), logger: false, environment: 'test', autoSeed: false });
  const address = await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close();
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(root.startsWith(resolve(tmpdir(), 'nikai-pricing-route-')));
    rmSync(root, { recursive: true, force: true });
  });
  return (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, { redirect: 'manual', ...options });
}

test('extensionless pricing page supports GET and HEAD with its existing scoped security policy', async t => {
  const get = await setup(t);
  const response = await get('/video-pricing');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /视频生成模型完整价格表/);
  assert.match(html, /rel="canonical" href="https:\/\/ontimo\.cn\/video-pricing"/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self' 'unsafe-inline'/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self' https:\/\/ai\.fun\.tv/);
  const head = await get('/video-pricing', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  for (const path of ['/', '/image-generation', '/admin']) {
    const other = await get(path);
    assert.doesNotMatch(other.headers.get('content-security-policy').match(/script-src[^;]+/)[0], /unsafe-inline/);
    assert.doesNotMatch(other.headers.get('content-security-policy'), /ai\.fun\.tv/);
  }
});

test('legacy pricing URLs redirect to the clean address and preserve query parameters', async t => {
  const get = await setup(t);
  for (const path of ['/video-pricing.html', '/video-pricing/']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await get(path + '?resolution=1080p&filter=a%2Fb', { method });
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('location'), '/video-pricing?resolution=1080p&filter=a%2Fb');
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
  }
});

test('all generated public navigation entries use the clean pricing URL', () => {
  const config = JSON.parse(readFileSync('scripts/frontend/site-navigation.json', 'utf8'));
  assert.equal(config.items.find(item => item.id === 'video-pricing').href, '/video-pricing');
  for (const name of Object.keys(config.pages)) {
    const html = readFileSync(`public/${name}`, 'utf8');
    assert.ok(html.includes('href="/video-pricing"'), name);
    assert.ok(!html.includes('href="/video-pricing.html"'), name);
  }
});
