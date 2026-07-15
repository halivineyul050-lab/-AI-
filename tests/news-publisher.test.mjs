import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFeed,
  runNewsPublisherOnce,
  scheduleNewsPublisher,
} from "../backend/news-publisher.mjs";

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
    return new Response(JSON.stringify({
      output_text: JSON.stringify({ topic: "AI", title: "New AI release", excerpt: "Summary", body: "Body", readTime: "3 minutes" })
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await runNewsPublisherOnce({
      db: { prepare: () => ({ get: () => undefined }) },
      apiKey: "test-key",
      baseUrl: "https://lucen.cc",
      feeds: ["https://example.com/rss.xml"],
      dryRun: true
    });
    const request = calls.at(-1);
    const payload = JSON.parse(request.options.body);
    assert.equal(result.dryRun, true);
    assert.equal(request.url, "https://lucen.cc/v1/responses");
    assert.equal(payload.model, "gpt-5.5");
    assert.deepEqual(payload.reasoning, { effort: "xhigh" });
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.type, "json_schema");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
