import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplication } from '../server.mjs';

let app, origin, directory, rejectDelivery = false;
const mails = [];
const config = { RESEND_API_KEY: 'test-secret', FEEDBACK_EMAIL_TO: 'owner@example.test', AUTH_EMAIL_FROM: 'noreply@example.test', FEEDBACK_EMAIL_FROM: '' };
const previous = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
const realFetch = globalThis.fetch;

before(async () => {
  Object.assign(process.env, config);
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url) === 'https://api.resend.com/emails') {
      mails.push(JSON.parse(init.body));
      return { ok: !rejectDelivery, status: rejectDelivery ? 503 : 200, json: async () => ({ id: 'test-receipt' }) };
    }
    assert.ok(String(url).startsWith('http://127.0.0.1:'), 'test must not make other external requests');
    return realFetch(url, init);
  });
  mock.method(console, 'info', () => {});
  mock.method(console, 'error', () => {});
  directory = mkdtempSync(join(tmpdir(), 'nikai-feedback-email-api-'));
  app = buildApplication({ dbPath: join(directory, 'test.db'), logger: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + app.server.address().port;
});

after(async () => {
  await new Promise(resolve => app.server.close(resolve));
  app.db.close();
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  mock.restoreAll();
  rmSync(directory, { recursive: true, force: true });
});

async function submit(message) {
  const response = await fetch(origin + '/api/v1/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'cooperation', message, contactEmail: 'visitor@example.test', pageUrl: '/feedback', consentAccepted: true, consentVersion: '2026-07', company: '' }) });
  const body = await response.json();
  await new Promise(resolve => setImmediate(resolve));
  return { response, body };
}

test('feedback POST emails the validated content as well as its saved metadata', async () => {
  const message = '邮件通知验收：希望了解合作方式，请与我联系。';
  const { response, body } = await submit(message);
  assert.equal(response.status, 201);
  assert.equal(app.db.prepare('SELECT message FROM feedback_messages WHERE id = ?').get(body.data.id).message, message);
  assert.match(mails.at(-1).subject, /合作咨询/);
  assert.ok(mails.at(-1).text.includes(message));
  assert.ok(mails.at(-1).text.includes('visitor@example.test'));
  assert.ok(mails.at(-1).text.includes('/feedback'));
  assert.ok(!mails.at(-1).text.includes('undefined'));
});

test('email provider failure keeps feedback saved and returns received status', async () => {
  rejectDelivery = true;
  const { response, body } = await submit('邮件服务失败时，反馈仍须保存到后台记录。');
  assert.equal(response.status, 201);
  assert.ok(app.db.prepare('SELECT id FROM feedback_messages WHERE id = ?').get(body.data.id));
});
