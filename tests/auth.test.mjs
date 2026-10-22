import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createHash } from "node:crypto";

import { buildApplication } from "../server.mjs";
import { registerUser } from "../backend/auth.mjs";
import { createCreditStore } from "../backend/credits.mjs";

let app;
let baseUrl;
let testDir;
const mailCodes = new Map();

async function request(path, options = {}) {
  if(path === "/api/v1/auth/register" && options.body) {
    const registration=JSON.parse(options.body);
    if(!mailCodes.has(registration.email.toLowerCase())) await request("/api/v1/auth/email-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:registration.email,purpose:"register"})});
    options={...options,body:JSON.stringify({...registration,code:mailCodes.get(registration.email.toLowerCase())})};
  }
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

async function createTestUserCookie(prefix) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const { token } = await registerUser(app.db, {
    displayName: "测试用户", email, normalizedEmail: email,
    password: "correct-horse-battery", consentVersion: "2026-09"
  });
  return `nikai_auth=${token}`;
}

before(async () => {
  testDir = mkdtempSync(join(tmpdir(), "nike-ai-auth-"));
  app = buildApplication({
    dbPath: join(testDir, "auth.db"),
    logger: false,
    adminToken: "auth-test-admin-token",
    analyticsSalt: "auth-test-analytics-salt",
    authEmailEnv: {RESEND_API_KEY:"test-secret",AUTH_EMAIL_FROM:"noreply@ontimo.cn"},
    authEmailFetch: async (_url,init) => { const mail=JSON.parse(init.body);mailCodes.set(mail.to[0],mail.text.match(/\b\d{6}\b/)[0]);return {ok:true,json:async()=>({id:"test-mail"})}; }
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

test("cookie-authenticated writes reject cross-site origins", async () => {
  const cookie = await createTestUserCookie("csrf");
  const response = await request("/api/v1/account/newsletter", {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: "https://attacker.example" }
  });
  assert.equal(response.response.status, 403);
  assert.equal(response.body.code, "csrf_rejected");
});

test("tool detail GET is read-only; account history is written through the explicit endpoint", async () => {
  const cookie = await createTestUserCookie("history");
  const detail = await request("/api/v1/tools/chatgpt", { headers: { Cookie: cookie } });
  assert.equal(detail.response.status, 200);
  let activity = await request("/api/v1/account/activity", { headers: { Cookie: cookie } });
  assert.deepEqual(activity.body.data.history, []);

  const recorded = await request("/api/v1/account/history/chatgpt", { method: "PUT", headers: { Cookie: cookie } });
  assert.equal(recorded.response.status, 200);
  activity = await request("/api/v1/account/activity", { headers: { Cookie: cookie } });
  assert.equal(activity.body.data.history[0].id, "chatgpt");
});

test("session activity timestamp is written at most once every five minutes", async () => {
  const cookie = await createTestUserCookie("activity");
  const token = cookie.slice("nikai_auth=".length);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = app.db.prepare("SELECT id, last_seen_at FROM auth_sessions WHERE token_hash = ?").get(tokenHash);
  app.db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", session.id);

  assert.equal((await request("/api/v1/auth/me", { headers: { Cookie: cookie } })).response.status, 200);
  const refreshed = app.db.prepare("SELECT last_seen_at FROM auth_sessions WHERE id = ?").get(session.id).last_seen_at;
  assert.notEqual(refreshed, "2000-01-01T00:00:00.000Z");
  assert.equal((await request("/api/v1/auth/me", { headers: { Cookie: cookie } })).response.status, 200);
  assert.equal(app.db.prepare("SELECT last_seen_at FROM auth_sessions WHERE id = ?").get(session.id).last_seen_at, refreshed);
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

test("auth page served; account entry removed from home", async () => {
  const page = await fetch(`${baseUrl}/auth.html`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="register-form"/);
  const home = await fetch(`${baseUrl}/`);
  assert.doesNotMatch(await home.text(), /id="account-link"/);
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
  assert.equal((await request("/api/v1/account/history/chatgpt", { method: "PUT", headers: { Cookie: cookie } })).response.status, 200);
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
  assert.equal((await request("/api/v1/account/history/chatgpt", { method: "PUT", headers: { Cookie: cookie } })).response.status, 200);

  const activity = await request("/api/v1/account/activity", { headers: { Cookie: cookie } });
  assert.equal(activity.response.status, 200);
  assert.equal(activity.body.data.favorites[0].id, "chatgpt");
  assert.equal(activity.body.data.ratings[0].rating, 4);
  assert.equal(activity.body.data.history[0].id, "chatgpt");
  assert.equal(activity.body.data.feedback[0].status, "pending");
  assert.equal(activity.body.data.newsletter.status, "active");

  const deniedDelete = await request("/api/v1/account", {
    method: "DELETE", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "NO", password: "account-center-password" })
  });
  assert.equal(deniedDelete.response.status, 422);
  const wrongPasswordDelete = await request("/api/v1/account", {
    method: "DELETE", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE", password: "incorrect-password" })
  });
  assert.equal(wrongPasswordDelete.response.status, 401);
  const deletionUser = app.db.prepare("SELECT id FROM users WHERE normalized_email = 'account@example.com'").get();
  createCreditStore(app.db).grant({ userId: deletionUser.id, credits: 20, reason: '注销回归测试', requestId: 'account-delete-grant' }, 'admin');
  const deleted = await request("/api/v1/account", {
    method: "DELETE", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE", password: "account-center-password" })
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM users WHERE normalized_email = 'account@example.com'").get().count, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM credit_wallets WHERE user_id = ?').get(deletionUser.id).count, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM credit_grants WHERE user_id = ?').get(deletionUser.id).count, 0);
  assert.equal((await request('/api/v1/auth/me', { headers: { Cookie: cookie } })).response.status, 401);
});
