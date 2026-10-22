import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApplication } from '../server.mjs';
import { registerUser } from '../backend/auth.mjs';

async function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'nikai-admin-route-'));
  const app = buildApplication({ dbPath: join(root, 'test.db'), logger: false, environment: 'test', autoSeed: false, adminToken: 'admin-route-test-only' });
  const address = await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  return { app, get: (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, { redirect: 'manual', ...options }) };
}

test('canonical admin route serves the dashboard with the existing private security policy', async t => {
  const { get } = await setup(t);
  const response = await get('/admin');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /运营与内容中心/);
  assert.match(response.headers.get('cache-control'), /no-store, private/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self';/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /unsafe-inline.*script-src|wasm-unsafe-eval|script-src[^;]*blob:/);
  const head = await get('/admin', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test('legacy and trailing slash URLs redirect to the canonical path and preserve query parameters', async t => {
  const { get } = await setup(t);
  for (const path of ['/admin.html', '/admin/']) {
    const response = await get(path + '?tab=tools&filter=a%2Fb');
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), '/admin?tab=tools&filter=a%2Fb');
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});

test('changing the page URL does not grant anonymous or member accounts management access', async t => {
  const { app, get } = await setup(t);
  assert.equal((await get('/api/admin/v1/summary')).status, 401);
  const member = await registerUser(app.db, { displayName: '路由测试', email: 'route@example.test', normalizedEmail: 'route@example.test', password: 'route-test-password', consentVersion: '2026-07' });
  const headers = { Cookie: `nikai_auth=${member.token}` };
  assert.equal((await get('/api/admin/v1/summary', { headers })).status, 401);
  app.db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(member.user.id);
  assert.equal((await get('/api/admin/v1/summary', { headers })).status, 200);
});

test('the authorized account entry points to the canonical admin route', () => {
  const html = readFileSync(new URL('../public/auth.html', import.meta.url), 'utf8');
  assert.match(html, /id="admin-entry" href="\/admin"/);
});
