import { HttpError } from '../validation.mjs';

const counter = n => Number.isSafeInteger(n) && n >= 0 && n <= 200000000;
const invalid = () => { throw new HttpError(422, 'nestdutio_procurement_invalid', '请检查采购价格、币种与缓存计价方式'); };
export const defaultProcurement = Object.freeze({ currency: 'CNY', inputPerMillion: null, outputPerMillion: null, cacheMode: 'none', cachedInputPerMillion: null });
export function validateProcurement(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const p = { ...defaultProcurement, ...input };
  if (!['CNY', 'USD'].includes(p.currency) || !['none', 'reported'].includes(p.cacheMode)) invalid();
  for (const key of ['inputPerMillion', 'outputPerMillion', 'cachedInputPerMillion']) {
    const n = p[key]; if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e9 || Number(n.toFixed(6)) !== n)) invalid();
  }
  return Object.fromEntries(Object.keys(defaultProcurement).map(key => [key, p[key]]));
}
export function inspectUsage(body) {
  const u = body?.usage;
  if (!u) return { status: 'missing' };
  const promptTokens = u.prompt_tokens, completionTokens = u.completion_tokens;
  const cachedInputTokens = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? null;
  const reasoningTokens = u.completion_tokens_details?.reasoning_tokens ?? null;
  const totalTokens = u.total_tokens ?? null;
  if (!counter(promptTokens) || !counter(completionTokens) ||
    (cachedInputTokens !== null && (!counter(cachedInputTokens) || cachedInputTokens > promptTokens)) ||
    (reasoningTokens !== null && (!counter(reasoningTokens) || reasoningTokens > completionTokens)) ||
    (totalTokens !== null && (!counter(totalTokens) || totalTokens !== promptTokens + completionTokens))) return { status: 'invalid' };
  return { status: 'reported', promptTokens, completionTokens, cachedInputTokens, reasoningTokens, totalTokens };
}
const micro = n => BigInt(n.toFixed(6).replace('.', ''));
function decimal(pico) { const n = BigInt(pico); return `${n / 1000000000000n}.${String(n % 1000000000000n).padStart(12, '0')}`; }
export function costForUsage(usage, input = {}) {
  const p = validateProcurement(input), result = { currency: p.currency, amount: null, amountPico: null };
  if (p.inputPerMillion === null || p.outputPerMillion === null || (p.cacheMode === 'reported' && p.cachedInputPerMillion === null)) return { ...result, status: 'unconfigured' };
  if (usage.status !== 'reported') return { ...result, status: 'usage_unavailable' };
  if (p.cacheMode === 'reported' && usage.cachedInputTokens === null) return { ...result, status: 'cache_breakdown_missing' };
  const cached = p.cacheMode === 'reported' ? usage.cachedInputTokens : 0;
  const amount = BigInt(usage.promptTokens - cached) * micro(p.inputPerMillion) + BigInt(usage.completionTokens) * micro(p.outputPerMillion) + BigInt(cached) * micro(p.cachedInputPerMillion ?? 0);
  return { ...result, status: 'available', amount: decimal(amount), amountPico: String(amount) };
}

export function createRequestLedger(db) {
  let enabled = true;
  try { db.prepare('SELECT task_id FROM nestdutio_request_usage LIMIT 1').get(); }
  catch (error) { if (db.backend !== 'mariadb' && /no such table: nestdutio_request_usage/.test(error.message)) enabled = false; else throw error; }
  function record(taskId, event, procurement = {}) {
    if (!enabled) return;
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1 || event.sequence > 24) throw Error('Invalid request sequence');
    const pricing = validateProcurement(procurement);
    const usage = event.usage?.status === 'reported' ? inspectUsage({ usage: { prompt_tokens: event.usage.promptTokens, completion_tokens: event.usage.completionTokens,
      ...(event.usage.cachedInputTokens == null ? {} : { prompt_cache_hit_tokens: event.usage.cachedInputTokens }),
      ...(event.usage.reasoningTokens == null ? {} : { completion_tokens_details: { reasoning_tokens: event.usage.reasoningTokens } }) } }) : { status: event.usage?.status === 'invalid' ? 'invalid' : 'missing' };
    const value = { sequence: event.sequence, phase: String(event.phase).slice(0, 32), model: String(event.model).slice(0, 120),
      status: ['reported', 'missing', 'invalid', 'http_error', 'transport_error', 'invalid_response'].includes(event.status) ? event.status : 'invalid',
      httpStatus: Number.isSafeInteger(event.httpStatus) ? event.httpStatus : null, usage, pricing, cost: costForUsage(usage, pricing) };
    const document = JSON.stringify(value);
    const prior = db.prepare('SELECT document FROM nestdutio_request_usage WHERE task_id=? AND request_index=?').get(taskId, event.sequence);
    if (prior) { if (prior.document !== document) throw Error('Request usage conflict'); return; }
    db.prepare('INSERT INTO nestdutio_request_usage(task_id,request_index,document,created_at) VALUES(?,?,?,?)').run(taskId, event.sequence, document, new Date().toISOString());
  }
  function summary(taskId, includeCost = false) {
    const rows = enabled ? db.prepare('SELECT document FROM nestdutio_request_usage WHERE task_id=? ORDER BY request_index').all(taskId).map(row => JSON.parse(row.document)) : [];
    const valid = rows.filter(row => row.usage.status === 'reported');
    const status = !rows.length ? 'unavailable' : valid.length === rows.length ? 'complete' : valid.length ? 'partial' : 'unavailable';
    const result = { status, requestCount: rows.length, reportedRequests: valid.length, unknownRequests: rows.length - valid.length,
      promptTokens: valid.length ? valid.reduce((n, r) => n + r.usage.promptTokens, 0) : null,
      completionTokens: valid.length ? valid.reduce((n, r) => n + r.usage.completionTokens, 0) : null };
    if (includeCost) {
      const currencies = new Set(rows.map(row => row.cost.currency));
      const available = rows.length && rows.every(row => row.cost.status === 'available') && currencies.size === 1;
      const amount = available ? rows.reduce((n, row) => n + BigInt(row.cost.amountPico), 0n) : null;
      result.cost = { status: available ? 'available' : !rows.length ? 'unavailable' : rows.find(row => row.cost.status !== 'available')?.cost.status ?? 'mixed_currency', currency: currencies.size === 1 ? [...currencies][0] : null, amount: amount === null ? null : decimal(amount) };
      result.requests = rows;
    }
    return result;
  }
  return { enabled, record, summary };
}
