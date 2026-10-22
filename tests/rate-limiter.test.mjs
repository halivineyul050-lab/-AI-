import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRateLimiter } from '../backend/rate-limiter.mjs';

test('a burst of unique keys is bounded while existing keys keep their limits', () => {
  let time = 0;
  const limit = createRateLimiter({ now: () => time, maxBuckets: 2 });
  limit('first', 2, 60_000);
  limit('second', 2, 60_000);
  assert.throws(() => limit('third', 2, 60_000), { status: 429, code: 'rate_limited' });
  limit('first', 2, 60_000);
  assert.throws(() => limit('first', 2, 60_000), { status: 429, code: 'rate_limited' });
  time = 60_000;
  assert.doesNotThrow(() => limit('third', 2, 60_000));
});
