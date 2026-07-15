import { createHash } from "node:crypto";
import { createAdminContent } from "./content-admin.mjs";

const defaultFeeds = [
  "https://openai.com/news/rss.xml",
  "https://news.microsoft.com/source/topics/ai/feed/",
  "https://blog.google/technology/ai/rss/"
];

function decodeXml(value = "") {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(source, tag) {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return decodeXml(match?.[1] || "");
}

export function parseFeed(xml, feedUrl, now = Date.now()) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const item = match[1];
      const title = tagValue(item, "title");
      const link = tagValue(item, "link") || tagValue(item, "guid");
      const description = tagValue(item, "description");
      const publishedAt = tagValue(item, "pubDate") || tagValue(item, "published") || tagValue(item, "updated");
      return { title, link, description, publishedAt, feedUrl };
    })
    .filter((item) => item.title && /^https?:\/\//i.test(item.link))
    .filter((item) => {
      const timestamp = Date.parse(item.publishedAt);
      return !Number.isFinite(timestamp) || now - timestamp <= 72 * 60 * 60_000;
    });
}

async function fetchFeed(url) {
  const response = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
  if (!response.ok) throw new Error(`feed ${url} returned ${response.status}`);
  return parseFeed(await response.text(), url);
}

function articleSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["topic", "title", "excerpt", "body", "readTime"],
    properties: {
      topic: { type: "string" },
      title: { type: "string" },
      excerpt: { type: "string" },
      body: { type: "string" },
      readTime: { type: "string" }
    }
  };
}

async function generateArticle(items, apiKey, model) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: { name: "ai_news_article", strict: true, schema: articleSchema() } },
      messages: [
        {
          role: "system",
          content: "你是泥壳AI工具站的资讯编辑。只根据给定来源写一篇中文AI行业资讯。不要编造未在来源中出现的数字、人物、时间或功能，不要长段复制原文。文章要有清晰标题、摘要和正文，适合直接发布；正文应说明事件、背景、对工具用户的影响和来源边界。"
        },
        { role: "user", content: JSON.stringify({ sources: items }) }
      ]
    })
  });
  if (!response.ok) throw new Error(`AI API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI API returned no article content");
  return JSON.parse(content);
}

function articleId(sourceUrl) {
  return `auto-news-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16)}`;
}

export async function runNewsPublisherOnce({ db, apiKey, model = "gpt-4o-mini", feeds = defaultFeeds, logger = console, dryRun = false } = {}) {
  if (!apiKey) return { skipped: true, reason: "missing_api_key" };
  const feedItems = [];
  for (const feed of feeds) {
    try {
      feedItems.push(...(await fetchFeed(feed)).slice(0, 8));
    } catch (error) {
      logger.warn?.(`[news-publisher] ${error.message}`);
    }
  }
  const freshItems = feedItems
    .filter((item, index, list) => list.findIndex((candidate) => candidate.link === item.link) === index)
    .slice(0, 12);
  if (!freshItems.length) return { skipped: true, reason: "no_recent_sources" };
  const unseen = freshItems.filter((item) => !db.prepare("SELECT 1 FROM articles WHERE source_url = ?").get(item.link));
  if (!unseen.length) return { skipped: true, reason: "all_sources_seen", sourceCount: freshItems.length };
  const primarySource = unseen[0];
  const article = await generateArticle([primarySource], apiKey, model);
  const body = {
    id: articleId(primarySource.link),
    kind: "news",
    topic: String(article.topic || "AI 行业").slice(0, 80),
    title: String(article.title || primarySource.title).slice(0, 200),
    excerpt: String(article.excerpt || primarySource.description).slice(0, 500),
    body: String(article.body || "").slice(0, 250_000),
    cover: "",
    date: new Date().toISOString().slice(0, 10),
    readTime: String(article.readTime || "3分钟").slice(0, 30),
    source: "AI自动采编",
    sourceUrl: primarySource.link,
    status: "published"
  };
  if (dryRun) return { published: false, dryRun: true, article: body, sourceCount: 1 };
  const created = createAdminContent(db, "articles", body, { actor: "auto-news-publisher", requestId: `auto-${Date.now()}` });
  return { published: true, article: created.item, sourceCount: 1 };
}

export function scheduleNewsPublisher({ db, environment = "development", logger = console, env = process.env } = {}) {
  const enabled = env.NIKE_AUTO_NEWS === "true";
  const apiKey = env.OPENAI_API_KEY || "";
  if (environment === "test" || !enabled || !apiKey) return { enabled: false, timer: null, startupTimer: null };
  const intervalMs = Math.max(Number(env.NIKE_NEWS_INTERVAL_MINUTES || 360), 15) * 60_000;
  const feeds = String(env.NIKE_NEWS_FEEDS || defaultFeeds.join(",")).split(",").map((item) => item.trim()).filter(Boolean);
  const model = env.NIKE_NEWS_AI_MODEL || "gpt-4o-mini";
  const run = () => runNewsPublisherOnce({ db, apiKey, model, feeds, logger }).catch((error) => logger.error?.(`[news-publisher] ${error.message}`));
  const timer = setInterval(run, intervalMs);
  timer.unref();
  const startupTimer = setTimeout(run, 10_000);
  startupTimer.unref();
  return { enabled: true, timer, startupTimer, intervalMs };
}
