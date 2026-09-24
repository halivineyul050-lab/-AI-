import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyProductionMigrations } from '../scripts/apply-production-migrations.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'nikai-release-migrations-'));
  const stageDir = join(root, 'stage');
  const appDir = join(root, 'live');
  mkdirSync(join(stageDir, 'backend', 'mariadb', 'migrations'), { recursive: true });
  mkdirSync(appDir);
  writeFileSync(join(appDir, '.mariadb.cnf'), '[client]\n');
  writeFileSync(join(stageDir, 'backend', 'mariadb', 'migrations', '017_edit_path.sql'), 'ALTER TABLE image_providers ADD COLUMN IF NOT EXISTS edit_path TEXT;\n');
  writeFileSync(join(stageDir, 'backend', 'mariadb', 'migrations', '018_next.sql'), 'CREATE TABLE IF NOT EXISTS next_table (id INT);\n');
  return { root, stageDir, appDir };
}

test('owner applies only pending MariaDB migrations and records each after its SQL succeeds', () => {
  const paths = fixture();
  const calls = [];
  const runCommand = (command, args, options) => {
    calls.push({ command, args, input: options.input });
    if (args.includes('-e') && args.at(-1).includes('SELECT COUNT(*)')) {
      return { status: 0, stdout: args.at(-1).includes('version = 17') ? '1\n' : '0\n', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  try {
    const result = applyProductionMigrations({ ...paths, environment: { NIKAI_DB_ENGINE: 'mariadb', NIKAI_DB_NAME: 'nikai_ai' }, runCommand });
    assert.deepEqual(result.applied, [18]);
    assert.ok(calls.every(({ command, args }) => command === 'mariadb' && args[0].startsWith('--defaults-extra-file=')));
    assert.ok(calls.some(({ input }) => input?.includes('CREATE TABLE IF NOT EXISTS next_table')));
    assert.ok(!calls.some(({ input }) => input?.includes('ALTER TABLE image_providers')));
    const sqlIndex = calls.findIndex(({ input }) => input?.includes('CREATE TABLE IF NOT EXISTS next_table'));
    const recordIndex = calls.findIndex(({ args }) => args.at(-1)?.includes('INSERT INTO schema_migrations'));
    assert.ok(recordIndex > sqlIndex);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('failed MariaDB schema change is not recorded as applied', () => {
  const paths = fixture();
  const calls = [];
  const runCommand = (command, args, options) => {
    calls.push({ args, input: options.input });
    if (options.input) return { status: 1, stdout: '', stderr: 'ALTER denied' };
    return { status: 0, stdout: '0\n', stderr: '' };
  };
  try {
    assert.throws(() => applyProductionMigrations({ ...paths, environment: { NIKAI_DB_ENGINE: 'mariadb' }, runCommand }), /ALTER denied/);
    assert.ok(!calls.some(({ args }) => args.at(-1)?.includes('INSERT INTO schema_migrations')));
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});
