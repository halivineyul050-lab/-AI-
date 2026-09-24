import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../site-announcements.js", import.meta.url), "utf8");

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.open = false; }
  setAttribute(name, value) { this[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  querySelector() { return null; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() { this.removed = true; }
}

test("announcements render from the standard API data.items envelope", async () => {
  const body = new Element("body");
  const document = { readyState: "complete", body, createElement: (tag) => new Element(tag) };
  const context = {
    document,
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: true, json: async () => ({ data: { items: [{ id: "notice-1", title: "新功能上线", body: "欢迎体验", version: 1 }] } }) })
  };
  vm.runInNewContext(source, context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const dialog = body.children.find((node) => node.tagName === "dialog");
  assert.ok(dialog, "a dialog is appended for a published announcement");
  assert.equal(dialog.open, true);
});
