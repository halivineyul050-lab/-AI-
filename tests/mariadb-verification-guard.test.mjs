import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyImageJobsMariaDb } from '../scripts/verify-image-jobs-mariadb.mjs';

test('MariaDB fixture verification rejects production or ambiguous databases before connecting', () => {
  for (const name of [undefined, 'nikai_ai', 'nikai_verify_', 'nikai_verify_test', 'nikai_verify_abc12345_extra']) {
    assert.throws(() => verifyImageJobsMariaDb({ NIKAI_DB_NAME: name }), /isolated.*database/);
  }
});
