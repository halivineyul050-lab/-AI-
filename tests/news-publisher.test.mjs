import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFeed,
  runNewsPublisherOnce,
  scheduleNewsPublisher,
} from "../backend/news-publisher.mjs";

function editorialResponse(options, article) {
  const request = JSON.parse(options.body);
  const input = JSON.parse(request.input.find((item) => item.role === "user").content[0].text);
  return JSON.stringify({
    action: "publish_new",
    targetArticleId: null,
    sourceIds: input.sources.slice(0, 1).map((source) => source.id),
    article
  });
}

test("parseFeed extracts recent RSS items", () => {
  const xml = `<?xml version="1.0"?>
    <rss><channel><item>
      <title><![CDATA[AI 产品更新]]></title>
      <link>https://example.com/news/1</link>
      <description><![CDATA[官方发布说明]]></description>
      <pubDate>Wed, 15 Jul 2026 08:00:00 GMT</pubDate>
    </item></channel></rss>`;

  const items = parseFeed(xml, "https://example.com/rss.xml", new Date("2026-07-15T12:00:00Z"));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "AI 产品更新");
  assert.equal(items[0].description, "官方发布说明");
  assert.equal(items[0].link, "https://example.com/news/1");
});

test("publisher stays disabled without an API key", async () => {
  const result = await runNewsPublisherOnce({ db: {}, apiKey: "" });
  assert.deepEqual(result, { skipped: true, reason: "missing_api_key" });

  const scheduled = scheduleNewsPublisher({
    db: {},
    environment: "test",
    env: { NIKE_AUTO_NEWS: "true", OPENAI_API_KEY: "" },
  });
  assert.equal(scheduled.enabled, false);
});

test("publisher defaults to a six-hour interval", () => {
  const scheduled = scheduleNewsPublisher({
    db: {},
    environment: "production",
    env: { NIKE_AUTO_NEWS: "true", OPENAI_API_KEY: "test-key" }
  });
  assert.equal(scheduled.enabled, true);
  assert.equal(scheduled.intervalMs, 6 * 60 * 60_000);
  clearInterval(scheduled.timer);
  clearTimeout(scheduled.startupTimer);
});

test("publisher sends a Responses API request with the configured provider options", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/rss.xml")) {
      return new Response("<rss><channel><item><title>New AI release</title><link>https://example.com/news/2</link></item></channel></rss>", {
        status: 200,
        headers: { "content-type": "application/xml" }
      });
    }
    const request = JSON.parse(options.body);
    const input = JSON.parse(request.input.find((item) => item.role === "user").content[0].text);
    assert.deepEqual(input.recentArticles, [], "the editor should receive recent event anchors for deduplication");
    return new Response(JSON.stringify({
      output_text: editorialResponse(options, { topic: "AI", title: "New AI release", excerpt: "Summary", body: "Detailed article body.", readTime: "3 minutes" })
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await runNewsPublisherOnce({
      db: { prepare: () => ({ get: () => undefined, all: () => [] }) },
      apiKey: "test-key",
      baseUrl: "https://lucen.cc",
      feeds: ["https://example.com/rss.xml"],
      dryRun: true
    });
    const request = [...calls].reverse().find((call) => call.url.endsWith("/v1/responses"));
    const payload = JSON.parse(request.options.body);
    assert.equal(result.dryRun, true);
    assert.equal(request.url, "https://lucen.cc/v1/responses");
    assert.match(request.options.headers["User-Agent"], /^Mozilla\/5\.0/);
    assert.equal(payload.model, "gpt-5.5");
    assert.deepEqual(payload.reasoning, { effort: "xhigh" });
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.type, "json_schema");
    assert.match(result.article.cover, /^https:\/\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publisher falls back when the provider returns reasoning without content", async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/rss.xml")) {
      return new Response("<rss><channel><item><title>Fallback source</title><link>https://example.com/news/3</link></item></channel></rss>", { status: 200 });
    }
    const body = JSON.parse(options.body);
    bodies.push(body);
    if (body.text) return new Response(JSON.stringify({ output: [{ type: "reasoning", content: [] }] }), { status: 200 });
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: editorialResponse(options, { topic: "AI", title: "Fallback", excerpt: "Summary", body: "Detailed fallback article body.", readTime: "1 minute" }) }] }] }), { status: 200 });
  };
  try {
    const result = await runNewsPublisherOnce({
      db: { prepare: () => ({ get: () => undefined, all: () => [] }) },
      apiKey: "test-key",
      feeds: ["https://example.com/rss.xml"],
      dryRun: true
    });
    assert.equal(result.article.title, "Fallback");
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].text.format.type, "json_schema");
    assert.equal(bodies[1].text, undefined);
    assert.equal(bodies[1].reasoning.effort, "low");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publisher attaches a corroborating source to the selected existing event", async () => {
  const originalFetch = globalThis.fetch;
  const attached = new Map();
  const anchor = {
    id: "news-anchor",
    title: "Existing event",
    excerpt: "Existing event summary",
    source_url: "https://official.example/news/1",
    source_name: "Official",
    created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    published_date: new Date().toISOString().slice(0, 10)
  };
  const db = {
    exec() {},
    prepare(sql) {
      if (sql.includes("FROM articles a")) return { all: () => [anchor] };
      if (sql.includes("FROM article_source_links") && sql.includes("article_id IN")) return { all: () => [] };
      if (sql.includes("FROM article_source_links WHERE source_url_hash = ?")) {
        return { get: (hash) => attached.get(hash) };
      }
      if (sql.includes("FROM articles WHERE source_url = ?")) return { get: () => undefined };
      if (sql.includes("FROM articles WHERE id = ? AND kind = 'news'")) {
        return { get: (id) => id === anchor.id ? { id } : undefined };
      }
      if (sql.trimStart().startsWith("INSERT OR IGNORE INTO article_source_links")) {
        return { run: (hash, articleId, sourceUrl) => {
          const existed = attached.has(hash);
          if (!existed) attached.set(hash, { article_id: articleId, source_url: sourceUrl });
          return { changes: Number(!existed) };
        } };
      }
      throw new Error(`Unexpected database query: ${sql}`);
    }
  };

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/rss.xml")) {
      return new Response("<rss><channel><item><title>Corroborating report</title><link>https://reporter.example/news/2</link></item></channel></rss>", { status: 200 });
    }
    const request = JSON.parse(options.body);
    const input = JSON.parse(request.input.find((item) => item.role === "user").content[0].text);
    return new Response(JSON.stringify({ output_text: JSON.stringify({
      action: "attach_sources",
      targetArticleId: anchor.id,
      sourceIds: [input.sources[0].id],
      article: null
    }) }), { status: 200 });
  };

  try {
    const result = await runNewsPublisherOnce({
      db,
      apiKey: "test-key",
      feeds: ["https://example.com/rss.xml"],
      logger: { warn() {} }
    });
    assert.equal(result.attached, true);
    assert.equal(result.published, false);
    assert.equal(result.targetArticleId, anchor.id);
    assert.equal(attached.size, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
