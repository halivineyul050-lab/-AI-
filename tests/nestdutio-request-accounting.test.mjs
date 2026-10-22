import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { inspectUsage, costForUsage, createRequestLedger, validateProcurement } from '../backend/nestdutio/request-accounting.mjs';

test('actual usage retains cache and reasoning breakdown without double counting', () => {
  const usage = inspectUsage({ usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, prompt_tokens_details: { cached_tokens: 60 }, completion_tokens_details: { reasoning_tokens: 30 } } });
  assert.equal(usage.status, 'reported'); assert.equal(usage.cachedInputTokens, 60); assert.equal(usage.reasoningTokens, 30);
  assert.equal(inspectUsage({}).status, 'missing');
  assert.equal(inspectUsage({ usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 99 } }).status, 'invalid');
  assert.equal(inspectUsage({ usage: { prompt_tokens: 2, completion_tokens: 3, prompt_cache_hit_tokens: 3 } }).status, 'invalid');
});

test('procurement cost is exact and cannot invent unknown or missing-cache prices', () => {
  const usage = inspectUsage({ usage: { prompt_tokens: 1000000, completion_tokens: 1000000 } });
  assert.equal(costForUsage(usage, {}).status, 'unconfigured');
  assert.equal(costForUsage(usage, { inputPerMillion: 0.000001, outputPerMillion: 0.000002 }).amount, '0.000003000000');
  const rates = { inputPerMillion: 2, outputPerMillion: 8, cacheMode: 'reported', cachedInputPerMillion: 0.2 };
  assert.equal(costForUsage(usage, rates).status, 'cache_breakdown_missing');
  const cached = inspectUsage({ usage: { prompt_tokens: 1000000, completion_tokens: 0, prompt_cache_hit_tokens: 500000 } });
  assert.equal(costForUsage(cached, rates).amount, '1.100000000000');
  assert.throws(() => validateProcurement({ currency: 'BTC' }));
  assert.throws(() => validateProcurement({ inputPerMillion: -1 }));
});

test('request ledger deduplicates retries, retains missing usage, and hides procurement from members', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE nestdutio_tasks(id TEXT PRIMARY KEY)');
  db.exec(readFileSync(new URL('../backend/migrations/043_nestdutio_request_usage.sql', import.meta.url), 'utf8'));
  db.prepare("INSERT INTO nestdutio_tasks VALUES('task')").run();
  const ledger = createRequestLedger(db), rates = { inputPerMillion: 2, outputPerMillion: 8 };
  const event = { sequence: 1, phase: 'planning', model: 'test', httpStatus: 200, status: 'reported', usage: inspectUsage({ usage: { prompt_tokens: 100, completion_tokens: 20 } }) };
  ledger.record('task', event, rates); ledger.record('task', event, rates);
  assert.equal(ledger.summary('task').requestCount, 1);
  assert.equal(ledger.summary('task').promptTokens, 100);
  assert.equal(ledger.summary('task').cost, undefined);
  assert.equal(ledger.summary('task', true).cost.amount, '0.000360000000');
  ledger.record('task', { sequence: 2, phase: 'generating', model: 'test', httpStatus: 200, status: 'missing', usage: inspectUsage({}) }, rates);
  assert.equal(ledger.summary('task').status, 'partial');
  assert.equal(ledger.summary('task').promptTokens, 100);
  assert.equal(ledger.summary('task', true).cost.amount, null);
  assert.equal(ledger.summary('old-task').promptTokens, null);
  db.close();
});
