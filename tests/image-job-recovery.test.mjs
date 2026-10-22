import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../backend/database.mjs';
import { createCreditStore } from '../backend/credits.mjs';
import { createImageJobStore } from '../backend/image-job-store.mjs';
import { createImageGenerationService } from '../backend/services/image-generation.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'nikai-job-recovery-'));
  const path = join(root, 'test.db');
  let db = openDatabase(path);
  // Credit fixtures deliberately omit user-dependent content; credits only require these IDs.
  db.prepare('INSERT INTO users(id,email,normalized_email,display_name,password_hash,password_salt,consent_version) VALUES(?,?,?,?,?,?,?)')
    .run('u', 'u@example.com', 'u@example.com', 'User', 'fixture', 'fixture', 'fixture');
  let credits = createCreditStore(db);
  credits.redeem('u', credits.createCodes({ credits: 1000 })[0].code);
  let jobs = createImageJobStore(db, credits);
  t.after(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
  return {
    get db() { return db; }, get credits() { return credits; }, get jobs() { return jobs; },
    reserve(requestId = randomUUID(), id = randomUUID()) {
      return { id, reservation: jobs.reserve('u', { requestId, count: 1 }, id) };
    },
    reopen() { db.close(); db = openDatabase(path); credits = createCreditStore(db); jobs = createImageJobStore(db, credits); }
  };
}

test('task creation and credit reservation roll back together on duplicate job ID', t => {
  const f = fixture(t);
  const first = f.reserve();
  assert.throws(() => f.reserve('different-request', first.id));
  assert.equal(f.credits.pendingReservations().length, 1);
  assert.deepEqual(f.credits.wallet('u'), { balance: 1000, frozen: 20 });
  assert.equal(f.jobs.get(first.id, 'u').reservationId, first.reservation.id);
});

test('restart recovers tracked pending jobs exactly once without touching legacy reservations', t => {
  const f = fixture(t);
  const tracked = f.reserve();
  f.credits.reserve('u', { requestId: 'legacy', count: 1 });
  f.reopen();
  assert.equal(f.jobs.recover(), 1);
  assert.deepEqual(f.credits.wallet('u'), { balance: 1000, frozen: 20 });
  assert.equal(f.jobs.get(tracked.id, 'u').error.code, 'image_job_interrupted');
  assert.equal(f.jobs.recover(), 0);
  assert.equal(f.credits.ledger('u').filter(e => e.reference_id === tracked.reservation.id).length, 1);
  assert.equal(f.credits.pendingReservations()[0].request_id, 'legacy');
});

test('recovery preserves a recorded charge if the process stopped before final response persistence', t => {
  const f = fixture(t);
  const tracked = f.reserve();
  f.credits.settle(tracked.reservation.id, 1);
  f.reopen();
  assert.equal(f.jobs.recover(), 1);
  assert.deepEqual(f.credits.wallet('u'), { balance: 980, frozen: 0 });
  assert.equal(f.jobs.get(tracked.id, 'u').state, 'failed');
  assert.match(f.jobs.get(tracked.id, 'u').error.message, /云历史/);
  assert.equal(f.jobs.recover(), 0);
});

test('failure refund and task terminal state are atomic and idempotent', t => {
  const f = fixture(t);
  const tracked = f.reserve();
  const safeError = { status: 504, code: 'image_provider_timeout', message: '生成超时' };
  f.jobs.fail(tracked.id, safeError);
  f.jobs.fail(tracked.id, safeError);
  assert.deepEqual(f.credits.wallet('u'), { balance: 1000, frozen: 0 });
  assert.deepEqual(f.jobs.get(tracked.id, 'u').error, safeError);
  assert.equal(f.credits.ledger('u').filter(e => e.reference_id === tracked.reservation.id).length, 1);
});

test('completed response survives reopen and remains private without storing arbitrary fields', t => {
  const f = fixture(t);
  const tracked = f.reserve();
  f.credits.settle(tracked.reservation.id, 1);
  const data = { generationId: randomUUID(), historySaved: true, credits: { balance: 980, frozen: 0, charged: 20, refunded: 0 }, images: [{ id: randomUUID(), mimeType: 'image/png', expiresAt: null, url: '/api/v1/image-history/test/image' }] };
  f.jobs.complete(tracked.id, { ...data, apiKey: 'must-not-persist', localPath: 'private/path' });
  f.reopen();
  assert.equal(f.jobs.recover(), 0);
  assert.deepEqual(f.jobs.get(tracked.id, 'u').data, data);
  assert.equal(f.jobs.get(tracked.id, 'U'), null);
  const row = f.db.prepare('SELECT response_json FROM image_generation_jobs WHERE id=?').get(tracked.id);
  assert.doesNotMatch(row.response_json, /must-not-persist|private\/path/);
});

test('expired terminal tasks are pruned but pending tasks stay recoverable and consume capacity', t => {
  const f = fixture(t);
  const pending = f.reserve();
  const complete = f.reserve();
  f.credits.settle(complete.reservation.id, 0);
  f.jobs.complete(complete.id, { generationId: randomUUID(), historySaved: true, credits: { balance: 1000, frozen: 20, charged: 0, refunded: 20 }, images: [] });
  f.db.prepare('UPDATE image_generation_jobs SET expires_at=?').run(Date.now() - 1);
  f.jobs.prune();
  assert.equal(f.jobs.get(complete.id, 'u'), null);
  assert.equal(f.jobs.get(pending.id, 'u').state, 'pending');
  assert.equal(f.jobs.isPendingReservation(pending.reservation.id), true);
  f.reserve();
  assert.throws(() => f.jobs.assertCapacity('u'), e => e.code === 'image_jobs_busy');
});

test('failed task-state write rolls back refund and allows safe recovery retry', t => {
  const f = fixture(t);
  const tracked = f.reserve();
  f.db.exec("CREATE TRIGGER reject_job_failure BEFORE UPDATE OF state ON image_generation_jobs WHEN NEW.state='failed' BEGIN SELECT RAISE(ABORT, 'task state unavailable'); END");
  assert.throws(() => f.jobs.recover(), /task state unavailable/);
  assert.deepEqual(f.credits.wallet('u'), { balance: 1000, frozen: 20 });
  assert.equal(f.jobs.get(tracked.id, 'u').state, 'pending');
  assert.equal(f.credits.ledger('u').filter(e => e.reference_id === tracked.reservation.id).length, 0);
  f.db.exec('DROP TRIGGER reject_job_failure');
  assert.equal(f.jobs.recover(), 1);
  assert.deepEqual(f.credits.wallet('u'), { balance: 1000, frozen: 0 });
});

test('terminal response persistence failure preserves the prior successful charge', t => {
  const f = fixture(t);
  const tracked = f.reserve();
  f.credits.settle(tracked.reservation.id, 1);
  f.db.exec("CREATE TRIGGER reject_job_completion BEFORE UPDATE OF state ON image_generation_jobs WHEN NEW.state='complete' BEGIN SELECT RAISE(ABORT, 'task response unavailable'); END");
  assert.throws(() => f.jobs.complete(tracked.id, { generationId: randomUUID(), historySaved: true, credits: { balance: 980, frozen: 0, charged: 20, refunded: 0 }, images: [] }), /task response unavailable/);
  f.jobs.fail(tracked.id, { status: 500, code: 'internal_error', message: '任务响应保存失败' });
  assert.deepEqual(f.credits.wallet('u'), { balance: 980, frozen: 0 });
  assert.equal(f.credits.ledger('u').filter(e => e.reference_id === tracked.reservation.id).length, 1);
});

test('service shutdown rejects new reservations while draining a running task before database close', async t => {
  const f = fixture(t);
  let rejectProvider;
  const waiting = new Promise((_, reject) => { rejectProvider = reject; });
  const service = createImageGenerationService({ jobs: f.jobs, creditStore: f.credits,
    imageGateway: { generate: () => waiting }, imageCloudHistory: {}, imageResults: new Map(), activeCreditReservations: new Set(), logger: false });
  const first = service.prepare('u', { count: 1 }, null);
  const running = service.run(first, 'u', {}, {});
  const failure = assert.rejects(running, /provider stopped/);
  const draining = service.close();
  try {
    assert.throws(() => service.prepare('u', { count: 1 }, null), e => e.status === 503 && e.code === 'image_service_stopping');
  } finally {
    rejectProvider(new Error('provider stopped'));
    await failure;
    await draining;
  }
  assert.deepEqual(f.credits.wallet('u'), { balance: 1000, frozen: 0 });
  assert.equal(f.jobs.get(first.id, 'u').state, 'failed');
  assert.equal(f.credits.pendingReservations().length, 0);
});

test('global pending capacity rejects the next reservation without changing its wallet or task rows', t => {
  const f = fixture(t);
  const codes = f.credits.createCodes({ credits: 100, count: 100 });
  const insertUser = f.db.prepare('INSERT INTO users(id,email,normalized_email,display_name,password_hash,password_salt,consent_version) VALUES(?,?,?,?,?,?,?)');
  for (let index = 0; index < 100; index++) {
    const id = `owner-${index}`;
    insertUser.run(id, `${id}@example.com`, `${id}@example.com`, 'Test', 'fixture', 'fixture', 'fixture');
    f.credits.redeem(id, codes[index].code);
    for (let job = 0; job < 2; job++) f.jobs.reserve(id, { requestId: `${id}-${job}`, count: 1 }, randomUUID());
  }
  assert.throws(() => f.reserve(), e => e.status === 429 && e.code === 'image_jobs_busy');
  assert.deepEqual(f.credits.wallet('u'), { balance: 1000, frozen: 0 });
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM credit_reservations').get().count, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM image_generation_jobs').get().count, 200);
});
