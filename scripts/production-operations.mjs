import { spawnSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const defaultUnitPath = '/etc/systemd/system/nikai-db-backup.service';
const defaultOverridePath = '/etc/systemd/system/nikai-db-backup.service.d/10-production-backup.conf';

export function hardenStagedTree(stageDir) {
  const root = resolve(stageDir);
  function visit(path) {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) return;
    if (!info.isDirectory() && !info.isFile()) return;
    const safeMode = (info.mode & 0o777) & ~0o022;
    if ((info.mode & 0o022) !== 0) chmodSync(path, safeMode);
    if (info.isDirectory()) for (const entry of readdirSync(path)) visit(join(path, entry));
  }
  visit(root);
  for (const name of ['backup-database.sh', 'backup-mariadb.sh']) {
    const path = join(root, 'scripts', name);
    chmodSync(path, (lstatSync(path).mode & 0o777) | 0o111);
  }
}

export function installBackupServiceOverride({
  stageDir = resolve(import.meta.dirname, '..'),
  unitPath = defaultUnitPath,
  overridePath = defaultOverridePath,
  runCommand = spawnSync
} = {}) {
  const unit = readFileSync(unitPath, 'utf8');
  if (!unit.includes('ExecStart=/opt/nikai-ai/scripts/backup-database.sh')
    || !unit.includes('ConditionPathExists=/opt/nikai-ai/data/nikai-ai.sqlite')) {
    throw new Error('Unexpected backup service; refusing to replace its configuration');
  }
  const desired = readFileSync(join(stageDir, 'deploy', 'nikai-db-backup.override.conf'), 'utf8');
  let current;
  try { current = readFileSync(overridePath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current === desired) return false;
  if (current !== undefined) throw new Error('Unexpected backup override; refusing to replace it');
  mkdirSync(resolve(overridePath, '..'), { recursive: true, mode: 0o755 });
  writeFileSync(overridePath, desired, { flag: 'wx', mode: 0o644 });
  const result = runCommand('systemctl', ['daemon-reload'], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    rmSync(overridePath);
    runCommand('systemctl', ['daemon-reload'], { stdio: 'ignore' });
    throw new Error('Could not reload backup service override');
  }
  const started = runCommand('systemctl', ['start', 'nikai-db-backup.service'], { stdio: 'ignore' });
  if (started.error || started.status !== 0) {
    rmSync(overridePath);
    runCommand('systemctl', ['daemon-reload'], { stdio: 'ignore' });
    throw new Error('Could not start backup service');
  }
  return true;
}

export function applyProductionOperations({ stageDir, environment = process.env } = {}) {
  hardenStagedTree(stageDir);
  if (environment.NIKAI_DB_ENGINE === 'mariadb') installBackupServiceOverride({ stageDir });
}
