import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { buildApplication } from "../server.mjs";
import { normalizePublicUrl } from "../backend/validation.mjs";

let app;
let baseUrl;
let testDir;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

before(async () => {
  testDir = mkdtempSync(join(tmpdir(), "nike-ai-backend-"));
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

test("health and bootstrap expose persisted content", async () => {
  const health = await request("/api/v1/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.data.database, true);

  const bootstrap = await request("/api/v1/site/bootstrap");
  assert.equal(bootstrap.response.status, 200);
  assert.equal(Object.hasOwn(bootstrap.body.data, "tools"), false);
  assert.ok(bootstrap.body.data.categories.length >= 9);
  assert.equal(bootstrap.body.data.tutorials.length, 5);
  assert.equal(bootstrap.body.data.newsItems.length, 7);
  assert.equal(bootstrap.body.data.collections.length, 3);
  const sponsor = bootstrap.body.data.sponsor;
  assert.equal(sponsor.id, "orange-dream-factory");
  assert.equal(sponsor.name, "橙星梦工厂");
  assert.equal(sponsor.sponsored, true);
  const allCategory = bootstrap.body.data.categories.find((category) => category.id === "all");
  const comicCategory = bootstrap.body.data.categories.find((category) => category.id === "comic");
  const organicCount = Number(app.db.prepare("SELECT COUNT(*) AS count FROM tools WHERE status = 'published' AND is_sponsored = 0").get().count);
  assert.equal(allCategory.toolCount, organicCount);
  assert.equal(comicCategory.name, "AI 漫剧");
  assert.equal(comicCategory.toolCount, 1);
  assert.equal(sponsor.category, "comic");
  assert.equal(sponsor.logoUrl, "/assets/tool-logos/orange-dream-factory.ico");
  assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM tools WHERE status = 'published' AND logo_url LIKE '/assets/tool-logos/%'").get().count, 28);
  const gptNews = bootstrap.body.data.newsItems.find((item) => item.id === "news-openai-gpt-5-6");
  assert.equal(gptNews.source, "OpenAI");
  assert.match(gptNews.sourceUrl, /^https:\/\//);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 1").get().count, 1);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count, 12);
  assert.equal(app.db.prepare("PRAGMA user_version").get().user_version, 12);
});

test("brand icon is served with the expected media type", async () => {
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /brand-icon-192\.png/);

  const icon = await fetch(`${baseUrl}/brand-icon-192.png`);
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get("content-type"), "image/png");
  assert.ok((await icon.arrayBuffer()).byteLength > 10_000);

  const toolLogo = await fetch(`${baseUrl}/assets/tool-logos/orange-dream-factory.ico`);
  assert.equal(toolLogo.status, 200);
  assert.equal(toolLogo.headers.get("content-type"), "image/x-icon");
  assert.ok((await toolLogo.arrayBuffer()).byteLength > 100);

  const traversal = await fetch(`${baseUrl}/assets/tool-logos/%2e%2e%2fserver.mjs`);
  assert.equal(traversal.status, 404);

  const terms = await fetch(`${baseUrl}/terms`);
  assert.equal(terms.status, 200);
  assert.match(await terms.text(), /用户协议与服务条款/);

  const category = await fetch(`${baseUrl}/category/coding`);
  assert.equal(category.status, 200);

  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type") || "", /xml/);
  assert.match(await sitemap.text(), /\/category\/coding/);
});

test("tool detail SEO pages render crawlable HTML and appear in sitemap", async () => {
  const page = await fetch(`${baseUrl}/tools/doubao`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") || "", /text\/html/);
  const html = await page.text();
  assert.match(html, /<h1>豆包<\/h1>/);
  assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/tools\/doubao">/);
  assert.match(html, /application\/ld\+json/);
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch);
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.ok(jsonLd.some((item) => item["@type"] === "SoftwareApplication"));
  assert.ok(jsonLd.some((item) => item["@type"] === "FAQPage"));
  assert.match(html, /主要功能/);
  assert.match(html, /适用场景/);
  assert.match(html, /同类替代工具/);
  assert.match(html, /\/r\/tools\/doubao\?placement=detail_drawer/);

  const missing = await fetch(`${baseUrl}/tools/not-a-real-tool`);
  assert.equal(missing.status, 404);

  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /\/tools\/doubao/);
});

test("every seeded tool exposes a reachable local Logo asset", async () => {
  const [toolsResponse, bootstrapResponse] = await Promise.all([
    request("/api/v1/tools?limit=200&offset=0"),
    request("/api/v1/site/bootstrap")
  ]);
  const items = [...toolsResponse.body.data, bootstrapResponse.body.data.sponsor];
  assert.equal(items.length, 28);
  for (const tool of items) {
    assert.match(tool.logoUrl, /^\/assets\/tool-logos\//);
    const logo = await fetch(`${baseUrl}${tool.logoUrl}`);
    assert.equal(logo.status, 200, `${tool.name} Logo status`);
    assert.match(logo.headers.get("content-type") || "", /^image\//, `${tool.name} Logo MIME`);
    assert.ok((await logo.arrayBuffer()).byteLength > 20, `${tool.name} Logo bytes`);
  }
});

test("tool API combines search and structured filters", async () => {
  const result = await request("/api/v1/tools?q=代码&category=coding&platform=desktop&language=multi&sort=popular");
  assert.equal(result.response.status, 200);
  assert.ok(result.body.meta.total >= 1);
  assert.ok(result.body.data.every((tool) => tool.category === "coding"));
  assert.ok(result.body.data.every((tool) => tool.platforms.includes("desktop")));
  assert.ok(result.body.data.every((tool) => tool.language === "multi"));

  const detail = await request("/api/v1/tools/doubao");
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.data.id, "doubao");
  assert.match(detail.body.data.officialUrl, /^\/r\/tools\/doubao/);

  const featureSearch = await request("/api/v1/tools?q=%E5%85%A8%E6%A0%88%E5%BC%80%E5%8F%91");
  assert.equal(featureSearch.response.status, 200);
  assert.ok(featureSearch.body.data.some((tool) => tool.id === "cursor"));
});

test("tool API paginates the organic catalog without overlaps", async () => {
  const first = await request("/api/v1/tools?sort=name&limit=5&offset=0");
  const second = await request("/api/v1/tools?sort=name&limit=5&offset=5");
  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.length, 5);
  assert.equal(first.body.meta.limit, 5);
  assert.equal(first.body.meta.offset, 0);
  assert.ok(first.body.meta.total >= 10);
  assert.equal(second.body.meta.offset, 5);
  assert.equal(second.body.data.length, 5);
  assert.equal(first.body.data.some((tool) => tool.sponsored), false);
  assert.equal(second.body.data.some((tool) => tool.sponsored), false);
  const firstIds = new Set(first.body.data.map((tool) => tool.id));
  assert.equal(second.body.data.some((tool) => firstIds.has(tool.id)), false);
});

test("AI comic category includes the disclosed sponsor and pins Orange Dream Factory first", async () => {
  const result = await request("/api/v1/tools?category=comic&sort=name&limit=24&offset=0");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.meta.total, 1);
  assert.equal(result.body.data[0].id, "orange-dream-factory");
  assert.equal(result.body.data[0].sponsored, true);
  assert.equal(result.body.data[0].category, "comic");
  assert.match(result.body.data[0].logoUrl, /^\/assets\/tool-logos\//);
});

test("submission is validated, persisted and idempotent", async () => {
  const payload = {
    name: "后端测试工具",
    websiteUrl: "https://backend-test.example.com/product",
    categoryId: "coding",
    summary: "用于验证真实投稿入库和重复提交控制的测试工具。",
    contactEmail: "owner@example.com",
    declarationAccepted: true,
    termsAccepted: true,
    source: "integration_test",
    company: ""
  };
  const first = await request("/api/v1/tool-submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "integration-submit-0001" },
    body: JSON.stringify(payload)
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.data.status, "pending");
  assert.match(first.body.data.trackingCode, /^NK-/);
  assert.equal(first.body.data.lookupToken, "integration-submit-0001");

  const status = await request(`/api/v1/tool-submissions/${first.body.data.trackingCode}/status?token=${first.body.data.lookupToken}`);
  assert.equal(status.response.status, 200);
  assert.equal(status.body.data.status, "pending");

  const replay = await request("/api/v1/tool-submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "integration-submit-0001" },
    body: JSON.stringify(payload)
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.data.id, first.body.data.id);

  const listed = await request("/api/v1/tool-submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "integration-submit-0002" },
    body: JSON.stringify({ ...payload, websiteUrl: "https://www.doubao.com/" })
  });
  assert.equal(listed.response.status, 409);
  assert.equal(listed.body.code, "tool_already_listed");
});

test("URL validation rejects local and private network targets", () => {
  assert.throws(
    () => normalizePublicUrl("http://127.0.0.1/private"),
    (error) => error.status === 422 && error.code === "private_url"
  );
  assert.throws(
    () => normalizePublicUrl("http://[::1]/private"),
    (error) => error.status === 422 && error.code === "private_url"
  );
  assert.throws(
    () => normalizePublicUrl("http://[fc00::1]/private"),
    (error) => error.status === 422 && error.code === "private_url"
  );
});

test("newsletter subscription is persisted and repeated calls are idempotent", async () => {
  const payload = {
    email: "Reader@Example.com",
    topicSlugs: [],
    consentVersion: "2026-07",
    consentAccepted: true,
    source: "integration_test"
  };
  const first = await request("/api/v1/newsletter/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.data.status, "active");

  const repeated = await request("/api/v1/newsletter/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.data.id, first.body.data.id);

  const unsubscribe = await request(`/api/v1/newsletter/subscriptions/${repeated.body.data.unsubscribeToken}`, { method: "DELETE" });
  assert.equal(unsubscribe.response.status, 200);
  assert.equal(unsubscribe.body.data.unsubscribed, true);

  const unsubscribed = await request("/api/v1/newsletter/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(unsubscribed.response.status, 200);
  assert.equal(unsubscribed.body.data.status, "unsubscribed");
});

test("feedback requires consent and is persisted for review", async () => {
  const denied = await request("/api/v1/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "bug", message: "工具详情页面的链接显示异常。", consentAccepted: false })
  });
  assert.equal(denied.response.status, 422);
  assert.equal(denied.body.code, "consent_required");

  const accepted = await request("/api/v1/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "content",
      message: "ChatGPT 工具页面的价格信息需要重新核验。",
      contactEmail: "feedback@example.com",
      pageUrl: "/#feedback",
      consentVersion: "2026-07",
      consentAccepted: true,
      company: ""
    })
  });
  assert.equal(accepted.response.status, 201);
  assert.equal(accepted.body.data.status, "pending");
  const row = app.db.prepare("SELECT category, contact_email, status FROM feedback_messages WHERE id = ?").get(accepted.body.data.id);
  assert.equal(row.category, "content");
  assert.equal(row.contact_email, "feedback@example.com");
  assert.equal(row.status, "pending");
});

test("event ingestion deduplicates by event id", async () => {
  const payload = {
    visitorId: "visitor-integration-0001",
    sessionId: "session-integration-0001",
    events: [{
      eventId: "event-integration-0001",
      eventName: "page_view",
      clientTime: new Date().toISOString(),
      pageType: "tools",
      path: "/#tools",
      properties: { viewport: "1440x900" }
    }]
  };
  const first = await request("/api/v1/events/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(first.response.status, 202);
  assert.equal(first.body.data.accepted, 1);

  const duplicate = await request("/api/v1/events/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(duplicate.body.data.accepted, 0);
  assert.equal(duplicate.body.data.duplicate, 1);
});

test("official redirect uses the reviewed database URL", async () => {
  const result = await request("/r/tools/doubao?placement=detail_drawer", {
    headers: { Cookie: "nike_session=session-integration-redirect-0001" }
  });
  assert.equal(result.response.status, 302);
  assert.equal(result.response.headers.get("location"), "https://www.doubao.com/");
  const repeated = await request("/r/tools/doubao?placement=detail_drawer", {
    headers: { Cookie: "nike_session=session-integration-redirect-0001" }
  });
  assert.equal(repeated.response.status, 302);
});

test("admin endpoints require a token and expose operational totals", async () => {
  const denied = await request("/api/admin/v1/summary");
  assert.equal(denied.response.status, 401);

  const allowed = await request("/api/admin/v1/summary", {
    headers: { Authorization: "Bearer integration-test-admin-token" }
  });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.body.data.tools, 28);
  assert.equal(allowed.body.data.pendingSubmissions, 1);
  assert.equal(allowed.body.data.pendingFeedback, 1);
  assert.equal(allowed.body.data.activeSubscribers, 0);
  assert.equal(allowed.body.data.events, 1);
  assert.equal(allowed.body.data.outboundClicks, 1);

  const submissions = await request("/api/admin/v1/submissions?status=pending", {
    headers: { Authorization: "Bearer integration-test-admin-token" }
  });
  assert.equal(submissions.body.data.length, 1);
  const submissionId = submissions.body.data[0].id;
  const reviewed = await request(`/api/admin/v1/submissions/${submissionId}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer integration-test-admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved", reviewNote: "集成测试审核" })
  });
  assert.equal(reviewed.response.status, 200);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id = ?").get(submissionId).count, 1);

  const reviewedAgain = await request(`/api/admin/v1/submissions/${submissionId}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer integration-test-admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({ status: "rejected", reviewNote: "重复审核" })
  });
  assert.equal(reviewedAgain.response.status, 409);
});

test("production refuses ephemeral database and analytics configuration", () => {
  assert.throws(
    () => buildApplication({ environment: "production", logger: false }),
    /NIKE_DB_PATH/
  );
});
