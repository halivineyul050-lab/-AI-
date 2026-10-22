import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, deleteUserAccount } from '../backend/database.mjs';
import { createGenerator } from '../backend/nestdutio/generator.mjs';
import { createJobs } from '../backend/nestdutio/jobs.mjs';
import { createProjects } from '../backend/nestdutio/projects.mjs';
import { createCreditStore } from '../backend/credits.mjs';

const plan = { name: 'Example', capabilities: [], acceptance: [{ kind: 'visible', target: 'h1' }] };
const artifact = { schemaVersion: 1, ...plan, entry: 'index.html', files: [{ path: 'index.html', content: '<h1>Example</h1>' }] };
test('fixed pricing still records all actual request usage and keeps fixed settlement', async t => {
  const db = openDatabase(':memory:');
  db.prepare(`INSERT INTO users(id,email,normalized_email,display_name,password_hash,password_salt,consent_version)
    VALUES('u','u@example.test','u@example.test','U','hash','salt','test')`).run();
  const credits = createCreditStore(db); credits.redeem('u', credits.createCodes({ credits: 100 })[0].code);
  let calls = 0;
  const config = { ready: true, endpoint: 'https://example.com/v1/chat/completions', model: 'fixture', procurement: {} };
  const generator = createGenerator({ config: () => config, key: () => 'fixture-key' }, { check: async () => ({ ok: true }) }, {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }], fetchImpl: async () => new Response(JSON.stringify({
      usage: { prompt_tokens: 100, completion_tokens: 20 }, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(++calls === 1 ? plan : artifact) } }]
    }))
  });
  const projects = createProjects(db), p = projects.create('u', { name: 'Example' });
  const jobs = createJobs(db, projects, generator, credits, { generationConfig: () => config });
  t.after(() => db.close());
  const task = jobs.submit('u', p.id, { prompt: '展示一个页面', baseVersion: null }, 'fixed-usage-test');
  await jobs.shutdown();
  const result = jobs.get('u', task.id);
  assert.equal(result.state, 'ready'); assert.equal(credits.wallet('u').balance, 80);
  assert.equal(result.usage.requestCount, 2); assert.equal(result.usage.promptTokens, 200); assert.equal(result.usage.completionTokens, 40);
  assert.equal(result.usage.cost, undefined);
  assert.equal(jobs.usageReport()[0].usage.cost.status, 'unconfigured');assert.equal(jobs.usageReport()[0].chargedCredits,20);
  db.exec('PRAGMA foreign_keys=OFF');
  assert.equal(deleteUserAccount(db, 'u'), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nestdutio_request_usage').get().n, 0);
});

test('truncated and missing-usage responses are observed even when generation fails', async () => {
  for (const withUsage of [true, false]) {
    const events = [];
    const gen = createGenerator({ config: () => ({ ready: true, endpoint: 'https://example.com/v1/chat/completions', model: 'fixture' }), key: () => 'fixture-key' }, {}, {
      lookup: async () => [{ address: '8.8.8.8', family: 4 }], fetchImpl: async () => new Response(JSON.stringify({ ...(withUsage ? { usage: { prompt_tokens: 30, completion_tokens: 99 } } : {}), choices: [{ finish_reason: 'length', message: { content: 'incomplete' } }] }))
    });
    await assert.rejects(gen.run({ prompt: 'site' }, { onRequest: event => events.push(event) }));
    assert.equal(events.length, 1); assert.equal(events[0].status, withUsage ? 'reported' : 'missing');
  }
});
