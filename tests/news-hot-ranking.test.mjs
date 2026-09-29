import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { getNewsHotRanking, getRecentNewsEventAnchors } from "../backend/database.mjs";
import { sourceUrlHash } from "../backend/article-source-links.mjs";
import { calculateNewsHotRanking } from "../backend/news-hot-ranking.mjs";

const schemaSql = readFileSync(new URL("../backend/schema.sql", import.meta.url), "utf8");
const articleSourcesMigration = readFileSync(new URL("../backend/migrations/003_article_sources.sql", import.meta.url), "utf8");
const eventSourcesMigration = readFileSync(new URL("../backend/migrations/018_article_source_links.sql", import.meta.url), "utf8");

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

function createNewsDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaSql);
  db.exec(articleSourcesMigration);
  db.exec(eventSourcesMigration);
  return db;
}

function insertLegacyNews(db, { id, createdAt, publishedDate = "2020-01-01", sourceUrl = "https://legacy.example/old-story" }) {
  db.prepare(`
    INSERT INTO articles (
      id, slug, kind, topic, title, excerpt, cover_url, body_text, published_date,
      read_time, source_name, source_url, created_at, updated_at
    ) VALUES (?, ?, 'news', 'AI 行业', ?, '', '', '', ?, '3分钟', 'Legacy', ?, ?, ?)
  `).run(id, id, `Legacy event ${id}`, publishedDate, sourceUrl, createdAt, createdAt);
}

test("old legacy news is not a recent publisher anchor just because it was imported recently", () => {
  const db = createNewsDatabase();
  insertLegacyNews(db, { id: "legacy-anchor", createdAt: at(2) });

  assert.deepEqual(getRecentNewsEventAnchors(db, now), []);
  db.close();
});

test("old legacy source is not counted as fresh coverage after a new source is attached", () => {
  const db = createNewsDatabase();
  insertLegacyNews(db, { id: "legacy-ranking", createdAt: at(2) });
  const sourceUrl = "https://new-coverage.example/story";
  db.prepare(`
    INSERT INTO article_source_links (
      source_url_hash, article_id, source_url, source_name, feed_url, source_title,
      source_published_at, discovered_at
    ) VALUES (?, ?, ?, 'New coverage', '', 'Recent report', ?, ?)
  `).run(sourceUrlHash(sourceUrl), "legacy-ranking", sourceUrl, at(1), at(1));

  assert.deepEqual(getNewsHotRanking(db, now), []);
  db.close();
});
