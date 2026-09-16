import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('MariaDB backup is consistent, protected, checksummed and retained',()=>{
  const source=readFileSync(new URL('../scripts/backup-mariadb.sh',import.meta.url),'utf8');
  assert.match(source,/set -euo pipefail/);assert.match(source,/--single-transaction/);assert.match(source,/--defaults-extra-file/);assert.match(source,/umask 077/);assert.match(source,/sha256sum/);assert.match(source,/-mtime/);
});
test('MariaDB restore verifies checksum before importing',()=>{
  const source=readFileSync(new URL('../scripts/restore-mariadb.sh',import.meta.url),'utf8');
  assert.ok(source.indexOf('sha256sum -c')<source.indexOf('gzip -cd'));assert.match(source,/--defaults-extra-file/);
});
