import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApplication } from "../server.mjs";

const token = "content-admin-test-token";

async function startApplication(directory) {
  const app = buildApplication({
    dbPath: join(directory, "content.db"),
    staticDir: directory,
    environment: "test",
    logger: false,
    adminToken: token,
    analyticsSalt: "content-admin-test-salt"
  });
  const address = await app.listen(0, "127.0.0.1");
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function jsonRequest(baseUrl, path, options = {}, authenticated = true) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (authenticated) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const body = await response.json();
  return { response, body };
}

test("CMS CRUD publishes content, audits writes and rejects stale revisions", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nike-cms-api-"));
  const { app, baseUrl } = await startApplication(directory);
  try {
    const denied = await jsonRequest(baseUrl, "/api/admin/v1/content/tools", {}, false);
    assert.equal(denied.response.status, 401);

    const initialVersion = await jsonRequest(baseUrl, "/api/v1/content/version", {}, false);
    assert.equal(initialVersion.response.status, 200);
    assert.equal(initialVersion.body.data.revision, 1);
    assert.equal(initialVersion.response.headers.get("cache-control"), "no-store");

    const category = await jsonRequest(baseUrl, "/api/admin/v1/content/categories", {
      method: "POST",
      body: JSON.stringify({
        id: "cms-category",
        name: "CMS 分类",
        icon: "sparkles",
        description: "通过后台创建的测试分类",
        sortOrder: 20,
        status: "published"
      })
    });
    assert.equal(category.response.status, 201);
    assert.equal(category.body.data.revision, 1);

    const tool = await jsonRequest(baseUrl, "/api/admin/v1/content/tools", {
      method: "POST",
      body: JSON.stringify({
        id: "cms-tool",
        name: "CMS 测试工具",
        officialUrl: "https://example.com/tool",
        logoUrl: "/assets/tool-logos/admin-example.png",
        categoryId: "cms-category",
        categorySortOrder: 3,
        summary: "用于验证后台发布流程的测试工具。",
        description: "这是一段独立撰写的工具介绍，用于验证内容管理、关系字段和发布流程。",
        pricingType: "freemium",
        language: "multi",
        editorScore: 80,
        popularity: 70,
        isSponsored: true,
        status: "published",
        platforms: ["web", "api"],
        features: ["批量处理", "团队协作"],
        useCases: ["运营管理"],
        badges: ["新收录"]
      })
    });
    assert.equal(tool.response.status, 201);
    assert.equal(tool.body.data.slug, "cms-tool");
    assert.deepEqual(tool.body.data.platforms, ["web", "api"]);
    assert.equal(tool.body.data.revision, 1);

    const article = await jsonRequest(baseUrl, "/api/admin/v1/content/articles", {
      method: "POST",
      body: JSON.stringify({
        id: "cms-article",
        kind: "news",
        topic: "产品动态",
        title: "CMS 内容发布测试",
        excerpt: "验证资讯可以从后台直接发布到前端。",
        body: "这是一段用于验证文章新增、编辑、发布和归档能力的正文内容。",
        cover: "https://images.example.com/cover.png",
        date: "2026-07-15",
        readTime: "3分钟",
        source: "官方资料",
        sourceUrl: "https://example.com/source",
        status: "published"
      })
    });
    assert.equal(article.response.status, 201);
    assert.equal(article.body.data.slug, "cms-article");

    const collection = await jsonRequest(baseUrl, "/api/admin/v1/content/collections", {
      method: "POST",
      body: JSON.stringify({
        id: "cms-collection",
        title: "CMS 专题",
        description: "验证专题内工具顺序可以由后台维护。",
        icon: "gallery-horizontal",
        accent: "#0f766e",
        sortOrder: 10,
        status: "published",
        toolIds: ["cms-tool", "doubao"]
      })
    });
    assert.equal(collection.response.status, 201);
    assert.deepEqual(collection.body.data.toolIds, ["cms-tool", "doubao"]);

    const visibleTools = await jsonRequest(baseUrl, "/api/v1/tools?category=cms-category", {}, false);
    assert.equal(visibleTools.body.meta.total, 1);
    assert.equal(visibleTools.body.data[0].name, "CMS 测试工具");
    const bootstrap = await jsonRequest(baseUrl, "/api/v1/site/bootstrap", {}, false);
    assert.ok(bootstrap.body.data.newsItems.some((item) => item.id === "cms-article"));
    assert.ok(bootstrap.body.data.collections.some((item) => item.id === "cms-collection"));

    const updated = await jsonRequest(baseUrl, "/api/admin/v1/content/tools/cms-tool", {
      method: "PATCH",
      body: JSON.stringify({ revision: tool.body.data.revision, summary: "后台更新后的工具摘要内容。" })
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.data.revision, 2);
    assert.equal(updated.body.data.summary, "后台更新后的工具摘要内容。");

    const stale = await jsonRequest(baseUrl, "/api/admin/v1/content/tools/cms-tool", {
      method: "PATCH",
      body: JSON.stringify({ revision: 1, summary: "不应覆盖新版本的摘要。" })
    });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.code, "revision_conflict");

    const categoryInUse = await jsonRequest(baseUrl, "/api/admin/v1/content/categories/cms-category", { method: "DELETE" });
    assert.equal(categoryInUse.response.status, 409);
    assert.equal(categoryInUse.body.code, "category_in_use");

    const unsafe = await jsonRequest(baseUrl, "/api/admin/v1/content/tools", {
      method: "POST",
      body: JSON.stringify({
        name: "危险地址测试",
        officialUrl: "http://127.0.0.1/private",
        categoryId: "chat",
        summary: "该记录不应被创建。",
        description: "该记录使用私有网络地址，因此必须被验证层拒绝。",
        unexpectedSql: "DROP TABLE tools"
      })
    });
    assert.equal(unsafe.response.status, 422);
    assert.equal(unsafe.body.code, "unknown_fields");

    const audits = Number(app.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE entity_type IN ('tool', 'category', 'article', 'collection')").get().count);
    assert.equal(audits, 5);
    const finalVersion = await jsonRequest(baseUrl, "/api/v1/content/version", {}, false);
    assert.equal(finalVersion.body.data.revision, 6);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Logo upload verifies signatures, sanitizes SVG and writes an audited local asset", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nike-cms-logo-"));
  const { app, baseUrl } = await startApplication(directory);
  try {
    const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const uploaded = await jsonRequest(baseUrl, "/api/admin/v1/content/media/logos", {
      method: "POST",
      body: JSON.stringify({ fileName: "测试 logo.png", mimeType: "image/png", dataBase64: onePixelPng })
    });
    assert.equal(uploaded.response.status, 201);
    assert.match(uploaded.body.data.logoUrl, /^\/assets\/tool-logos\/admin-[0-9a-f-]+\.png$/);
    assert.equal(uploaded.body.data.mimeType, "image/png");
    assert.ok(existsSync(join(directory, uploaded.body.data.logoUrl)));
    const served = await fetch(`${baseUrl}${uploaded.body.data.logoUrl}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/png");

    const spoofed = await jsonRequest(baseUrl, "/api/admin/v1/content/media/logos", {
      method: "POST",
      body: JSON.stringify({ mimeType: "image/png", dataBase64: Buffer.from("not a png").toString("base64") })
    });
    assert.equal(spoofed.response.status, 422);
    assert.equal(spoofed.body.code, "logo_signature_mismatch");

    const unsafeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
    const rejectedSvg = await jsonRequest(baseUrl, "/api/admin/v1/content/media/logos", {
      method: "POST",
      body: JSON.stringify({ mimeType: "image/svg+xml", dataBase64: unsafeSvg })
    });
    assert.equal(rejectedSvg.response.status, 422);
    assert.equal(rejectedSvg.body.code, "logo_signature_mismatch");
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'upload_logo'").get().count, 1);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CMS-managed seed content survives application restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nike-cms-restart-"));
  let running = await startApplication(directory);
  try {
    const tool = await jsonRequest(running.baseUrl, "/api/admin/v1/content/tools/orange-dream-factory");
    const updatedTool = await jsonRequest(running.baseUrl, "/api/admin/v1/content/tools/orange-dream-factory", {
      method: "PATCH",
      body: JSON.stringify({
        revision: tool.body.data.revision,
        name: "后台维护的橙星梦工厂",
        logoUrl: "/assets/tool-logos/admin-persisted.png"
      })
    });
    assert.equal(updatedTool.response.status, 200);

    const article = await jsonRequest(running.baseUrl, "/api/admin/v1/content/articles/news-openai-gpt-5-6");
    const updatedArticle = await jsonRequest(running.baseUrl, "/api/admin/v1/content/articles/news-openai-gpt-5-6", {
      method: "PATCH",
      body: JSON.stringify({ revision: article.body.data.revision, title: "后台维护的资讯标题" })
    });
    assert.equal(updatedArticle.response.status, 200);
    const revisionBeforeRestart = (await jsonRequest(running.baseUrl, "/api/v1/content/version", {}, false)).body.data.revision;

    await running.app.close();
    running = await startApplication(directory);
    const persistedTool = await jsonRequest(running.baseUrl, "/api/admin/v1/content/tools/orange-dream-factory");
    assert.equal(persistedTool.body.data.name, "后台维护的橙星梦工厂");
    assert.equal(persistedTool.body.data.logoUrl, "/assets/tool-logos/admin-persisted.png");
    const persistedArticle = await jsonRequest(running.baseUrl, "/api/admin/v1/content/articles/news-openai-gpt-5-6");
    assert.equal(persistedArticle.body.data.title, "后台维护的资讯标题");
    const revisionAfterRestart = (await jsonRequest(running.baseUrl, "/api/v1/content/version", {}, false)).body.data.revision;
    assert.equal(revisionAfterRestart, revisionBeforeRestart);
  } finally {
    await running.app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
