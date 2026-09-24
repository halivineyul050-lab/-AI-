import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function configuredDatabaseEngine(appDir, environment) {
  if (environment.NIKAI_DB_ENGINE) return environment.NIKAI_DB_ENGINE;
  const envPath = join(appDir, ".env");
  if (!existsSync(envPath)) return "sqlite";

  let engine = "sqlite";
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*NIKAI_DB_ENGINE\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[1].replace(/\s+#.*$/, "").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    engine = value || "sqlite";
  }
  return engine;
}

export function runProductionDatabaseBackup({ appDir = "/opt/nikai-ai", runCommand = spawnSync, environment = process.env } = {}) {
  const resolvedAppDir = resolve(appDir);
  const engine = configuredDatabaseEngine(resolvedAppDir, environment);
  const backupScript = engine === "mariadb"
    ? "backup-mariadb.sh"
    : engine === "sqlite"
      ? "backup-database.sh"
      : null;
  if (!backupScript) throw new Error(`Unsupported NIKAI_DB_ENGINE: ${engine}`);

  const result = runCommand("bash", [join(resolvedAppDir, "scripts", backupScript)], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${backupScript} failed with status ${result.status}`);
  return engine;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runProductionDatabaseBackup({ appDir: process.argv[2] || "/opt/nikai-ai" });
}
