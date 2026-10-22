import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { resolveAuthNextPath } from "../public/auth-redirect.mjs";

const html = readFileSync(new URL("../public/auth.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../public/auth.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/, "");
const settle = () => new Promise((resolve) => setImmediate(resolve));
const image = { id: "11111111-1111-4111-8111-111111111111", prompt: "<script>风景</script>", modelName: "测试模型", ratio: "1:1", mimeType: "image/png", createdAt: "2026-10-10T02:00:00.000Z", url: "https://untrusted.example/image" };

async function account(historyResponse) {
  function element(tag = "div") {
    let text = "";
    return {
      tag, children: [], dataset: {}, listeners: {}, hidden: false, attributes: {},
      get textContent() { return text + this.children.map((child) => child.textContent).join(""); },
      set textContent(value) { text = String(value); this.children = []; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { text = ""; this.children = children; },
      remove() {}, setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      querySelectorAll() { return []; },
      classList: { add() {}, remove() {}, toggle() {} }
    };
  }
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], element()]));
  const tabs = [...html.matchAll(/<button[^>]+data-account-section="([^"]+)"/g)].map((match) => {
    const button = element("button"); button.dataset.accountSection = match[1]; return button;
  });
  nodes.get("account-section-tabs").querySelectorAll = () => tabs;
  const listeners = {}, requests = [];
  let respond = historyResponse;
  vm.runInNewContext(source, {
    AbortSignal,
    resolveAuthNextPath, URLSearchParams,
    location: { search: "", hash: "", origin: "https://ontimo.cn" },
    history: { replaceState() {} },
    window: { nikaiStorage: { session: {} }, addEventListener(name, handler) { listeners[name] = handler; } },
    document: { querySelectorAll: () => [], getElementById: (id) => nodes.get(id) || null, createElement: element, body: element() },
    fetch: async (path, options) => {
      requests.push({ path, options });
      if (path.startsWith("/api/v1/image-history")) return respond(path);
      const data = path === "/api/v1/auth/me" ? { user: { id: "member", role: "member", displayName: "测试用户", email: "member@example.test" } } : {};
      return { ok: true, json: async () => ({ data }) };
    }
  });
  await listeners.DOMContentLoaded();
  await settle();
  return {
    nodes, requests,
    select(section) {
      const button = tabs.find((tab) => tab.dataset.accountSection === section);
      assert.ok(button, `Account tab missing: ${section}`);
      nodes.get("account-section-tabs").listeners.click({ target: { closest: () => button } });
    },
    action(action) { nodes.get("account-activity-list").listeners.click({ preventDefault() {}, target: { closest: () => ({ dataset: { accountAction: action } }) } }); },
    respondWith(next) { respond = next; }
  };
}
const page = (items, total = items.length, nextCursor = null) => ({ ok: true, json: async () => ({ data: { items, total, nextCursor } }) });
function descendants(node) { return node.children.flatMap((child) => [child, ...descendants(child)]); }

test("account image history loads private records and renders safe preview and download links", async () => {
  const state = await account(() => page([image]));
  state.select("images"); await settle();
  const request = state.requests.find((item) => item.path.startsWith("/api/v1/image-history"));
  assert.equal(request.options.credentials, "same-origin");
  assert.equal(request.options.cache, "no-store");
  const content = state.nodes.get("account-activity-list");
  assert.match(content.textContent, /<script>风景<\/script>/);
  const children = descendants(content);
  assert.equal(children.find((child) => child.tag === "img").src, `/api/v1/image-history/${image.id}/image`);
  assert.equal(children.filter((child) => child.tag === "script").length, 0);
  assert.ok(children.find((child) => child.tag === "a" && child.download));
  assert.ok(children.filter((child) => child.tag === "a" && child.href?.includes(image.id)).every((child) => child.href.startsWith("/api/v1/image-history/")));
});

test("loading more image history appends records using the supplied cursor", async () => {
  const state = await account(() => page([image], 2, "next/+="));
  state.select("images"); await settle();
  state.respondWith(() => page([{ ...image, id: "22222222-2222-4222-8222-222222222222", prompt: "第二张" }], 2));
  state.action("more-images"); await settle();
  assert.ok(state.requests.some((request) => request.path.includes("cursor=next%2F%2B%3D")));
  assert.equal(descendants(state.nodes.get("account-activity-list")).filter((child) => child.tag === "img").length, 2);
});

test("image history failures offer a retry and an empty account can start generating", async () => {
  const state = await account(() => { throw new Error("暂时无法读取生图记录"); });
  state.select("images"); await settle();
  assert.match(state.nodes.get("account-activity-list").textContent, /暂时无法读取生图记录/);
  state.respondWith(() => page([]));
  state.action("retry-images"); await settle();
  assert.match(state.nodes.get("account-activity-list").textContent, /还没有生图记录/);
  assert.ok(descendants(state.nodes.get("account-activity-list")).some((child) => child.href === "/image-generation"));
});

test("a delayed image-history response does not replace another selected section", async () => {
  let complete;
  const state = await account(() => new Promise((resolve) => { complete = resolve; }));
  state.select("images");
  state.select("favorites");
  complete(page([image])); await settle();
  assert.equal(descendants(state.nodes.get("account-activity-list")).filter((child) => child.tag === "img").length, 0);
  assert.match(state.nodes.get("account-activity-list").textContent, /这里还没有内容/);
});

test("repeated clicks do not issue duplicate image-history requests", async () => {
  let complete;
  const state = await account(() => new Promise((resolve) => { complete = resolve; }));
  state.select("images"); state.select("images");
  assert.equal(state.requests.filter((request) => request.path.startsWith("/api/v1/image-history")).length, 1);
  complete(page([image])); await settle();
});

test("logout discards a pending private image-history response", async () => {
  let complete;
  const state = await account(() => new Promise((resolve) => { complete = resolve; }));
  state.select("images");
  await state.nodes.get("logout-button").listeners.click();
  complete(page([image])); await settle();
  assert.equal(state.nodes.get("account-panel").hidden, true);
  assert.equal(state.nodes.get("account-activity-list").children.length, 0);
});

test("an expired session clears previously displayed image records", async () => {
  const state = await account(() => page([image]));
  state.select("images"); await settle();
  state.respondWith(() => ({ ok: false, status: 401, json: async () => ({ title: "请先登录", code: "not_authenticated" }) }));
  state.select("images"); await settle();
  const list = state.nodes.get("account-activity-list");
  assert.equal(descendants(list).filter((child) => child.tag === "img").length, 0);
  assert.match(list.textContent, /请先登录/);
});
