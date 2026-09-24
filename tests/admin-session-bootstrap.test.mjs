import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const adminScript = readFileSync(new URL("../admin.js", import.meta.url), "utf8");
const initBody = adminScript.match(/async function init\(\)\s*\{([\s\S]*?)\n  \}/)?.[1] || "";

test("an authenticated admin session automatically loads the content manager", () => {
  assert.match(initBody, /if\s*\(state\.token === "__session_admin__"\)\s*\{\s*void loadSubmissions\(\{ quiet: true \}\);\s*void loadCmsEntity\(\{ quiet: true \}\);\s*\}/);
});

test("read-only monitoring access cannot bypass administrator session validation", () => {
  const authGate = adminScript.match(/async function requireAccountSession\(\)\s*\{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.doesNotMatch(authGate, /if\s*\(probe\.ok\)\s*return true/);
  assert.match(authGate, /payload\?\.data\?\.user\?\.role\s*===\s*"admin"/);
});

test("session admins use cookie auth for submissions without sending the session marker as a bearer token", () => {
  const submissionsBody = adminScript.match(/async function loadSubmissions\(\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(submissionsBody, /token\s*!==\s*"__session_admin__"\s*\?\s*\{\s*Authorization:/);
  assert.match(submissionsBody, /if\s*\(token\s*!==\s*"__session_admin__"\)\s*\{[\s\S]*?state\.token\s*=\s*"";[\s\S]*?lockCmsUi\(\);[\s\S]*?\}/);
});

test("monitoring does not send the account-session marker as a bearer token", () => {
  const monitoringBody = adminScript.match(/async function loadMonitoring\(\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(monitoringBody, /state\.token\s*&&\s*state\.token\s*!==\s*"__session_admin__"/);
  assert.match(monitoringBody, /error\.status\s*===\s*401\s*&&\s*state\.token\s*&&\s*state\.token\s*!==\s*"__session_admin__"/);
});

const adminHtml = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
test("admin page cache-busts the session-gate fix", () => {
  assert.match(adminHtml, /admin\.js\?v=20260924-reference-1/);
});

test("account session is checked before any previously remembered admin token", () => {
  const authGate = adminScript.match(/async function requireAccountSession\(\)\s*\{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.ok(authGate.indexOf('fetch("/api/v1/auth/me"') >= 0);
  assert.ok(authGate.indexOf('fetch("/api/v1/auth/me"') < authGate.indexOf('fetch("/api/admin/v1/summary"'));
});
