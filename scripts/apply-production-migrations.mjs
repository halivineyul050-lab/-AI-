import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function runMaria(args, options, runCommand) {
  const result = runCommand('mariadb', args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || 'MariaDB migration failed').trim());
  return String(result.stdout || '').trim();
}

export function applyProductionMigrations({ stageDir, appDir = '/opt/nikai-ai', environment = process.env, runCommand = spawnSync } = {}) {
  if (environment.NIKAI_DB_ENGINE !== 'mariadb') return { applied: [] };
  const database = environment.NIKAI_DB_NAME || 'nikai_ai';
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('Invalid NIKAI_DB_NAME');
  const migrationDir = join(resolve(stageDir), 'backend', 'mariadb', 'migrations');
  const ownerConfig = join(resolve(appDir), '.mariadb.cnf');
  const args = [`--defaults-extra-file=${ownerConfig}`, '--batch', '--skip-column-names', database];
  const applied = [];
  for (const file of readdirSync(migrationDir).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort()) {
    const version = Number(file.slice(0, 3));
    const name = file.slice(4, -4);
    const count = runMaria([...args, '-e', `SELECT COUNT(*) FROM schema_migrations WHERE version = ${version}`], {}, runCommand);
    if (count !== '0' && count !== '1') throw new Error(`Unexpected migration state for ${file}: ${count}`);
    if (count === '1') continue;
    runMaria(args, { input: readFileSync(join(migrationDir, file), 'utf8') }, runCommand);
    runMaria([...args, '-e', `INSERT INTO schema_migrations (version, name) VALUES (${version}, '${name}')`], {}, runCommand);
    applied.push(version);
  }
  return { applied };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = applyProductionMigrations({ stageDir: process.argv[2], appDir: process.argv[3] || '/opt/nikai-ai' });
  console.log(`MariaDB migrations applied: ${result.applied.join(', ') || 'none'}`);
}
