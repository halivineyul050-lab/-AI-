import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildApplication } from "../server.mjs";

const rootFor = () => join(tmpdir(), `image-provider-operations-${randomUUID()}`);

async function startApplication(t, options = {}) {
  const root = rootFor();
  const app = buildApplication({
    dbPath: join(root, "test.db"),
    staticDir: root,
    autoSeed: false,
    environment: "test",
    logger: false,
    adminToken: "image-operations-admin",
    ...options
  });
  const address = await app.listen(0, "127.0.0.1");
  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { app, root, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("image-provider configuration documents a generated 64-character hexadecimal key without embedding one", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const readme = readFileSync(new URL("../backend/README.md", import.meta.url), "utf8");

  assert.match(example, /^NIKE_IMAGE_CONFIG_KEY=$/m);
  assert.match(example, /64\s*(?:个|character)[^\n]*(?:十六进制|hex)/i);
  assert.match(readme, /node -e "console\.log\(require\('crypto'\)\.randomBytes\(32\)\.toString\('hex'\)\)"/);
  assert.doesNotMatch(example, /^NIKE_IMAGE_CONFIG_KEY=[a-f0-9]{64}$/im);
});

test("disaster recovery preserves the exact image key needed to decrypt database ciphertext", () => {
  const readme = readFileSync(new URL("../backend/README.md", import.meta.url), "utf8");

  assert.match(readme, /灾难恢复/);
  assert.match(readme, /NIKE_IMAGE_CONFIG_KEY[^\n]*安全托管|安全托管[^\n]*NIKE_IMAGE_CONFIG_KEY/);
  assert.match(readme, /数据库备份[^\n]*密文|密文[^\n]*数据库备份/);
  assert.match(readme, /丢失[^\n]*重新输入[^\n]*API Key|重新输入[^\n]*API Key[^\n]*丢失/);
});

test("public readiness never advertises image capability while protected monitoring exposes only its boolean state", async (t) => {
  const key = "7".repeat(64);
  const { baseUrl } = await startApplication(t, { imageConfigKey: key });

  const publicHealth = await (await fetch(`${baseUrl}/api/v1/health`)).json();
  assert.deepEqual(publicHealth.data, { status: "ok", database: true, version: 1 });
  assert.doesNotMatch(JSON.stringify(publicHealth), /image|key|secret|cipher/i);
  const publicReadiness = await (await fetch(`${baseUrl}/api/v1/health/ready`)).json();
  assert.deepEqual(publicReadiness.data, { status: "ok", database: true, version: 1 });
  assert.doesNotMatch(JSON.stringify(publicReadiness), /image|key|secret|cipher/i);

  const localReadOnlyMonitoring = await fetch(`${baseUrl}/api/admin/v1/monitoring?hours=1`);
  assert.equal(localReadOnlyMonitoring.status, 200);
  assert.doesNotMatch(JSON.stringify((await localReadOnlyMonitoring.json()).data.system), /image|key|secret|cipher/i);

  const monitoring = await fetch(`${baseUrl}/api/admin/v1/monitoring?hours=1`, {
    headers: { Authorization: "Bearer image-operations-admin" }
  });
  assert.equal(monitoring.status, 200);
  const protectedHealth = (await monitoring.json()).data.system;
  assert.equal(protectedHealth.imageGenerationConfigured, true);
  assert.deepEqual(
    Object.keys(protectedHealth).filter((field) => /image|key|secret|cipher/i.test(field)),
    ["imageGenerationConfigured"]
  );
  assert.doesNotMatch(JSON.stringify(protectedHealth), new RegExp(key));
});

test("missing image master key fails closed for provider secrets", async (t) => {
  const { baseUrl } = await startApplication(t, { imageConfigKey: "" });
  const response = await fetch(`${baseUrl}/api/admin/v1/image-providers`, {
    method: "POST",
    headers: {
      Authorization: "Bearer image-operations-admin",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: "Provider", baseUrl: "https://93.184.216.34", apiKey: "sk-never-stored" })
  });

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "image_service_unconfigured");
  assert.doesNotMatch(JSON.stringify(body), /sk-never-stored/);
});

test("application shutdown removes expired image result directories", async (t) => {
  const root = rootFor();
  const imageTempRoot = join(root, "image-results");
  const expired = join(imageTempRoot, `nikai-generation-${Date.now() - 1}-${randomUUID()}`);
  mkdirSync(expired, { recursive: true, mode: 0o700 });
  const app = buildApplication({
    dbPath: join(root, "test.db"),
    staticDir: root,
    imageTempRoot,
    autoSeed: false,
    environment: "test",
    logger: false
  });
  const address = await app.listen(0, "127.0.0.1");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(typeof address.port, "number");
  await app.close();
  assert.equal(existsSync(expired), false);
});

test("application shutdown closes server and database before reporting image cleanup failure", async (t) => {
  const root = rootFor();
  const imageTempRoot = join(root, "not-a-directory");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeFileSync(imageTempRoot, "not a directory");
  const app = buildApplication({
    dbPath: join(root, "test.db"),
    staticDir: root,
    imageTempRoot,
    autoSeed: false,
    environment: "test",
    logger: false
  });
  const address = await app.listen(0, "127.0.0.1");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await assert.rejects(app.close(), /ENOTDIR|not a directory/i);
  assert.throws(() => app.db.prepare("SELECT 1").get());
  await assert.rejects(fetch(`http://127.0.0.1:${address.port}/api/v1/health`));
});

test("MariaDB backup and restore retain whole-database checksum verification after a dump is renamed", () => {
  const backup = readFileSync(new URL("../scripts/backup-mariadb.sh", import.meta.url), "utf8");
  const restore = readFileSync(new URL("../scripts/restore-mariadb.sh", import.meta.url), "utf8");

  assert.match(backup, /mariadb-dump[^\n]*--single-transaction[^\n]*"\$database"/);
  assert.doesNotMatch(backup, /--ignore-table|--no-data/);
  assert.match(backup, /sha256sum "\$target"[^\n]*\|[^\n]*(?:awk|cut)/);
  assert.doesNotMatch(backup, /sha256sum "\$target" > "\$target\.sha256"/);
  assert.match(restore, /(?:! )?\[\[ "\$expected_checksum" =~ \^\[\[:xdigit:\]\]\{64\}\$ \]\]/);
  assert.match(restore, /sha256sum "\$dump"/);
  assert.ok(restore.indexOf("expected_checksum") < restore.indexOf("gzip -cd"));
  assert.match(restore, /mariadb[^\n]*"\$database"/);
});
