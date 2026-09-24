import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('manual rollback selects a previous complete directory and keeps the failed release recoverable', () => {
  const script = readFileSync(new URL('../scripts/rollback-production.sh', import.meta.url), 'utf8');
  assert.match(script, /previous-\*/);
  assert.match(script, /mv "\$app_dir" "\$replaced"/);
  assert.match(script, /mv "\$previous" "\$app_dir"/);
  assert.match(script, /chmod 0755 "\$app_dir"/);
  assert.match(script, /wait_ready/);
});
