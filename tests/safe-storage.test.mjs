import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/safe-storage.js", import.meta.url), "utf8");

test("safe storage falls back to independent in-memory stores when browser storage is denied", () => {
  const window = {};
  Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Denied", "SecurityError"); } });
  Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Denied", "SecurityError"); } });
  vm.runInNewContext(source, { window, Math });

  window.nikaiStorage.local.setItem("theme", "dark");
  window.nikaiStorage.session.setItem("token", "session-only");
  assert.equal(window.nikaiStorage.local.getItem("theme"), "dark");
  assert.equal(window.nikaiStorage.session.getItem("token"), "session-only");
  assert.equal(window.nikaiStorage.local.getItem("token"), null);
  window.nikaiStorage.local.removeItem("theme");
  assert.equal(window.nikaiStorage.local.getItem("theme"), null);
});
