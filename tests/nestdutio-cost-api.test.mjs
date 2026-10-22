import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplication } from '../server.mjs';
import { registerUser } from '../backend/auth.mjs';

test('only admins can configure procurement and read cost reports; member config never includes procurement', async t => {
  const root = mkdtempSync(join(tmpdir(), 'nikai-cost-api-'));
  const app = buildApplication({ dbPath: join(root, 'db.sqlite'), logger: false, adminToken: 'test-admin-cost-token' });
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  const address = await app.listen(0, '127.0.0.1'), base = `http://127.0.0.1:${address.port}`;
  const request = (path, options = {}) => fetch(base + path, options);
  assert.equal((await request('/api/admin/v1/nestdutio/usage')).status, 401);
  const member = await registerUser(app.db, { email: 'cost@example.test', normalizedEmail: 'cost@example.test', displayName: 'Cost', password: 'long-safe-password', consentVersion: 'test' });
  assert.ok([401, 403].includes((await request('/api/admin/v1/nestdutio/usage', { headers: { Cookie: `nikai_auth=${member.token}` } })).status));
  const response = await request('/api/admin/v1/nestdutio/provider', { method: 'PUT', headers: { Authorization: 'Bearer test-admin-cost-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false, mode: 'inherit', procurement: { currency: 'USD', inputPerMillion: 2, outputPerMillion: 8 } }) });
  assert.equal(response.status, 200, await response.clone().text());
  const adminConfig = (await response.json()).data;
  assert.equal(adminConfig.procurement.currency, 'USD'); assert.equal(adminConfig.billing.mode, 'fixed');
  const publicConfig = (await (await request('/api/v1/nestdutio/config')).json()).data;
  assert.equal(publicConfig.procurement, undefined);
  const report = await request('/api/admin/v1/nestdutio/usage', { headers: { Authorization: 'Bearer test-admin-cost-token' } });
  assert.equal(report.status, 200); assert.deepEqual((await report.json()).data.items, []);
});
