import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const home = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const scripts = [...home.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
  .map((match) => match[1].split("?")[0])
  .filter((path) => path === "/header-account.js")
  .map((path) => readFileSync(new URL(`../public${path}`, import.meta.url), "utf8"));

const member = { id: "member-1", email: "member@example.test", displayName: "测试用户", role: "member" };
const signedIn = () => ({ ok: true, status: 200, json: async () => ({ data: { user: member } }) });
const signedOut = () => ({ ok: false, status: 401, json: async () => ({ code: "not_authenticated" }) });
const settle = () => new Promise((resolve) => setImmediate(resolve));

function startHeader(initialResponse) {
  function element() {
    let text = "";
    const classes = new Set();
    return {
      children: [], attributes: {}, className: "", listeners: {},
      addEventListener(name, handler) { this.listeners[name] = handler; },
      get textContent() { return text + this.children.map((child) => child.textContent).join(""); },
      set textContent(value) { text = value; this.children = []; },
      replaceChildren(...children) { text = ""; this.children = children; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } }
    };
  }
  const entry = element();
  const menu = element(); menu.open = false; menu.contains = target => target === entry;
  entry.closest = () => menu;
  entry.textContent = "登录";
  entry.attributes.href = "/auth.html";
  const pageListeners = {};
  const documentListeners = {};
  const requests = [];
  let response = initialResponse;
  const document = {
    visibilityState: "visible",
    createElement: element,
    querySelector: (selector) => selector === ".header-login" ? entry : null,
    addEventListener(name, handler) { documentListeners[name] = handler; }
  };
  const window = { addEventListener(name, handler) { pageListeners[name] = handler; } };
  for (const source of scripts) {
    vm.runInNewContext(source, {
      document, window,
      fetch: async (url, options) => {
        requests.push({ url, options });
        if (response instanceof Error) throw response;
        return response();
      }
    });
  }
  return { entry, menu, requests, document, pageListeners, documentListeners, respondWith(next) { response = next; } };
}

test("home replaces the login entry when the session API identifies a member", async () => {
  const header = startHeader(signedIn);
  await settle();
  assert.equal(header.entry.children.find((child) => child.className === "header-account-label")?.textContent, "测试用户");
  assert.equal(header.entry.attributes.href, "/auth.html");
  assert.match(header.entry.attributes["aria-label"], /测试用户/);
  assert.equal(header.requests[0].url, "/api/v1/auth/me");
  assert.equal(header.requests[0].options.credentials, "same-origin");
  assert.equal(header.requests[0].options.cache, "no-store");
});

test("anonymous visitors keep the login entry", async () => {
  const header = startHeader(signedOut);
  await settle();
  assert.equal(header.entry.textContent, "登录");
});

test("returning through the back-forward cache clears an expired account state", async () => {
  const header = startHeader(signedIn);
  await settle();
  assert.match(header.entry.textContent, /测试用户/);
  header.respondWith(signedOut);
  header.pageListeners.pageshow({ persisted: true });
  await settle();
  assert.equal(header.entry.textContent, "登录");
  assert.equal(header.entry.attributes["aria-label"], "登录账号");
  assert.equal(header.entry.children.length, 0);
  assert.equal(header.entry.classList.contains("is-signed-in"), false);
});

test("returning to a visible tab discovers a login from another page", async () => {
  const header = startHeader(signedOut);
  await settle();
  header.respondWith(signedIn);
  header.documentListeners.visibilitychange?.();
  await settle();
  assert.match(header.entry.textContent, /测试用户/);
});

test("a temporary network failure preserves the last confirmed account state", async () => {
  const header = startHeader(signedIn);
  await settle();
  assert.match(header.entry.textContent, /测试用户/);
  header.respondWith(new Error("Network unavailable"));
  header.pageListeners.pageshow({ persisted: true });
  await settle();
  assert.match(header.entry.textContent, /测试用户/);
});

test("signed-in accounts show the nickname initial as a default avatar", async () => {
  const header = startHeader(signedIn);
  await settle();
  const avatar = header.entry.children.find((child) => child.className === "header-account-avatar");
  assert.equal(avatar?.textContent, "测");
  assert.equal(avatar.attributes["aria-hidden"], "true");
  assert.equal(header.entry.classList.contains("is-signed-in"), true);
});

test("default avatars safely handle Unicode and missing display names", async () => {
  const header = startHeader(() => ({ ok: true, status: 200, json: async () => ({ data: { user: { ...member, displayName: " 🐱猫猫 <script> " } } }) }));
  await settle();
  assert.equal(header.entry.children[0]?.textContent, "🐱");
  assert.equal(header.entry.children[0].children.length, 0);
  header.respondWith(() => ({ ok: true, status: 200, json: async () => ({ data: { user: { ...member, displayName: "" } } }) }));
  header.pageListeners.pageshow({ persisted: true });
  await settle();
  assert.equal(header.entry.children[0]?.textContent, "用");
});

test("uploaded avatars use the authenticated image endpoint and fall back if unavailable", async () => {
  const avatarUrl = "/api/v1/account/avatar?v=11111111-1111-4111-8111-111111111111";
  const header = startHeader(() => ({ ok: true, status: 200, json: async () => ({ data: { user: { ...member, avatarUrl } } }) }));
  await settle();
  const avatar = header.entry.children[0];
  assert.equal(avatar.src, avatarUrl);
  avatar.listeners.error();
  assert.equal(header.entry.children[0].textContent, "测");
});

test("external avatar URLs are ignored", async () => {
  const header = startHeader(() => ({ ok: true, status: 200, json: async () => ({ data: { user: { ...member, avatarUrl: "https://untrusted.example/avatar" } } }) }));
  await settle();
  assert.equal(header.entry.children[0].src, undefined);
  assert.equal(header.entry.children[0].textContent, "测");
});

test("signed-in avatar opens the account menu while anonymous entry stays a login link", async () => {
 const header = startHeader(signedIn); await settle(); let prevented=false;
 header.entry.listeners.click({preventDefault(){prevented=true;}});
 assert.equal(prevented,true); assert.equal(header.menu.open,true);
 header.documentListeners.keydown({key:'Escape'}); assert.equal(header.menu.open,false);
 const anonymous=startHeader(signedOut);await settle();anonymous.entry.listeners.click({preventDefault(){throw Error('Login blocked');}});assert.equal(anonymous.menu.open,false);
});
