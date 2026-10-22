import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyImageJobsMariaDb } from '../scripts/verify-image-jobs-mariadb.mjs';

test('MariaDB fixture verification rejects production or ambiguous databases before connecting', () => {
  for (const name of [undefined, 'nikai_ai', 'nikai_verify_', 'nikai_verify_test', 'nikai_verify_abc12345_extra']) {
    assert.throws(() => verifyImageJobsMariaDb({ NIKAI_DB_NAME: name }), /isolated.*database/);
  }
});

import { assertIsolatedNewsMariaEnvironment, verifyNewsEventsMariaDb } from '../scripts/verify-news-events-mariadb.mjs';

test('news MariaDB verification rejects non-isolated targets before opening a connection', async () => {
  const isolated = { NIKAI_MARIADB_ISOLATED: '1', NIKAI_DB_HOST: '127.0.0.1', NIKAI_DB_PORT: '33307', NIKAI_DB_NAME: 'nikai_verify_aabbccdd' };
  assert.doesNotThrow(() => assertIsolatedNewsMariaEnvironment(isolated));
  for (const changes of [
    { NIKAI_MARIADB_ISOLATED: undefined }, { NIKAI_DB_HOST: '47.93.245.219' },
    { NIKAI_DB_HOST: undefined }, { NIKAI_DB_PORT: '3306.5' }, { NIKAI_DB_PORT: '0' },
    { NIKAI_DB_PORT: '65536' }, { NIKAI_DB_NAME: 'nikai_ai' }, { NIKAI_DB_NAME: undefined },
    { NIKAI_DB_NAME: 'nikai_verify_wrong' }, { NIKAI_DB_SOCKET: '/var/lib/mysql/mysql.sock' }
  ]) await assert.rejects(() => verifyNewsEventsMariaDb({ ...isolated, ...changes }), /explicitly isolated loopback/);
});
