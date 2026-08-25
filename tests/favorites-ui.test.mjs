import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const app = readFileSync(resolve(root, "app.js"), "utf8");

test("favorites are discoverable from labeled desktop and mobile entries", () => {
  assert.match(html, /id="favorite-toggle"[\s\S]{0,400}我的收藏/);
  assert.match(html, /id="mobile-favorites-open"/);
  assert.match(html, /id="mobile-favorite-count"/);
});

test("favorites view explains local persistence and exposes explicit actions", () => {
  assert.match(html, /id="favorites-view-heading"/);
  assert.match(html, /id="favorites-back"/);
  assert.match(html, /id="favorites-clear"/);
  assert.match(html, /收藏仅保存在当前浏览器/);
});

test("favorites use a stable route and observable view actions", () => {
  assert.match(app, /location\.pathname === "\/favorites"/);
  assert.match(app, /history\.replaceState\(null, "", favoritesUrl/);
  assert.match(app, /favorites_view/);
  assert.match(app, /favorites_clear/);
  assert.doesNotMatch(app, /params\.set\("favorites", "1"\)/);
});
