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
      consentAccepted: true,
      termsAccepted: true
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
      consentAccepted: true,
      termsAccepted: true
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

  const initialFavorites = await request("/api/v1/account/favorites", { headers: { Cookie: loginCookie } });
  assert.equal(initialFavorites.response.status, 200);
  assert.deepEqual(initialFavorites.body.data.toolIds, []);
  const addedFavorite = await request("/api/v1/account/favorites/doubao", {
    method: "PUT",
    headers: { Cookie: loginCookie }
  });
  assert.equal(addedFavorite.response.status, 200);
  const savedFavorites = await request("/api/v1/account/favorites", { headers: { Cookie: loginCookie } });
  assert.deepEqual(savedFavorites.body.data.toolIds, ["doubao"]);
  const removedFavorite = await request("/api/v1/account/favorites/doubao", {
    method: "DELETE",
    headers: { Cookie: loginCookie }
  });
  assert.equal(removedFavorite.response.status, 200);

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

test("logged-in users can create, update and remove one rating per tool", async () => {
  const anonymous = await request("/api/v1/tools/chatgpt/ratings");
  assert.equal(anonymous.response.status, 200);
  assert.equal(anonymous.body.data.count, 0);
  assert.equal(anonymous.body.data.userRating, null);

  const unauthorized = await request("/api/v1/tools/chatgpt/rating", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating: 5 })
  });
  assert.equal(unauthorized.response.status, 401);

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "member@example.com", password: "correct-horse-battery" })
  });
  assert.equal(login.response.status, 200);
  const cookie = cookieFrom(login.response);

  const created = await request("/api/v1/tools/chatgpt/rating", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ rating: 5 })
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.body.data.average, 5);
  assert.equal(created.body.data.count, 1);
  assert.equal(created.body.data.userRating, 5);

  const updated = await request("/api/v1/tools/chatgpt/rating", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ rating: 3 })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.data.average, 3);
  assert.equal(updated.body.data.count, 1);

  const removed = await request("/api/v1/tools/chatgpt/rating", {
    method: "DELETE",
    headers: { Cookie: cookie }
  });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.body.data.count, 0);
});

test("auth page and account entry are served by the same backend", async () => {
  const page = await fetch(`${baseUrl}/auth.html`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="register-form"/);
  const home = await fetch(`${baseUrl}/`);
  assert.match(await home.text(), /id="account-link"/);
});

test("account center exposes activity, notification preferences and safe account deletion", async () => {
  const registered = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "账户中心用户",
      email: "account@example.com",
      password: "account-center-password",
      consentVersion: "2026-07",
      consentAccepted: true,
      termsAccepted: true
    })
  });
  const cookie = cookieFrom(registered.response);
  assert.equal(registered.response.status, 201);

  assert.equal((await request("/api/v1/tools/chatgpt", { headers: { Cookie: cookie } })).response.status, 200);
  assert.equal((await request("/api/v1/account/favorites/chatgpt", { method: "PUT", headers: { Cookie: cookie } })).response.status, 200);
  assert.equal((await request("/api/v1/tools/chatgpt/rating", {
    method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 4 })
  })).response.status, 200);
  assert.equal((await request("/api/v1/feedback", {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({
      category: "suggestion", message: "希望个人中心可以查看完整反馈处理进度。", contactEmail: "account@example.com",
      pageUrl: "/auth.html", consentVersion: "2026-07", consentAccepted: true
    })
  })).response.status, 201);
  assert.equal((await request("/api/v1/newsletter/subscriptions", {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({
      email: "account@example.com", topicSlugs: [], consentVersion: "2026-07", consentAccepted: true, source: "account_test"
    })
  })).response.status, 201);

  const preferences = await request("/api/v1/account/notifications", {
    method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ weeklyDigest: true, newToolAlerts: false, favoriteUpdateAlerts: true })
  });
  assert.equal(preferences.response.status, 200);
  assert.equal(preferences.body.data.newToolAlerts, false);

  const activity = await request("/api/v1/account/activity", { headers: { Cookie: cookie } });
  assert.equal(activity.response.status, 200);
  assert.equal(activity.body.data.favorites[0].id, "chatgpt");
  assert.equal(activity.body.data.ratings[0].rating, 4);
  assert.equal(activity.body.data.history[0].id, "chatgpt");
  assert.equal(activity.body.data.feedback[0].status, "pending");
  assert.equal(activity.body.data.newsletter.status, "active");

  const deniedDelete = await request("/api/v1/account", {
    method: "DELETE", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "NO" })
  });
  assert.equal(deniedDelete.response.status, 422);
  const deleted = await request("/api/v1/account", {
    method: "DELETE", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE" })
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM users WHERE normalized_email = 'account@example.com'").get().count, 0);
});
