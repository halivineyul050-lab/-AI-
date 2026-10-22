import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApplication } from '../server.mjs';
import { registerUser } from '../backend/auth.mjs';
import { createCreditStore } from '../backend/credits.mjs';
import { createImageJobStore } from '../backend/image-job-store.mjs';
import { validateEventBatch } from '../backend/validation.mjs';

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'nikai-first-creation-'));
  const app = buildApplication({ dbPath: join(root, 'test.db'), staticDir: root, autoSeed: false, environment: 'test', logger: false });
  const users = [];
  const credits = createCreditStore(app.db);
  for (const name of ['owner', 'other']) {
    const user = await registerUser(app.db, { email: `${name}@example.test`, normalizedEmail: `${name}@example.test`, displayName: name, password: 'fixture-test-password', consentVersion: 'test' });
    credits.redeem(user.user.id, credits.createCodes({ credits: 10000 })[0].code);
    users.push(user);
  }
  const address = await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  const jobs = createImageJobStore(app.db, credits);
  return { app, credits, jobs, users,
    request: (path, user = users[0], method = 'GET') => fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: user ? { Cookie: `nikai_auth=${user.token}` } : {} }),
    reserve(user = users[0], modelRecordId = 'model-a') {
      const id = randomUUID();
      return { id, reservation: jobs.reserve(user.user.id, { requestId: randomUUID(), count: 1, modelRecordId }, id) };
    },
    complete(job, duration, age = 0) {
      credits.settle(job.reservation.id, 1);
      jobs.complete(job.id, { generationId: randomUUID(), historySaved: true, credits: { balance: 0, frozen: 0, charged: 20, refunded: 0 }, images: [] });
      const end = Date.now() - age;
      app.db.prepare('UPDATE image_generation_jobs SET created_at=?,completed_at=? WHERE id=?').run(new Date(end - duration * 1000).toISOString(), new Date(end).toISOString(), job.id);
    }
  };
}

test('creation context requires authentication and isolates owner pending jobs without content', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/v1/image-creation-context', null)).status, 401);
  const own = f.reserve(); f.reserve(f.users[1]);
  const response = await f.request('/api/v1/image-creation-context');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
  const { data } = await response.json();
  assert.equal(data.everSucceeded, false);
  assert.deepEqual(data.timings, []);
  assert.deepEqual(data.pendingJobs.map(j => ({ id: j.id, modelRecordId: j.modelRecordId })), [{ id: own.id, modelRecordId: 'model-a' }]);
  assert.deepEqual(Object.keys(data.pendingJobs[0]).sort(), ['createdAt', 'id', 'modelRecordId']);
  assert.equal((await f.request(`/api/v1/image-generation-jobs/${own.id}`, f.users[1])).status, 404);
});

test('lifetime success survives clearing cloud history and expired task pruning', async t => {
  const f = await fixture(t); const job = f.reserve(); f.complete(job, 40);
  assert.equal((await f.request('/api/v1/image-history', f.users[0], 'DELETE')).status, 200);
  f.app.db.prepare('UPDATE image_generation_jobs SET expires_at=? WHERE id=?').run(Date.now() - 1, job.id);
  f.jobs.prune();
  assert.equal((await (await f.request('/api/v1/image-creation-context')).json()).data.everSucceeded, true);
  assert.equal((await (await f.request('/api/v1/image-creation-context', f.users[1])).json()).data.everSucceeded, false);
});

test('timings require 20 valid recent completed samples per model and return 20/80 quantiles', async t => {
  const f = await fixture(t);
  for (let i = 1; i <= 19; i++) f.complete(f.reserve(), i);
  assert.deepEqual(f.jobs.summary(f.users[0].user.id).timings, []);
  f.complete(f.reserve(), 20);
  f.complete(f.reserve(), 999, 8 * 86400000);
  f.complete(f.reserve(f.users[1], 'model-b'), 99);
  assert.deepEqual((await (await f.request('/api/v1/image-creation-context')).json()).data.timings,
    [{ modelRecordId: 'model-a', minSeconds: 4.8, maxSeconds: 16.2, sampleCount: 20 }]);
});

test('failed job exposes confirmed release, prior charge, and unknown settlement only to its owner', async t => {
  const f = await fixture(t);
  const zero = f.reserve(); f.jobs.fail(zero.id, { status: 504, code: 'image_provider_timeout', message: 'timeout' });
  const charged = f.reserve(); f.credits.settle(charged.reservation.id, 1); f.jobs.fail(charged.id, { status: 500, code: 'internal_error', message: 'persist failed' });
  for (const [job, settlement] of [[zero, { settled: true, charged: 0, released: 20 }], [charged, { settled: true, charged: 20, released: 0 }]]) {
    const response = await f.request(`/api/v1/image-generation-jobs/${job.id}`);
    assert.deepEqual((await response.json()).details.settlement, settlement);
    assert.equal((await f.request(`/api/v1/image-generation-jobs/${job.id}`, f.users[1])).status, 404);
  }
  const unknown = f.reserve();
  assert.deepEqual(f.jobs.get(unknown.id, f.users[0].user.id).settlement, { settled: false, charged: null, released: null });
});

test('creation funnel event names are accepted without prompt or image properties', () => {
  for (const eventName of ['image_creation_view', 'image_case_select', 'image_generation_submit', 'image_generation_success', 'image_generation_failure', 'image_result_download']) {
    const result = validateEventBatch({ visitorId: 'visitor-test', sessionId: 'session-test', events: [{ eventId: randomUUID(), eventName, clientTime: new Date().toISOString(), pageType: 'creation', path: '/image-generation.html', properties: { caseId: 'poster', prompt: 'private prompt', image: 'private image' } }] });
    assert.deepEqual(result.events[0].properties, { caseId: 'poster' });
  }
});

test('expired task payload is cleared while recent timing metadata survives and old metadata is deleted', async t => {
  const f = await fixture(t);
  const recent = f.reserve(); f.complete(recent, 30);
  const old = f.reserve(); f.complete(old, 40, 8 * 86400000);
  f.app.db.prepare('UPDATE image_generation_jobs SET expires_at=?').run(Date.now() - 1);
  f.jobs.prune();
  assert.equal(f.jobs.get(recent.id, f.users[0].user.id), null);
  const row = f.app.db.prepare('SELECT response_json,error_json,completed_at FROM image_generation_jobs WHERE id=?').get(recent.id);
  assert.equal(row.response_json, null);
  assert.equal(row.error_json, null);
  assert.ok(row.completed_at);
  assert.equal(f.app.db.prepare('SELECT id FROM image_generation_jobs WHERE id=?').get(old.id), undefined);
});
