import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { resolveAuthNextPath } from "../public/auth-redirect.mjs";

async function initializeAccount(role = "member", isSuperAdmin = false, emailVerified = false) {
  const html = readFileSync(new URL("../public/auth.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../public/auth.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/, "");
  const element = () => ({
    hidden: true, textContent: "", removed: false,
    remove() { this.removed = true; },
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, querySelectorAll: () => [],
    append() {}, replaceChildren() {}
  });
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], element()]));
  nodes.set("account-email-security", { ...element(), hidden: false });
  assert.equal(nodes.has("admin-account-form"), false);
  const listeners = {};
  const user = { id: "member-1", displayName: "登录同步测试", email: "member@example.test", role, isSuperAdmin, emailVerified };
  vm.runInNewContext(source, {
    AbortSignal,
    resolveAuthNextPath, URLSearchParams,
    location: { search: "", hash: "", origin: "https://ontimo.cn" },
    window: { nikaiStorage: { session: {} }, addEventListener(name, listener) { listeners[name] = listener; } },
    document: { querySelectorAll: () => [], getElementById: (id) => nodes.get(id) || null, createElement: element, body: element() },
    fetch: async (path) => ({ ok: true, json: async () => ({ data: path === "/api/v1/auth/me" ? { user } : {} }) })
  });
  await listeners.DOMContentLoaded();
  await new Promise((resolve) => setImmediate(resolve));
  return nodes;
}

test("the member account page initializes when the optional admin account form is absent", async () => {
  const nodes = await initializeAccount();
  assert.equal(nodes.get("account-panel").hidden, false);
  assert.equal(nodes.get("login-form").hidden, true);
  assert.equal(nodes.get("account-name").textContent, "登录同步测试");
  assert.equal(nodes.get("admin-entry").hidden, true);
});

test("ordinary accounts have no management link remaining in their account page", async () => {
  const nodes = await initializeAccount();
  assert.equal(nodes.get("admin-entry").removed, true);
});

test("authorized administrator accounts keep their management link", async () => {
  const nodes = await initializeAccount("admin");
  assert.equal(nodes.get("admin-entry").hidden, false);
  assert.equal(nodes.get("admin-entry").removed, false);
});

test("verified accounts hide the entire email verification card", async () => {
  for (const role of ["member", "admin"]) {
    const nodes = await initializeAccount(role, false, true);
    assert.equal(nodes.get("account-email-security").hidden, true);
    assert.equal(nodes.get("verify-email-form").hidden, true);
  }
});

test("unverified ordinary accounts keep verification while the super administrator is exempt", async () => {
  const superAdmin = await initializeAccount("admin", true);
  assert.equal(superAdmin.get("account-email-security").hidden, true);
  assert.equal(superAdmin.get("verify-email-form").hidden, true);
  assert.doesNotMatch(superAdmin.get("email-security-status").textContent, /邮箱已验证/);
  for (const role of ["member", "admin"]) {
    const ordinary = await initializeAccount(role);
    assert.equal(ordinary.get("account-email-security").hidden, false);
    assert.equal(ordinary.get("verify-email-form").hidden, false);
  }
});
