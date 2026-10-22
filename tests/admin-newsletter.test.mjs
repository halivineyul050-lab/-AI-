import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApplication } from '../server.mjs';
import { registerUser } from '../backend/auth.mjs';
import { upsertNewsletterSubscription } from '../backend/database.mjs';

test('admin newsletter is private, searchable, paginated and excludes unsubscribe credentials', async t => {
  const root = mkdtempSync(join(tmpdir(), 'nikai-newsletter-admin-'));
  const app = buildApplication({ dbPath: join(root, 'test.db'), environment: 'test', logger: false, adminToken: 'newsletter-test-token' });
  const { port } = await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  const member = await registerUser(app.db, { email: 'member@example.test', normalizedEmail: 'member@example.test', displayName: '订阅用户', password: 'fixture-password', consentVersion: 'test' });
  for (let i = 0; i < 23; i++) {
    const email = i === 0 ? 'reader_100%@example.test' : `reader${i}@example.test`;
    const sub = upsertNewsletterSubscription(app.db, { email, normalizedEmail: email, topicSlugs: [], consentVersion: 'test', source: 'home_engage' }, i === 0 ? member.user.id : null);
    if (i === 0) app.db.prepare('INSERT INTO email_delivery_log(id,subscription_id,digest_key,provider_message_id) VALUES(?,?,?,?)').run(randomUUID(), sub.id, '2026-W43', 'receipt');
    if (i === 22) app.db.prepare("UPDATE newsletter_subscriptions SET status='unsubscribed' WHERE id=?").run(sub.id);
  }
  const request = (query = '', headers = { Authorization: 'Bearer newsletter-test-token' }) => fetch(`http://127.0.0.1:${port}/api/admin/v1/newsletter${query}`, { headers });
  assert.equal((await request('', {})).status, 401);
  assert.equal((await request('', { Cookie: `nikai_auth=${member.token}` })).status, 401);
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const { data } = await response.json();
  assert.equal(data.total, 23); assert.equal(data.items.length, 20);
  assert.equal(data.counts.active, 22); assert.equal(data.counts.unsubscribed, 1);
  assert.doesNotMatch(JSON.stringify(data), /unsubscribeToken|unsubscribe_token|password|token_hash|provider_message_id/);
  const page = (await (await request('?offset=20')).json()).data;
  assert.equal(page.items.length, 3);
  assert.equal(new Set([...data.items, ...page.items].map(s => s.id)).size, 23);
  const match = (await (await request('?q=' + encodeURIComponent('_100%'))).json()).data;
  assert.equal(match.total, 1); assert.equal(match.items[0].accountName, '订阅用户');
  assert.ok(match.items[0].lastSentAt);
  assert.equal((await (await request('?status=unsubscribed')).json()).data.total, 1);
  for (const q of ['?status=bad', '?offset=-1', '?offset=1.5']) assert.equal((await request(q)).status, 422);
});
