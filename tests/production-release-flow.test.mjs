import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const scriptsDir = new URL('../scripts/', import.meta.url);
const canRun = process.platform === 'linux' && process.getuid?.() === 0
  && spawnSync('getent', ['group', 'nikai']).status === 0;

function fixture(failNewService = false) {
  const root = mkdtempSync(join(tmpdir(), 'nikai-release-flow-'));
  const appDir = join(root, 'live');
  const snapshotDir = join(root, 'backups');
  const source = join(root, 'source');
  const archive = join(root, 'release.tgz');
  mkdirSync(join(appDir, 'scripts'), { recursive: true });
  mkdirSync(join(appDir, 'tests'));
  mkdirSync(join(appDir, 'data'));
  mkdirSync(join(appDir, 'imports'));
  mkdirSync(snapshotDir);
  mkdirSync(join(source, 'scripts'), { recursive: true });
  mkdirSync(join(source, 'tests'));
  mkdirSync(join(source, 'imports'));
  writeFileSync(join(appDir, '.env'), 'NIKAI_DB_ENGINE=sqlite\n');
  writeFileSync(join(appDir, '.env.before-restore'), 'old secret\n');
  writeFileSync(join(appDir, 'server.mjs'), "export const version = 'old';\n");
  writeFileSync(join(appDir, 'data', 'retained.txt'), 'persistent');
  writeFileSync(join(appDir, 'imports', 'uploaded.csv'), 'retained import');
  writeFileSync(join(appDir, 'tests', 'stale.test.mjs'), "import { test } from 'node:test'; test('stale', () => { throw Error('old test must not run'); });\n");
  writeFileSync(join(appDir, 'scripts', 'backup-database.sh'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(join(appDir, 'scripts', 'backup-database.sh'), 0o755);
  writeFileSync(join(root, 'ready'), '{"database":true}\n');
  writeFileSync(join(root, 'service.sh'), `#!/usr/bin/env bash\nif [[ "$1" == start ]] && ${failNewService ? 'true' : 'false'} && grep -q "version = 'new'" '${appDir}/server.mjs'; then exit 1; fi\nexit 0\n`);
  chmodSync(join(root, 'service.sh'), 0o755);

  const packageJson = { name: 'release-fixture', version: '1.0.0', private: true, type: 'module', scripts: { test: 'node --test tests/*.test.mjs' } };
  writeFileSync(join(source, 'package.json'), JSON.stringify(packageJson));
  writeFileSync(join(source, 'package-lock.json'), JSON.stringify({ name: 'release-fixture', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'release-fixture', version: '1.0.0' } } }));
  writeFileSync(join(source, 'server.mjs'), "export const version = 'new';\n");
  writeFileSync(join(source, 'tests', 'current.test.mjs'), "import { test } from 'node:test'; test('current release', () => {});\n");
  writeFileSync(join(source, 'imports', 'template.csv'), 'new template');
  for (const name of ['release-production.sh', 'rollback-production.sh', 'active-database-backup.mjs', 'apply-production-migrations.mjs']) {
    cpSync(new URL(name, scriptsDir), join(source, 'scripts', name));
  }
  execFileSync('tar', ['-czf', archive, '-C', source, '.']);
  return { root, appDir, snapshotDir, archive, service: join(root, 'service.sh') };
}

function release(paths) {
  return spawnSync('bash', [new URL('release-production.sh', scriptsDir).pathname, paths.archive, 'fixture-release'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NIKAI_RELEASE_APP_DIR: paths.appDir,
      NIKAI_RELEASE_SNAPSHOT_DIR: paths.snapshotDir,
      NIKAI_RELEASE_READY_URL: `file://${join(paths.root, 'ready')}`,
      NIKAI_RELEASE_SERVICE_CMD: paths.service
    }
  });
}

test('release ignores stale live tests and switches a complete clean tree', { skip: !canRun }, () => {
  const paths = fixture();
  try {
    const result = release(paths);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(readFileSync(join(paths.appDir, 'server.mjs'), 'utf8'), /version = 'new'/);
    assert.ok(!existsSync(join(paths.appDir, 'tests', 'stale.test.mjs')));
    assert.equal(readFileSync(join(paths.appDir, 'data', 'retained.txt'), 'utf8'), 'persistent');
    assert.equal(readFileSync(join(paths.appDir, 'imports', 'uploaded.csv'), 'utf8'), 'retained import');
    assert.equal(readFileSync(join(paths.appDir, 'imports', 'template.csv'), 'utf8'), 'new template');
    assert.ok(!existsSync(join(paths.appDir, 'imports', 'imports')));
    assert.equal(readdirSync(paths.snapshotDir).filter((name) => name.startsWith('previous-')).length, 1);
    const archiveName = readdirSync(paths.snapshotDir).find((name) => name.startsWith('release-') && name.endsWith('.tgz'));
    const entries = execFileSync('tar', ['-tzf', join(paths.snapshotDir, archiveName)], { encoding: 'utf8' });
    assert.ok(!entries.includes('.env'), 'code archive excludes active and historical environment secrets');
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('failed new service start restores the complete previous tree', { skip: !canRun }, () => {
  const paths = fixture(true);
  try {
    const result = release(paths);
    assert.notEqual(result.status, 0);
    assert.match(readFileSync(join(paths.appDir, 'server.mjs'), 'utf8'), /version = 'old'/);
    assert.match(readFileSync(join(paths.snapshotDir, 'release-history.log'), 'utf8'), /failed_rolled_back/);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});
