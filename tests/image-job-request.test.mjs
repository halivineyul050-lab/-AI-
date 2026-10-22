import { test } from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../public/image-job-request.mjs');
test('stalled image request exits waiting without automatically resubmitting', async () => {
  const { fetchImageJob } = await load(); let calls = 0; let signal;
  await assert.rejects(fetchImageJob('/jobs/1', {}, { timeoutMs: 15, fetchImpl: async (_, options) => { calls++; signal = options.signal; return new Promise(() => {}); } }), e => e.code === 'image_wait_timeout' && e.requiresConfirmation);
  assert.equal(calls, 1); assert.equal(signal.aborted, true);
});
test('stalled response body also exits waiting', async () => {
  const { fetchImageJob } = await load();
  await assert.rejects(fetchImageJob('/jobs/1', {}, { timeoutMs: 15, fetchImpl: async () => ({ status: 200, ok: true, json: () => new Promise(() => {}) }) }), e => e.code === 'image_wait_timeout');
});
test('terminal error preserves refund settlement and user cancellation stops waiting', async () => {
  const { fetchImageJob } = await load();
  const problem = { code: 'image_provider_timeout', details: { settlement: { settled: true, released: 20 } } };
  const response = await fetchImageJob('/jobs/1', {}, { fetchImpl: async () => ({ status: 504, ok: false, json: async () => problem }) });
  assert.equal(response.status, 504); assert.deepEqual(await response.json(), problem);
  const controller = new AbortController();
  const pending = fetchImageJob('/jobs/1', { signal: controller.signal }, { fetchImpl: () => new Promise(() => {}) });
  controller.abort(); await assert.rejects(pending, e => e.name === 'AbortError');
});
