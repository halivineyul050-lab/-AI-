import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
mock.method(globalThis, 'fetch', async () => { throw new Error('Unmocked mail fetch is forbidden'); });
import { notifyFeedbackEmail } from '../backend/email.mjs';

const feedback = { id: 'feedback-test', category: 'cooperation', submittedAt: '2026-10-14T10:00:00Z', pageUrl: '/feedback', contactEmail: 'visitor@example.test', message: '希望了解合作方式。' };
const env = { RESEND_API_KEY: 'test-secret', FEEDBACK_EMAIL_TO: 'owner@example.test', AUTH_EMAIL_FROM: '泥壳AI <noreply@example.test>' };
const logger = { info() {} };

test('feedback uses the existing verified auth sender and real newline formatting', async () => {
  let request;
  const result = await notifyFeedbackEmail(feedback, env, logger, { fetchImpl: async (url, init) => { request = { url, init }; return { ok: true, json: async () => ({ id: 'receipt-test' }) }; } });
  const body = JSON.parse(request.init.body);
  assert.equal(body.from, env.AUTH_EMAIL_FROM);
  assert.deepEqual(body.to, ['owner@example.test']);
  assert.match(body.subject, /合作咨询/);
  assert.ok(body.text.includes('\n\n希望了解合作方式。'));
  assert.ok(!body.text.includes('\\n'));
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.deepEqual(result, { sent: true, messageId: 'receipt-test' });
});

test('explicit feedback sender overrides auth sender', async () => {
  let from;
  await notifyFeedbackEmail(feedback, { ...env, FEEDBACK_EMAIL_FROM: 'feedback@example.test' }, logger, { fetchImpl: async (_, init) => { from = JSON.parse(init.body).from; return { ok: true, json: async () => ({ id: 'receipt-test' }) }; } });
  assert.equal(from, 'feedback@example.test');
});

test('missing sender, recipient or key never uses a provider test sender', async () => {
  for (const missing of ['AUTH_EMAIL_FROM', 'FEEDBACK_EMAIL_TO', 'RESEND_API_KEY']) {
    const next = { ...env, [missing]: '' };
    const result = await notifyFeedbackEmail(feedback, next, logger, { fetchImpl: async () => { throw new Error('must not send'); } });
    assert.equal(result.skipped, true);
  }
});

test('provider rejection does not report success or reveal credentials', async () => {
  await assert.rejects(notifyFeedbackEmail(feedback, env, logger, { fetchImpl: async () => ({ ok: false, status: 403 }) }), /Resend email returned 403/);
});

test('missing delivery receipt and network timeout do not report success', async () => {
  await assert.rejects(notifyFeedbackEmail(feedback, env, logger, { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /unconfirmed/);
  await assert.rejects(notifyFeedbackEmail(feedback, env, logger, { fetchImpl: async () => { throw new Error('timeout'); } }), /timeout/);
});
