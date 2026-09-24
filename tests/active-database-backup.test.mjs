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

test("release tests a clean staged tree and backs up before switching the live directory", () => {
  const releaseScript = readFileSync(new URL("../scripts/release-production.sh", import.meta.url), "utf8");
  const extractStage = releaseScript.indexOf('tar -xzf "$archive" -C "$stage"');
  const runTests = releaseScript.indexOf('npm test');
  const runBackup = releaseScript.indexOf('node "$stage/scripts/active-database-backup.mjs" "$app_dir"');
  const runMigrations = releaseScript.indexOf('node --env-file="$app_dir/.env" "$stage/scripts/apply-production-migrations.mjs" "$stage" "$app_dir"');
  const switchLive = releaseScript.indexOf('mv "$stage" "$app_dir"');

  assert.ok(extractStage >= 0, "archive is extracted into a fresh stage");
  assert.ok(runTests > extractStage, "tests run against the clean stage");
  assert.ok(runBackup > runTests, "database backup runs after tests and before deployment");
  assert.ok(runMigrations > runBackup, "owner migration runs only after backup");
  assert.ok(switchLive > runMigrations, "live directory changes only after migration succeeds");
  assert.ok(!releaseScript.includes('tar -xzf "$archive" -C "$app_dir"'), "release never overlays live files");
});
