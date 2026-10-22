import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("MariaDB backup timer invokes the checked-in non-executable script through bash", () => {
  const service = readFileSync(new URL("../deploy/nikai-mariadb-backup.service", import.meta.url), "utf8");
  const timer = readFileSync(new URL("../deploy/nikai-mariadb-backup.timer", import.meta.url), "utf8");
  assert.match(service, /^ExecStart=\/usr\/bin\/bash \/opt\/nikai-ai\/scripts\/backup-mariadb\.sh$/m);
  assert.match(service, /EnvironmentFile=-\/opt\/nikai-ai\/\.env/);
  assert.match(service, /ProtectSystem=strict/);
  assert.match(timer, /Persistent=true/);
  assert.match(timer, /Unit=nikai-mariadb-backup\.service/);
});
