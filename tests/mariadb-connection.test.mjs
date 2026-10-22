import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { MariaDbCompat, openMariaDatabase } from '../backend/mariadb-compat.mjs';

test('explicit MariaDB TCP configuration reaches TCP and failed startup terminates its worker', async t => {
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  let worker;
  const original = MariaDbCompat.prototype.call;
  MariaDbCompat.prototype.call = function (...args) { worker = this.worker; return original.apply(this, args); };
  t.after(async () => { MariaDbCompat.prototype.call = original; await worker?.terminate(); });
  try {
    assert.throws(() => openMariaDatabase({ NIKAI_DB_HOST: '127.0.0.1', NIKAI_DB_PORT: String(port), NIKAI_DB_USER: 'fixture', NIKAI_DB_PASSWORD: 'fixture-only', NIKAI_DB_NAME: 'nikai_verify_aabbccdd' }), { code: 'ECONNREFUSED' });
  } finally { MariaDbCompat.prototype.call = original; }
  let timer;
  const stopped = await Promise.race([once(worker, 'exit').then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 1500); })]);
  clearTimeout(timer);
  assert.equal(stopped, true, 'A rejected constructor must not leave a live Worker');
});

test('constructor ping failure releases its newly created worker', async t => {
  const original = MariaDbCompat.prototype.call;
  let worker;
  MariaDbCompat.prototype.call = function () { worker = this.worker; throw Error('fixture ping failure'); };
  t.after(async () => { MariaDbCompat.prototype.call = original; await worker?.terminate(); });
  try { assert.throws(() => new MariaDbCompat({}), /fixture ping failure/); }
  finally { MariaDbCompat.prototype.call = original; }
  let timer;
  const stopped = await Promise.race([once(worker, 'exit').then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 1500); })]);
  clearTimeout(timer);
  assert.equal(stopped, true, 'Constructor failure leaked its Worker');
});
