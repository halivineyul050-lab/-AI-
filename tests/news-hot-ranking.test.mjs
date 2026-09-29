import assert from "node:assert/strict";
import test from "node:test";

import { calculateNewsHotRanking } from "../backend/news-hot-ranking.mjs";

const now = Date.parse("2026-09-29T12:00:00.000Z");
const at = (hoursAgo) => new Date(now - hoursAgo * 60 * 60_000).toISOString();
const source = (url, hoursAgo, sourceName = new URL(url).hostname) => ({
  sourceUrl: url,
  sourceName,
  sourcePublishedAt: at(hoursAgo)
});

test("hot ranking requires distinct sources inside 48 hours and hides the internal score", () => {
  const ranked = calculateNewsHotRanking([
    {
      id: "multi-source",
      title: "Multi-source event",
      sources: [
        source("https://www.openai.com/news", 1, "OpenAI"),
        source("https://openai.com/blog", 2, "OpenAI Blog"),
        source("https://techcrunch.com/story", 4, "TechCrunch")
      ]
    },
    {
      id: "same-host",
      title: "Duplicate site coverage",
      sources: [source("https://www.example.com/a", 1), source("https://example.com/b", 2)]
    },
    {
      id: "outside-window",
      title: "Old coverage",
      sources: [source("https://old.example/a", 49), source("https://other.example/b", 50)]
    }
  ], now, 10);

  assert.deepEqual(ranked.map((item) => item.id), ["multi-source"]);
  assert.equal(ranked[0].sourceCount, 2);
  assert.equal(Object.hasOwn(ranked[0], "heat"), false);
  assert.equal(ranked[0].rank, 1);
});

test("hot ranking marks recently discovered and rapidly rising events", () => {
  const ranked = calculateNewsHotRanking([
    {
      id: "new-surge",
      title: "New event",
      sources: [
        source("https://one.example/a", 1),
        source("https://two.example/a", 2),
        source("https://three.example/a", 3)
      ]
    },
    {
      id: "rising",
      title: "Rising event",
      firstSourceAt: at(24),
      sources: [
        source("https://alpha.example/a", 24),
        source("https://beta.example/a", 20),
        source("https://gamma.example/a", 1)
      ]
    }
  ], now, 10);

  const newEvent = ranked.find((item) => item.id === "new-surge");
  const risingEvent = ranked.find((item) => item.id === "rising");
  assert.ok(newEvent.badges.includes("new"));
  assert.ok(newEvent.badges.includes("surge"));
  assert.ok(risingEvent.badges.includes("rising"));
});
