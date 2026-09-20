import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { buildApplication } from "../server.mjs";

let app;
let baseUrl;
let testDir;

before(async () => {
  testDir = mkdtempSync(join(tmpdir(), "nike-ai-production-games-"));
  app = buildApplication({
    dbPath: join(testDir, "test.db"),
    logger: false,
    adminToken: "integration-test-admin-token",
    analyticsSalt: "integration-test-analytics-salt"
  });
  const address = await app.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("production game roots and representative assets are served", async () => {
  const cases = [
    ["/games/ironfront", "一人不撤2", "/games/ironfront/assets/main.js", /javascript/],
    ["/games/yiren-buche", "一人不撤", "/games/yiren-buche/style.css", /text\/css/],
    ["/games/tank-air-war", "坦克飞机大战", "/games/tank-air-war/js/main.js", /javascript/]
  ];

  for (const [route, title, assetPath, contentType] of cases) {
    const page = await fetch(`${baseUrl}${route}`);
    assert.equal(page.status, 200, route);
    assert.match(await page.text(), new RegExp(title));

    const asset = await fetch(`${baseUrl}${assetPath}`);
    assert.equal(asset.status, 200, assetPath);
    assert.match(asset.headers.get("content-type") || "", contentType);

    const head = await fetch(`${baseUrl}${assetPath}`, { method: "HEAD" });
    assert.equal(head.status, 200, `${assetPath} HEAD`);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  }
});

test("production game asset routes reject traversal", async () => {
  for (const path of [
    "/games/ironfront/%2e%2e/%2e%2e/server.mjs",
    "/games/yiren-buche/%2e%2e/%2e%2e/package.json",
    "/games/tank-air-war/%2e%2e/%2e%2e/server.mjs"
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404, path);
  }
});

test("games index and sitemap list all production games", async () => {
  const games = await (await fetch(`${baseUrl}/games`)).text();
  assert.equal((games.match(/class="[^"]*\bgame-card\b[^"]*"/g) || []).length, 10);
  assert.equal((games.match(/\bgame-card--hero\b/g) || []).length, 1);
  assert.equal((games.match(/\bgame-card--wide\b/g) || []).length, 2);
  assert.equal((games.match(/\bgame-card--compact\b/g) || []).length, 7);
  assert.match(games, /href="\/games\/ironfront"/);
  assert.match(games, /href="\/games\/yiren-buche"/);
  assert.match(games, /href="\/games\/tank-air-war"/);
  assert.match(games, /10 款小游戏/);
  assert.match(games, /class="card-art tank-air-war"/);

  const sitemap = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  assert.match(sitemap, /\/games\/ironfront<\/loc>/);
  assert.match(sitemap, /\/games\/yiren-buche<\/loc>/);
  assert.match(sitemap, /\/games\/tank-air-war<\/loc>/);
});

test("production game documents expose a return link and reachable local dependencies", async () => {
  for (const route of ["/games/ironfront", "/games/yiren-buche", "/games/tank-air-war"]) {
    const pageUrl = new URL(route, baseUrl);
    const html = await (await fetch(pageUrl)).text();
    assert.match(html, /class="site-return" href="\/games"/);
    const baseReference = html.match(/<base href=["']([^"']+)["']/)?.[1];
    const documentBaseUrl = baseReference ? new URL(baseReference, pageUrl) : pageUrl;

    const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((reference) => !reference.startsWith("#") && reference !== "/games");
    assert.ok(references.length >= 2, `${route} should declare local dependencies`);
    for (const reference of references) {
      const resource = await fetch(new URL(reference, documentBaseUrl));
      assert.equal(resource.status, 200, `${route}: ${reference}`);
    }
  }
});

test("return controls resist narrow-screen wrapping", async () => {
  for (const path of [
    "/games/ironfront/assets/style.css",
    "/games/yiren-buche/style.css",
    "/games/tank-air-war/style.css"
  ]) {
    const css = await (await fetch(`${baseUrl}${path}`)).text();
    assert.match(css, /\.site-return\{[^}]*white-space:nowrap/);
  }
});
