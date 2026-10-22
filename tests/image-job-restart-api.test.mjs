import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApplication } from '../server.mjs';
import { registerUser } from '../backend/auth.mjs';
import { createCreditStore } from '../backend/credits.mjs';
import { createImageJobStore } from '../backend/image-job-store.mjs';
import { createImageProviderStore } from '../backend/image-provider-store.mjs';
import { createSecretBox } from '../backend/image-provider-secrets.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

async function fixture(t, imageFetch) {
  const root = mkdtempSync(join(tmpdir(), 'nikai-job-api-restart-'));
  let calls = 0;
  const options = { dbPath: join(root, 'test.db'), staticDir: root, autoSeed: false, environment: 'test', logger: false,
    imageConfigKey: 'a'.repeat(64), imageTempRoot: join(root, 'images'),
    imageFetch: async () => { calls++; return imageFetch ? imageFetch() : new Response(JSON.stringify({ data: [{ b64_json: png }] })); } };
  let app = buildApplication(options);
  let closed = false;
  const user = await registerUser(app.db, { email: 'restart@example.test', normalizedEmail: 'restart@example.test', displayName: 'Test', password: 'restart-test-password', consentVersion: 'test' });
  const credits = createCreditStore(app.db);
  credits.redeem(user.user.id, credits.createCodes({ credits: 100 })[0].code);
  const store = createImageProviderStore(app.db);
  const provider = store.createProvider({ name: 'Test', baseUrl: 'https://93.184.216.34', encryptedApiKey: createSecretBox(options.imageConfigKey).encrypt('fixture-only') });
  const model = store.createModel({ providerId: provider.id, modelId: 'test', displayName: 'Test', supportedRatios: ['1:1'], maxImages: 1 });
  let address = await app.listen(0, '127.0.0.1');
  let base = `http://127.0.0.1:${address.port}`;
  const headers = { Cookie: `nikai_auth=${user.token}`, 'Content-Type': 'application/json' };
  t.after(async () => { if (!closed) await app.close(); rmSync(root, { recursive: true, force: true }); });
  return {
    get app() { return app; }, userId: user.user.id, calls: () => calls,
    poll: (id, customHeaders = headers) => fetch(`${base}/api/v1/image-generation-jobs/${id}`, { headers: customHeaders }),
    generate: () => fetch(`${base}/api/v1/image-generations`, { method: 'POST', headers: { ...headers, Prefer: 'respond-async' }, body: JSON.stringify({ modelRecordId: model.id, prompt: 'test bird', count: 1, ratio: '1:1', style: '自动' }) }),
    async close() { await app.close(); closed = true; },
    async restart() { if (!closed) await app.close(); app = buildApplication(options); closed = false; address = await app.listen(0, '127.0.0.1'); base = `http://127.0.0.1:${address.port}`; }
  };
}

test('application startup exposes interrupted pending task safely and releases its credits once', async t => {
  const f = await fixture(t);
  const jobs = createImageJobStore(f.app.db, createCreditStore(f.app.db));
  const id = randomUUID();
  jobs.reserve(f.userId, { requestId: 'crashed-request', count: 1 }, id);
  await f.restart();
  const result = await f.poll(id);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'image_job_interrupted');
  assert.deepEqual(createCreditStore(f.app.db).wallet(f.userId), { balance: 100, frozen: 0 });
  assert.equal((await f.poll(id, {})).status, 401);
  assert.equal(f.calls(), 0);
  await f.restart();
  assert.deepEqual(createCreditStore(f.app.db).wallet(f.userId), { balance: 100, frozen: 0 });
});

test('async API persists completed response across restart without replaying provider or charging again', async t => {
  const f = await fixture(t);
  const submitted = await f.generate();
  assert.equal(submitted.status, 202);
  const { jobId } = (await submitted.json()).data;
  let completed;
  for (let attempt = 0; attempt < 50; attempt++) {
    completed = await f.poll(jobId);
    if (completed.status !== 202) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(completed.status, 200);
  const data = (await completed.json()).data;
  assert.equal(data.historySaved, true);
  await f.restart();
  const restored = await f.poll(jobId);
  assert.equal(restored.status, 200);
  assert.deepEqual((await restored.json()).data, data);
  assert.deepEqual(createCreditStore(f.app.db).wallet(f.userId), { balance: 80, frozen: 0 });
  assert.equal(f.calls(), 1);
  const other = await registerUser(f.app.db, { email: 'other@example.test', normalizedEmail: 'other@example.test', displayName: 'Other', password: 'other-test-password', consentVersion: 'test' });
  assert.equal((await f.poll(jobId, { Cookie: `nikai_auth=${other.token}` })).status, 404);
});

test('async submissions during shutdown are rejected and admitted work drains before database closure', async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, async () => { await waiting; return new Response(JSON.stringify({ data: [{ b64_json: png }] })); });
  const submitted = await f.generate();
  assert.equal(submitted.status, 202);
  const { jobId } = (await submitted.json()).data;
  const closing = f.close();
  try {
    const rejected = await f.generate();
    assert.equal(rejected.status, 503);
    assert.equal((await rejected.json()).code, 'image_service_stopping');
    assert.deepEqual(createCreditStore(f.app.db).wallet(f.userId), { balance: 100, frozen: 20 });
    assert.equal(f.app.db.prepare('SELECT COUNT(*) AS count FROM image_generation_jobs').get().count, 1);
  } finally {
    release();
    await closing;
  }
  await f.restart();
  assert.equal((await f.poll(jobId)).status, 200);
  assert.deepEqual(createCreditStore(f.app.db).wallet(f.userId), { balance: 80, frozen: 0 });
  assert.equal(f.calls(), 1);
});

test('forced process termination during actual generation releases tracked credits on next startup', { timeout: 15000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'nikai-job-process-crash-'));
  const path = join(root, 'test.db');
  const childFile = join(root, 'crash-server.mjs');
  const modules = Object.fromEntries(['server.mjs', 'backend/auth.mjs', 'backend/credits.mjs', 'backend/image-provider-store.mjs', 'backend/image-provider-secrets.mjs']
    .map(file => [file, new URL(`../${file}`, import.meta.url).href]));
  writeFileSync(childFile, `
    import { buildApplication } from ${JSON.stringify(modules['server.mjs'])};
    import { registerUser } from ${JSON.stringify(modules['backend/auth.mjs'])};
    import { createCreditStore } from ${JSON.stringify(modules['backend/credits.mjs'])};
    import { createImageProviderStore } from ${JSON.stringify(modules['backend/image-provider-store.mjs'])};
    import { createSecretBox } from ${JSON.stringify(modules['backend/image-provider-secrets.mjs'])};
    const key = 'a'.repeat(64);
    const app = buildApplication({ dbPath: process.argv[2], staticDir: process.argv[3], autoSeed: false,
      environment: 'test', logger: false, imageConfigKey: key,
      imageFetch: async () => { process.send({ providerStarted: true }); return new Promise(() => {}); } });
    const user = await registerUser(app.db, { email: 'crash@example.test', normalizedEmail: 'crash@example.test', displayName: 'Test', password: 'crash-test-password', consentVersion: 'test' });
    const credits = createCreditStore(app.db);
    credits.redeem(user.user.id, credits.createCodes({ credits: 100 })[0].code);
    const store = createImageProviderStore(app.db);
    const provider = store.createProvider({ name: 'Test', baseUrl: 'https://93.184.216.34', encryptedApiKey: createSecretBox(key).encrypt('fixture-only') });
    const model = store.createModel({ providerId: provider.id, modelId: 'test', displayName: 'Test', supportedRatios: ['1:1'], maxImages: 1 });
    const address = await app.listen(0, '127.0.0.1');
    process.send({ port: address.port, token: user.token, userId: user.user.id, modelId: model.id });
  `);
  const child = spawn(process.execPath, ['--no-warnings', childFile, path, root], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  let app;
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
    if (app) await app.close();
    rmSync(root, { recursive: true, force: true });
  });
  const ready = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(new Error(`Crash fixture exited before ready: ${stderr}`)));
    child.once('message', resolve);
  });
  const started = once(child, 'message');
  const submitted = await fetch(`http://127.0.0.1:${ready.port}/api/v1/image-generations`, {
    method: 'POST', headers: { Cookie: `nikai_auth=${ready.token}`, 'Content-Type': 'application/json', Prefer: 'respond-async' },
    body: JSON.stringify({ modelRecordId: ready.modelId, prompt: 'test bird', count: 1, ratio: '1:1', style: '自动' })
  });
  assert.equal(submitted.status, 202);
  const { jobId } = (await submitted.json()).data;
  assert.equal((await started)[0].providerStarted, true);
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  app = buildApplication({ dbPath: path, staticDir: root, autoSeed: false, environment: 'test', logger: false });
  const address = await app.listen(0, '127.0.0.1');
  const result = await fetch(`http://127.0.0.1:${address.port}/api/v1/image-generation-jobs/${jobId}`, { headers: { Cookie: `nikai_auth=${ready.token}` } });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'image_job_interrupted');
  assert.deepEqual(createCreditStore(app.db).wallet(ready.userId), { balance: 100, frozen: 0 });
});
