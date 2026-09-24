import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';

test('MariaDB backup is consistent, protected, checksummed and retained',()=>{
  const source=readFileSync(new URL('../scripts/backup-mariadb.sh',import.meta.url),'utf8');
  assert.match(source,/set -euo pipefail/);assert.match(source,/--single-transaction/);assert.match(source,/--defaults-extra-file/);assert.match(source,/umask 077/);assert.match(source,/sha256sum/);assert.match(source,/-mtime/);
});

const bash = process.platform === 'win32'
  ? join(dirname(dirname(spawnSync('where.exe', ['git'], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)[0])), 'bin', 'bash.exe')
  : 'bash';
const shellPath = (value) => process.platform === 'win32' ? value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`) : value;

for (const format of ['digest', 'legacy', 'legacy-binary', 'renamed', 'mismatch', 'malformed']) {
  test(`MariaDB restore executes checksum verification for ${format} sidecars`, () => {
    const root = mkdtempSync(join(tmpdir(), 'nikai-restore-'));
    try {
      const script = join(root, 'restore.sh');
      const dump = join(root, 'renamed dump.sql.gz');
      const capture = join(root, 'imported.sql');
      const sql = 'CREATE TABLE restore_probe (id INT);\n';
      const bytes = gzipSync(sql);
      const digest = createHash('sha256').update(bytes).digest('hex');
      writeFileSync(script, readFileSync(new URL('../scripts/restore-mariadb.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
      writeFileSync(join(root, 'mariadb'), '#!/usr/bin/env bash\ncat > "$RESTORE_CAPTURE"\n', { mode: 0o755 });
      writeFileSync(dump, bytes);
      const sidecars = {
        digest: `${digest}\n`, legacy: `${digest}  ${shellPath(dump)}\n`,
        'legacy-binary': `${digest} *${shellPath(dump)}\n`,
        renamed: `${digest}  /old/location/original.sql.gz\n`,
        mismatch: `${'0'.repeat(64)}  /old/location/original.sql.gz\n`, malformed: `${digest}garbage\n`
      };
      writeFileSync(`${dump}.sha256`, sidecars[format]);
      const result = spawnSync(bash, ['-c', 'export PATH="$1:$PATH"; bash "$2" "$3"', 'restore-test', shellPath(root), shellPath(script), shellPath(dump)], {
        encoding: 'utf8', timeout: 10000, env: { ...process.env, RESTORE_CAPTURE: shellPath(capture) }
      });
      assert.ifError(result.error);
      if (format === 'mismatch' || format === 'malformed') {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, format === 'mismatch' ? /Checksum mismatch/ : /Invalid SHA-256/);
        assert.equal(existsSync(capture), false, 'invalid backups must never reach the database importer');
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(readFileSync(capture, 'utf8'), sql);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
test('MariaDB restore validates the sidecar digest against its exact dump before importing',()=>{
  const source=readFileSync(new URL('../scripts/restore-mariadb.sh',import.meta.url),'utf8');
  assert.match(source,/\[\[ "\$expected_checksum" =~ \^\[\[:xdigit:\]\]\{64\}\$ \]\]/);
  assert.match(source,/sha256sum "\$dump"/);
  assert.ok(source.indexOf('expected_checksum')<source.indexOf('gzip -cd'));assert.match(source,/--defaults-extra-file/);
});
