import { createHash } from "node:crypto";
import { createAdminContent } from "./content-admin.mjs";

const defaultFeeds = [
  "https://openai.com/news/rss.xml",
  "https://news.microsoft.com/source/topics/ai/feed/",
  "https://blog.google/technology/ai/rss/",
  "https://huggingface.co/blog/feed.xml",
  "https://techcrunch.com/category/artificial-intelligence/feed/"
];

const fallbackCovers = [
  "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=82",
  "https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=1200&q=82"
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

function metaValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
  const first = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const second = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i");
  const match = html.match(first) || html.match(second);
  return decodeXml(match?.[1] || "");
}

async function fetchCoverImage(sourceUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(sourceUrl, {
      headers: { Accept: "text/html, application/xhtml+xml" },
      signal: controller.signal
    });
    if (!response.ok) return "";
    const html = (await response.text()).slice(0, 300_000);
    const candidate = metaValue(html, "og:image") || metaValue(html, "twitter:image");
    if (!candidate) return "";
    const imageUrl = new URL(candidate, sourceUrl);
    return imageUrl.protocol === "https:" ? imageUrl.toString() : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`feed ${url} returned ${response.status}`);
    return parseFeed(await response.text(), url);
  } finally {
    clearTimeout(timeout);
  }
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

function responseEndpoint(baseUrl, path = "/v1/responses") {
  return `${String(baseUrl || "https://api.openai.com").replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

function responseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text) return payload.output_text;
  const parts = payload?.output?.flatMap((item) => item.content || []) || [];
  return parts.find((part) => part.type === "output_text" && typeof part.text === "string")?.text || "";
}

async function requestArticle(items, { apiKey, model, baseUrl, apiPath, reasoningEffort, disableResponseStorage, structured }) {
  const systemText = "你是泥壳AI工具站的资讯编辑。只根据给定来源写一篇中文AI行业资讯。来源已经过基础去重，但仍要进行交叉核验：优先使用官方公告、公司博客、论文或技术报告、权威媒体和投资机构公告；遇到来源冲突要明确说明，不要把未经证实的单一来源传闻写成事实。不要编造未在来源中出现的数字、人物、时间或功能，不要长段复制原文。文章要有清晰标题、摘要和正文，适合直接发布；正文应说明事件、背景、对工具用户的影响和来源边界。每轮只选择一个最具时效性、传播价值和读者关注度的主选题。";
  const inputText = JSON.stringify({ sources: items });
  const requestBody = {
    model,
    reasoning: { effort: reasoningEffort },
    store: !disableResponseStorage,
    input: [
      { role: "system", content: [{ type: "input_text", text: structured ? systemText : `${systemText} 只输出一个合法JSON对象，不要Markdown代码块。` }] },
      { role: "user", content: [{ type: "input_text", text: inputText }] }
    ]
  };
  if (structured) {
    requestBody.text = { format: { type: "json_schema", name: "ai_news_article", strict: true, schema: articleSchema() } };
  }
  const response = await fetch(responseEndpoint(baseUrl, apiPath), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) throw new Error(`AI Responses API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

function parseArticleJson(content) {
  const normalized = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized);
}

async function generateArticle(items, options) {
  const first = await requestArticle(items, { ...options, structured: true });
  let content = responseText(first);
  if (!content) {
    const fallbackEffort = options.reasoningEffort === "xhigh" ? "low" : options.reasoningEffort;
    const fallback = await requestArticle(items, { ...options, structured: false, reasoningEffort: fallbackEffort });
    content = responseText(fallback);
  }
  if (!content) throw new Error("AI API returned no article content after compatibility fallback");
  return parseArticleJson(content);
}

function articleId(sourceUrl) {
  return `auto-news-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16)}`;
}

export async function runNewsPublisherOnce({
  db,
  apiKey,
  model = "gpt-5.5",
  baseUrl = "https://lucen.cc",
  apiPath = "/v1/responses",
  reasoningEffort = "xhigh",
  disableResponseStorage = true,
  feeds = defaultFeeds,
  logger = console,
  dryRun = false
} = {}) {
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
  const sourceSet = unseen.slice(0, 6);
  const primarySource = sourceSet[0];
  const article = await generateArticle(sourceSet, { apiKey, model, baseUrl, apiPath, reasoningEffort, disableResponseStorage });
  const cover = await fetchCoverImage(primarySource.link) || fallbackCovers[createHash("sha256").update(primarySource.link).digest()[0] % fallbackCovers.length];
  const body = {
    id: articleId(primarySource.link),
    kind: "news",
    topic: String(article.topic || "AI 行业").slice(0, 80),
    title: String(article.title || primarySource.title).slice(0, 200),
    excerpt: String(article.excerpt || primarySource.description).slice(0, 500),
    body: String(article.body || "").slice(0, 250_000),
    cover,
    date: new Date().toISOString().slice(0, 10),
    readTime: String(article.readTime || "3分钟").slice(0, 30),
    source: sourceSet.length > 1 ? `AI自动采编 · ${sourceSet.length} 条来源` : "AI自动采编 · 官方来源",
    sourceUrl: primarySource.link,
    status: "published"
  };
  if (dryRun) return { published: false, dryRun: true, article: body, sourceCount: sourceSet.length };
  const created = createAdminContent(db, "articles", body, { actor: "auto-news-publisher", requestId: `auto-${Date.now()}` });
  return { published: true, article: created.item, sourceCount: sourceSet.length };
}

export function scheduleNewsPublisher({ db, environment = "development", logger = console, env = process.env } = {}) {
  const enabled = env.NIKE_AUTO_NEWS === "true";
  const apiKey = env.OPENAI_API_KEY || "";
  if (environment === "test" || !enabled || !apiKey) return { enabled: false, timer: null, startupTimer: null };
  const intervalMs = Math.max(Number(env.NIKE_NEWS_INTERVAL_MINUTES || 360), 15) * 60_000;
  const feeds = String(env.NIKE_NEWS_FEEDS || defaultFeeds.join(",")).split(",").map((item) => item.trim()).filter(Boolean);
  const model = env.NIKE_NEWS_AI_MODEL || "gpt-5.5";
  const baseUrl = env.NIKE_NEWS_BASE_URL || "https://lucen.cc";
  const apiPath = env.NIKE_NEWS_API_PATH || "/v1/responses";
  const reasoningEffort = env.NIKE_NEWS_REASONING_EFFORT || "xhigh";
  const disableResponseStorage = env.NIKE_NEWS_DISABLE_RESPONSE_STORAGE !== "false";
  const output = logger === true ? console : logger;
  const run = () => runNewsPublisherOnce({ db, apiKey, model, baseUrl, apiPath, reasoningEffort, disableResponseStorage, feeds, logger: output })
    .then((result) => output?.info?.(`[news-publisher] ${JSON.stringify({ published: result.published || false, skipped: result.skipped || false, reason: result.reason || "", sourceCount: result.sourceCount || 0 })}`))
    .catch((error) => output?.error?.(`[news-publisher] ${error.message}`));
  const timer = setInterval(run, intervalMs);
  timer.unref();
  const startupTimer = setTimeout(run, 10_000);
  startupTimer.unref();
  return { enabled: true, timer, startupTimer, intervalMs };
}
