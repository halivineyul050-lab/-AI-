import { HttpError } from './validation.mjs';

export function createRateLimiter({ now = Date.now, maxBuckets = 5000 } = {}) {
  const buckets = new Map();
  const rejected = (retryAfter = 1) => new HttpError(429, 'rate_limited', '请求过于频繁，请稍后再试', { retryAfter });
  return function enforce(key, limit, windowMs, cost = 1) {
    const time = now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= time) {
      if (!current && buckets.size >= maxBuckets) {
        for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= time) buckets.delete(bucketKey);
        if (buckets.size >= maxBuckets) throw rejected();
      }
      buckets.set(key, { count: cost, resetAt: time + windowMs });
      return;
    }
    current.count += cost;
    if (current.count > limit) throw rejected(Math.max(Math.ceil((current.resetAt - time) / 1000), 1));
  };
}
