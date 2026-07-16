import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { buildApplication } from "../server.mjs";

let app;
let baseUrl;
let testDir;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  const body = await response.json();
  return { response, body };
}

function cookieFrom(response) {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

before(async () => {
  testDir = mkdtempSync(join(tmpdir(), "nike-ai-auth-"));
  app = buildApplication({
    dbPath: join(testDir, "auth.db"),
    logger: false,
    adminToken: "auth-test-admin-token",
    analyticsSalt: "auth-test-analytics-salt"
  });
  const address = await app.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("registration, login, current-user and logout use an HttpOnly session", async () => {
  const registered = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "测试用户",
      email: "Member@Example.com",
      password: "correct-horse-battery",
      consentVersion: "2026-07",
      consentAccepted: true
    })
  });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.body.data.user.email, "member@example.com");
  assert.equal(registered.body.data.user.role, "member");
  assert.match(registered.response.headers.get("set-cookie"), /HttpOnly/);
  const cookie = cookieFrom(registered.response);

  const me = await request("/api/v1/auth/me", { headers: { Cookie: cookie } });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.data.user.displayName, "测试用户");

  const duplicate = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "另一位用户",
      email: "member@example.com",
      password: "another-correct-password",
      consentVersion: "2026-07",
      consentAccepted: true
    })
  });
  assert.equal(duplicate.response.status, 409);

  const wrongLogin = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "member@example.com", password: "wrong-password" })
  });
  assert.equal(wrongLogin.response.status, 401);

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "member@example.com", password: "correct-horse-battery" })
  });
  assert.equal(login.response.status, 200);
  const loginCookie = cookieFrom(login.response);

  const logout = await request("/api/v1/auth/logout", {
    method: "POST",
    headers: { Cookie: loginCookie, "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(logout.response.status, 200);
  const afterLogout = await request("/api/v1/auth/me", { headers: { Cookie: loginCookie } });
  assert.equal(afterLogout.response.status, 401);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM users").get().count, 1);
});

test("auth page and account entry are served by the same backend", async () => {
  const page = await fetch(`${baseUrl}/auth.html`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="register-form"/);
  const home = await fetch(`${baseUrl}/`);
  assert.match(await home.text(), /id="account-link"/);
});
