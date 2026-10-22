import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { hardenStagedTree, installBackupServiceOverride } from '../scripts/production-operations.mjs';

const legacyUnit = `[Unit]
Description=Nikai AI SQLite database backup
ConditionPathExists=/opt/nikai-ai/data/nikai-ai.sqlite
[Service]
User=nikai
Group=nikai
ExecStart=/opt/nikai-ai/scripts/backup-database.sh
ReadWritePaths=/opt/nikai-ai-backups/sqlite
`;

test('backup override switches the legacy timer to root-run active database selection', () => {
  const root = mkdtempSync(join(tmpdir(), 'nikai-operations-'));
  try {
    const unitPath = join(root, 'nikai-db-backup.service');
    const overridePath = join(root, 'override.conf');
    writeFileSync(unitPath, legacyUnit);
    const commands = [];
    const options = { unitPath, overridePath, runCommand: (command, args) => { commands.push([command, args]); return { status: 0 }; } };
    assert.equal(installBackupServiceOverride(options), true);
    const override = readFileSync(overridePath, 'utf8');
    for (const directive of [
      'ConditionPathExists=', 'ConditionPathExists=/opt/nikai-ai/.mariadb.cnf',
      'User=root', 'Group=root', 'ExecStart=',
      'ExecStart=/usr/local/bin/node /opt/nikai-ai/scripts/active-database-backup.mjs /opt/nikai-ai',
      'ReadWritePaths=/opt/nikai-ai-backups/mariadb'
    ]) assert.ok(override.includes(directive), directive);
    assert.deepEqual(commands, [['systemctl', ['daemon-reload']], ['systemctl', ['start', 'nikai-db-backup.service']]]);
    assert.equal(installBackupServiceOverride(options), false);
    assert.equal(commands.length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed backup service start restores the previous systemd configuration', () => {
  const root = mkdtempSync(join(tmpdir(), 'nikai-operations-'));
  try {
    const unitPath = join(root, 'nikai-db-backup.service');
    const overridePath = join(root, 'override.conf');
    writeFileSync(unitPath, legacyUnit);
    const commands = [];
    assert.throws(() => installBackupServiceOverride({ unitPath, overridePath, runCommand: (command, args) => {
      commands.push(args.join(' '));
      return { status: args[0] === 'start' ? 1 : 0 };
    } }), /Could not start backup service/);
    assert.deepEqual(commands, ['daemon-reload', 'start nikai-db-backup.service', 'daemon-reload']);
    assert.throws(() => readFileSync(overridePath), { code: 'ENOENT' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('backup override refuses an unknown service instead of replacing it', () => {
  const root = mkdtempSync(join(tmpdir(), 'nikai-operations-'));
  try {
    const unitPath = join(root, 'nikai-db-backup.service');
    const overridePath = join(root, 'override.conf');
    writeFileSync(unitPath, '[Service]\nExecStart=/unknown/backup\n');
    assert.throws(() => installBackupServiceOverride({ unitPath, overridePath }), /Unexpected backup service/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('staged source files lose world write permission and backup scripts remain executable', { skip: process.platform === 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'nikai-operations-'));
  try {
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'server.mjs'), '');
    writeFileSync(join(root, 'scripts', 'backup-database.sh'), '#!/bin/sh\n');
    writeFileSync(join(root, 'scripts', 'backup-mariadb.sh'), '#!/bin/sh\n');
    chmodSync(join(root, 'server.mjs'), 0o666);
    chmodSync(join(root, 'scripts', 'backup-database.sh'), 0o666);
    hardenStagedTree(root);
    assert.equal(statSync(join(root, 'server.mjs')).mode & 0o022, 0);
    assert.equal(statSync(join(root, 'scripts', 'backup-database.sh')).mode & 0o111, 0o111);
    assert.equal(statSync(join(root, 'scripts', 'backup-mariadb.sh')).mode & 0o111, 0o111);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
