import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { openMariaDatabase } from '../backend/mariadb-compat.mjs';
import { createCreditStore } from '../backend/credits.mjs';
import { createImageJobStore } from '../backend/image-job-store.mjs';

export function verifyImageJobsMariaDb(environment = process.env) {
  // This harness creates fixtures. It must never run against the live application database.
  if (!/^nikai_verify_[a-f0-9]{8,32}$/.test(environment.NIKAI_DB_NAME || '')) {
    throw new Error('An isolated nikai_verify_<hex> database is required');
  }
  let db;
  const checks = [];
  try {
    db = openMariaDatabase(environment);
    const version = db.prepare('SELECT VERSION() AS version').get().version;
    assert.match(version, /MariaDB/i, 'This check requires actual MariaDB');
    db.exec(`CREATE TABLE users(id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY);
      CREATE TABLE user_email_verifications(user_id VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY,verified_at VARCHAR(32));
      INSERT INTO users(id) VALUES('u'),('U');`);
    db.exec(readFileSync(new URL('../backend/mariadb/migrations/027_credits.sql', import.meta.url), 'utf8'));
    const migration = readFileSync(new URL('../backend/mariadb/migrations/030_image_jobs_runtime.sql', import.meta.url), 'utf8');
    db.exec(migration);
    db.exec(migration);
    checks.push('migration-030-repeatable');
    let credits = createCreditStore(db);
    let jobs = createImageJobStore(db, credits);
    credits.redeem('u', credits.createCodes({ credits: 1000 })[0].code);
    const first = randomUUID();
    const reservation = jobs.reserve('u', { requestId: 'first', count: 1 }, first);
    assert.throws(() => jobs.reserve('u', { requestId: 'duplicate-job', count: 1 }, first));
    assert.deepEqual(credits.wallet('u'), { balance: 1000, frozen: 20 });
    assert.equal(credits.pendingReservations().length, 1);
    assert.equal(jobs.get(first, 'U'), null);
    assert.equal(jobs.get(first, 'u').reservationId, reservation.id);
    checks.push('reservation-task-atomicity-and-exact-owner');

    db.exec(`CREATE TRIGGER reject_job_failure BEFORE UPDATE ON image_generation_jobs FOR EACH ROW
      BEGIN IF NEW.state='failed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='verification failure injection'; END IF; END`);
    assert.throws(() => jobs.recover(), /verification failure injection/);
    assert.deepEqual(credits.wallet('u'), { balance: 1000, frozen: 20 });
    assert.equal(jobs.get(first, 'u').state, 'pending');
    db.exec('DROP TRIGGER reject_job_failure');
    assert.equal(jobs.recover(), 1);
    assert.equal(jobs.recover(), 0);
    assert.deepEqual(credits.wallet('u'), { balance: 1000, frozen: 0 });
    checks.push('refund-state-atomicity-and-idempotent-retry');

    credits.reserve('u', { requestId: 'legacy', count: 1 });
    const charged = randomUUID();
    const chargedReservation = jobs.reserve('u', { requestId: 'charged-before-crash', count: 1 }, charged);
    credits.settle(chargedReservation.id, 1);
    db.close(); db = undefined;
    db = openMariaDatabase(environment);
    credits = createCreditStore(db); jobs = createImageJobStore(db, credits);
    assert.equal(jobs.recover(), 1);
    assert.deepEqual(credits.wallet('u'), { balance: 980, frozen: 20 });
    assert.equal(credits.pendingReservations()[0].request_id, 'legacy');
    assert.equal(jobs.get(charged, 'u').error.code, 'image_job_interrupted');
    checks.push('reconnect-preserves-charges-and-legacy-reservations');

    const completed = randomUUID();
    const completedReservation = jobs.reserve('u', { requestId: 'completed', count: 1 }, completed);
    const wallet = credits.settle(completedReservation.id, 1);
    const data = { generationId: randomUUID(), historySaved: true, credits: { ...wallet, charged: 20, refunded: 0 }, images: [] };
    jobs.complete(completed, { ...data, apiKey: 'verification-only-do-not-persist' });
    db.close(); db = undefined;
    db = openMariaDatabase(environment);
    credits = createCreditStore(db); jobs = createImageJobStore(db, credits);
    assert.deepEqual(jobs.get(completed, 'u').data, data);
    assert.equal(jobs.get(completed, 'U'), null);
    assert.equal(jobs.recover(), 0);
    assert.doesNotMatch(db.prepare('SELECT response_json FROM image_generation_jobs WHERE id=?').get(completed).response_json, /do-not-persist/);
    checks.push('completed-response-persists-without-extra-fields');

    const failed = randomUUID();
    const failedReservation = jobs.reserve('u', { requestId: 'failure', count: 1 }, failed);
    const safe = { status: 504, code: 'image_provider_timeout', message: '生成超时' };
    jobs.fail(failed, safe); jobs.fail(failed, safe);
    assert.deepEqual(credits.wallet('u'), { balance: 960, frozen: 20 });
    assert.equal(credits.ledger('u').filter(entry => entry.reference_id === failedReservation.id).length, 1);
    checks.push('failure-refunds-once');

    const pending = randomUUID();
    jobs.reserve('u', { requestId: 'capacity-a', count: 1 }, pending);
    jobs.reserve('u', { requestId: 'capacity-b', count: 1 }, randomUUID());
    assert.throws(() => jobs.reserve('u', { requestId: 'capacity-overflow', count: 1 }, randomUUID()), error => error.code === 'image_jobs_busy');
    assert.deepEqual(credits.wallet('u'), { balance: 960, frozen: 60 });
    assert.equal(credits.pendingReservations().length, 3);
    db.prepare('UPDATE image_generation_jobs SET expires_at=?').run(Date.now() - 1);
    jobs.prune();
    assert.equal(jobs.get(completed, 'u'), null);
    assert.equal(jobs.get(pending, 'u').state, 'pending');
    assert.equal(jobs.recover(), 2);
    assert.deepEqual(credits.wallet('u'), { balance: 960, frozen: 20 });
    checks.push('capacity-rollback-and-pending-retention');
    return { status: 'passed', version, checks };
  } finally { db?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(verifyImageJobsMariaDb())); }
  catch (error) {
    // Report codes, never connection objects, passwords, SQL parameters or raw database messages.
    console.error(JSON.stringify({ status: 'failed', code: error.code || 'verification_failed' }));
    process.exitCode = 1;
  }
}
