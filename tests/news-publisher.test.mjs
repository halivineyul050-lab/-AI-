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
