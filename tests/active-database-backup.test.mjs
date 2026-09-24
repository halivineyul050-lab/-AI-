import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

async function loadBackupSelector() {
  let backupModule;
  try { backupModule = await import("../scripts/active-database-backup.mjs"); } catch { /* The regression test reports the missing behavior below. */ }
  assert.equal(typeof backupModule?.runProductionDatabaseBackup, "function", "release backup selector is available");
  return backupModule.runProductionDatabaseBackup;
}

function fixture(engine) {
  const root = mkdtempSync(join(tmpdir(), "nikai-backup-route-"));
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, ".env"), `NODE_ENV=production\nNIKAI_DB_ENGINE=${engine}\n`);
  return root;
}

test("production releases select a MariaDB dump when MariaDB is the configured backend", async () => {
  const runProductionDatabaseBackup = await loadBackupSelector();
  const root = fixture("mariadb");
  const calls = [];
  try {
    const engine = runProductionDatabaseBackup({ appDir: root, environment: {}, runCommand: (...args) => { calls.push(args); return { status: 0 }; } });
    assert.equal(engine, "mariadb");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "bash");
    assert.equal(calls[0][1][0], join(root, "scripts", "backup-mariadb.sh"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("production releases retain SQLite backup behavior for SQLite configuration", async () => {
  const runProductionDatabaseBackup = await loadBackupSelector();
  const root = fixture("sqlite");
  const calls = [];
  try {
    const engine = runProductionDatabaseBackup({ appDir: root, environment: {}, runCommand: (...args) => { calls.push(args); return { status: 0 }; } });
    assert.equal(engine, "sqlite");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1][0], join(root, "scripts", "backup-database.sh"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("first release can run the backup selector from its archive before installing it", () => {
  const releaseScript = readFileSync(new URL("../scripts/release-production.sh", import.meta.url), "utf8");
  const extractHelper = releaseScript.indexOf("tar -xzf \"$archive\" -C \"$backup_helper_dir\" ./scripts/active-database-backup.mjs");
  const runHelper = releaseScript.indexOf("node \"${backup_helper_dir}/scripts/active-database-backup.mjs\" \"$app_dir\"");
  const installRelease = releaseScript.indexOf("tar -xzf \"$archive\" -C \"$app_dir\"");

  assert.ok(extractHelper >= 0, "release archive provides its backup selector");
  assert.ok(runHelper > extractHelper, "selector runs after extraction");
  assert.ok(installRelease > runHelper, "selector runs before live application files are changed");
});
