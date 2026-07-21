import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getMonitoringSnapshot } from "./backend/monitoring.mjs";
import { scheduleNewsPublisher } from "./backend/news-publisher.mjs";
import { notifyFeedbackEmail } from "./backend/email.mjs";
import {
  authCookieName,
  authSessionMaxAgeSeconds,
  getUserBySession,
  listUsers,
  loginUser,
  logoutUser,
  registerUser,
  updateUserAccess
} from "./backend/auth.mjs";
import {
  archiveAdminContent,
  createAdminContent,
  getAdminContent,
  getContentVersion,
  listAdminContent,
  saveAdminLogo,
  updateAdminContent
} from "./backend/content-admin.mjs";

import {
  createFeedback,
  listFeedback,
  updateFeedbackStatus,
  createSubmission,
  findSubmissionByIdempotencyKey,
  getAdminSummary,
  getAccountActivity,
  getAccountSummary,
  getArticle,
  getBootstrap,
  getGrowthSnapshot,
  getCategories,
  getSubmissionStatus,
  getTool,
  insertEvents,
  listArticles,
  listUserFavorites,
  addUserFavorite,
  removeUserFavorite,
  getToolRatings,
  setToolRating,
  removeToolRating,
  listSubmissions,
  listSitemapTools,
  listTools,
  openDatabase,
  pruneOperationalData,
  recordOutboundClick,
  recordUserToolHistory,
  clearUserToolHistory,
  deleteUserAccount,
  reviewSubmission,
  seedDatabase,
  syncSeedToolLogos,
  syncCuratedContent,
  unsubscribeNewsletter,
  unsubscribeAccountNewsletter,
  updateNotificationPreferences,
  upsertNewsletterSubscription
} from "./backend/database.mjs";
import {
  HttpError,
  readJsonBody,
  validateEventBatch,
  validateFeedback,
  validateLogin,
  validateRegistration,
  validateReview,
  validateSubmission,
  validateSubscription
} from "./backend/validation.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const defaultDbPath = resolve(rootDir, "data", "nike-ai.db");
const seedData = JSON.parse(readFileSync(resolve(rootDir, "backend", "seed-data.json"), "utf8"));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon"
  , ".xml": "application/xml; charset=utf-8"
  , ".txt": "text/plain; charset=utf-8"
  , ".webmanifest": "application/manifest+json; charset=utf-8"
};

const staticFiles = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "auth.html",
  "auth.css",
  "auth.js",
  "admin.html",
  "admin.css",
  "admin.js",
  "admin-icons.js",
  "brand-icon-192.png",
  "robots.txt",
  "sitemap.xml"
  ,"manifest.webmanifest"
]);
const publicAppRoutes = new Set(["/discover", "/tutorials", "/news", "/advertise", "/about", "/standards", "/terms", "/privacy", "/feedback"]);
const placementNames = new Set(["home_tool_strip", "detail_drawer", "related_tool", "unknown"]);
const monitoringHours = new Set([1, 6, 24, 72, 168]);

function parseAllowedOrigins(value) {
  return new Set(String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean));
}

function createRateLimiter() {
  const buckets = new Map();
  return function enforce(key, limit, windowMs, cost = 1) {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: cost, resetAt: now + windowMs });
      return;
    }
    current.count += cost;
    if (current.count > limit) {
      const retryAfter = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
      throw new HttpError(429, "rate_limited", "请求过于频繁，请稍后再试", { retryAfter });
    }
    if (buckets.size > 5000) {
      for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  };
}

function parseCookies(request) {
  const cookies = {};
  String(request.headers.cookie || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index <= 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
  });
  return cookies;
}

function isSecureRequest(request, trustProxy) {
  if (request.socket.encrypted) return true;
  if (!trustProxy || !isLoopbackAddress(request.socket.remoteAddress)) return false;
  return String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() === "https";
}

function authCookie(token, request, trustProxy, maxAge = authSessionMaxAgeSeconds) {
  const secure = isSecureRequest(request, trustProxy) ? "; Secure" : "";
  return `${authCookieName}=${encodeURIComponent(token || "")}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function isLoopbackAddress(value) {
  const address = String(value || "").replace(/^::ffff:/, "");
  return address === "127.0.0.1" || address === "::1";
}

function isLoopbackHost(value) {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(String(value || "").trim());
}

function isLoopbackOrigin(value) {
  if (!value) return true;
  try {
    const origin = new URL(String(value));
    return ["http:", "https:"].includes(origin.protocol)
      && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isTrustedLocalMonitoringRequest(request, isProduction) {
  if (isProduction || !isLoopbackAddress(request.socket.remoteAddress)) return false;
  if (!isLoopbackHost(request.headers.host)) return false;
  if (!isLoopbackOrigin(request.headers.origin)) return false;
  const fetchSite = String(request.headers["sec-fetch-site"] || "").toLowerCase();
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

function isAutomatedRequest(request) {
  const purpose = `${request.headers.purpose || ""} ${request.headers["sec-purpose"] || ""}`.toLowerCase();
  const userAgent = String(request.headers["user-agent"] || "").toLowerCase();
  return purpose.includes("prefetch")
    || purpose.includes("preview")
    || /bot|crawler|spider|headless|preview|facebookexternalhit|slurp/.test(userAgent);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBearerToken(request) {
  const value = String(request.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function userAgentFamily(value) {
  const ua = String(value || "").toLowerCase();
  if (ua.includes("edg/")) return "edge";
  if (ua.includes("chrome/")) return "chrome";
  if (ua.includes("firefox/")) return "firefox";
  if (ua.includes("safari/")) return "safari";
  return "other";
}

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  });
  response.end(body);
}

function sendData(response, data, meta, status = 200, headers) {
  sendJson(response, status, meta ? { data, meta } : { data }, headers);
}

function sendProblem(response, error, requestId) {
  const status = Number(error.status) || 500;
  const payload = {
    type: `https://nike-ai.local/problems/${error.code || "internal_error"}`,
    title: status >= 500 ? "服务暂时不可用" : error.message,
    status,
    code: error.code || "internal_error",
    requestId
  };
  if (error.details && status < 500) payload.details = error.details;
  sendJson(response, status, payload, status === 429 && error.details?.retryAfter
    ? { "Retry-After": String(error.details.retryAfter) }
    : undefined);
}

function applySecurityHeaders(request, response, allowedOrigins, isProduction) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  const requestPath = new URL(request.url || "/", "http://localhost").pathname;
  const isAdminResource = requestPath.startsWith("/api/admin/") || /^\/admin(?:\.|$)/.test(requestPath);
  response.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    isAdminResource ? "script-src 'self'" : "script-src 'self' https://unpkg.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join("; "));

  const origin = String(request.headers.origin || "");
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }
}

function serveStatic(request, response, pathname, staticDir) {
  const logoMatch = pathname.match(/^\/assets\/tool-logos\/([a-z0-9-]+\.(?:png|jpe?g|webp|ico|svg|gif|avif))$/);
  const isAppRoute = publicAppRoutes.has(pathname) || /^\/category\/[a-z0-9-]+$/.test(pathname);
  const fileName = pathname === "/" || isAppRoute ? "index.html" : pathname.slice(1);
  if (!logoMatch && !staticFiles.has(fileName)) return false;
  const filePath = logoMatch
    ? resolve(staticDir, "assets", "tool-logos", logoMatch[1])
    : resolve(staticDir, fileName);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
  let content = readFileSync(filePath);
  const acceptsGzip = /\bgzip\b/i.test(String(request.headers["accept-encoding"] || ""));
  const compressible = /\.(?:html|css|js|json|xml|txt|webmanifest)$/i.test(filePath);
  const compressed = acceptsGzip && compressible && content.length > 1024;
  if (compressed) content = gzipSync(content, { level: 6 });
  const isAdminResource = /^admin(?:\.|$)/.test(fileName);
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Content-Length": content.length,
    ...(compressed ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
    "Cache-Control": isAdminResource
      ? "no-store, private"
      : fileName === "index.html" ? "no-store" : logoMatch ? "public, max-age=86400" : "public, max-age=300"
  });
  if (request.method === "HEAD") response.end();
  else response.end(content);
  return true;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHTML(value).replaceAll("\n", " ");
}

function safeJsonScript(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function absoluteSiteUrl(request, pathname = "/") {
  const proto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "47.93.245.219").split(",")[0].trim();
  return new URL(pathname, `${proto}://${host}`).toString();
}

function sendHtml(request, response, html, status = 200, headers = {}) {
  const body = Buffer.from(html, "utf8");
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "public, max-age=300",
    ...headers
  });
  if (request.method === "HEAD") response.end();
  else response.end(body);
}

function sendXml(request, response, xml, status = 200) {
  const body = Buffer.from(xml, "utf8");
  response.writeHead(status, {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "public, max-age=900"
  });
  if (request.method === "HEAD") response.end();
  else response.end(body);
}

const priceLabels = {
  free: "免费",
  freemium: "免费增值",
  trial: "免费试用",
  paid: "付费",
  contact: "商务询价",
  unknown: "价格待核验"
};

const platformLabels = { web: "Web", desktop: "桌面端", mobile: "移动端", api: "API" };
const languageLabels = { zh: "中文友好", multi: "多语言", unknown: "语言待核验" };

function listText(items, fallback = "待补充") {
  const values = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  return values.length ? values.join("、") : fallback;
}

function compactDescription(tool) {
  const value = String(tool.description || tool.summary || "").replace(/\s+/g, " ").trim();
  return value.length > 155 ? `${value.slice(0, 152)}...` : value;
}

function buildToolFaq(tool) {
  const featureText = listText(tool.features);
  const useCaseText = listText(tool.useCases, featureText);
  const platformText = listText((tool.platforms || []).map((platform) => platformLabels[platform] || platform));
  return [
    {
      question: `${tool.name} 是什么？`,
      answer: `${tool.name} 是泥壳AI工具站收录的 ${tool.summary || "AI 工具"}。${tool.description || ""}`.trim()
    },
    {
      question: `${tool.name} 适合哪些使用场景？`,
      answer: `${tool.name} 适合用于：${useCaseText}。`
    },
    {
      question: `${tool.name} 有哪些主要功能？`,
      answer: `${tool.name} 的核心功能包括：${featureText}。`
    },
    {
      question: `${tool.name} 支持哪些平台？`,
      answer: `${tool.name} 当前收录的平台信息为：${platformText}。`
    },
    {
      question: `${tool.name} 怎么收费？`,
      answer: `${tool.name} 的价格类型标记为“${priceLabels[tool.price] || tool.price || "待核验"}”，具体方案以其官网最新信息为准。`
    }
  ];
}

function buildToolSeoPage(request, tool, relatedTools, categories) {
  const category = categories.find((item) => item.id === tool.category);
  const canonical = absoluteSiteUrl(request, `/tools/${encodeURIComponent(tool.slug || tool.id)}`);
  const title = `${tool.name} - 功能、价格、适用场景与替代工具 | 泥壳AI工具站`;
  const description = compactDescription(tool);
  const faq = buildToolFaq(tool);
  const related = relatedTools.filter((item) => item.id !== tool.id).slice(0, 6);
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: tool.name,
      description,
      applicationCategory: category?.name || "AI 工具",
      operatingSystem: listText((tool.platforms || []).map((platform) => platformLabels[platform] || platform), "Web"),
      url: canonical,
      image: absoluteSiteUrl(request, tool.logoUrl || "/brand-icon-192.png"),
      offers: {
        "@type": "Offer",
        price: tool.price === "free" ? "0" : undefined,
        priceCurrency: "USD",
        availability: "https://schema.org/InStock"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer }
      }))
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: absoluteSiteUrl(request, "/") },
        { "@type": "ListItem", position: 2, name: category?.name || "AI 工具", item: absoluteSiteUrl(request, `/category/${encodeURIComponent(tool.category)}`) },
        { "@type": "ListItem", position: 3, name: tool.name, item: canonical }
      ]
    }
  ];
  const badges = [
    category?.name,
    priceLabels[tool.price] || tool.price,
    languageLabels[tool.language] || tool.language,
    ...(tool.badges || [])
  ].filter(Boolean);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <meta name="description" content="${escapeAttribute(description)}">
  <link rel="canonical" href="${escapeAttribute(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeAttribute(title)}">
  <meta property="og:description" content="${escapeAttribute(description)}">
  <meta property="og:url" content="${escapeAttribute(canonical)}">
  <meta property="og:image" content="${escapeAttribute(absoluteSiteUrl(request, tool.logoUrl || "/brand-icon-192.png"))}">
  <link rel="icon" href="/brand-icon-192.png" type="image/png" sizes="192x192">
  <link rel="stylesheet" href="/styles.css?v=20260720-tools-seo-1">
  <script type="application/ld+json">${safeJsonScript(schema)}</script>
</head>
<body class="seo-tool-page">
  <header class="seo-tool-topbar">
    <a class="seo-tool-brand" href="/"><img src="/brand-icon-192.png" alt=""><span><strong>泥壳AI</strong><small>工具站</small></span></a>
    <nav aria-label="工具详情导航">
      <a href="/">工具库</a>
      <a href="/category/${escapeAttribute(tool.category)}">${escapeHTML(category?.name || "同类工具")}</a>
      <a href="/standards">收录标准</a>
    </nav>
  </header>
  <main class="seo-tool-main">
    <article class="seo-tool-hero">
      <div class="seo-tool-copy">
        <p class="seo-tool-eyebrow">AI TOOL PROFILE</p>
        <div class="seo-tool-title-row">
          <img class="seo-tool-logo" src="${escapeAttribute(tool.logoUrl || "/brand-icon-192.png")}" alt="${escapeAttribute(tool.name)} Logo">
          <h1>${escapeHTML(tool.name)}</h1>
        </div>
        <p class="seo-tool-summary">${escapeHTML(tool.summary || description)}</p>
        <div class="seo-tool-badges">${badges.map((badge) => `<span>${escapeHTML(badge)}</span>`).join("")}</div>
        <div class="seo-tool-actions">
          <a class="primary-button" href="${escapeAttribute(tool.officialUrl)}" rel="nofollow sponsored noopener">访问官网</a>
          <a class="secondary-button" href="/?q=${encodeURIComponent(tool.name)}#tools">回到工具库</a>
        </div>
      </div>
      <aside class="seo-tool-facts" aria-label="${escapeAttribute(tool.name)} 基础信息">
        <div><span>分类</span><strong>${escapeHTML(category?.name || tool.category)}</strong></div>
        <div><span>价格</span><strong>${escapeHTML(priceLabels[tool.price] || tool.price || "待核验")}</strong></div>
        <div><span>平台</span><strong>${escapeHTML(listText((tool.platforms || []).map((platform) => platformLabels[platform] || platform)))}</strong></div>
        <div><span>语言</span><strong>${escapeHTML(languageLabels[tool.language] || tool.language || "待核验")}</strong></div>
        <div><span>登录要求</span><strong>${escapeHTML(tool.login || "待核验")}</strong></div>
        <div><span>更新时间</span><strong>${escapeHTML(tool.updated || "待核验")}</strong></div>
      </aside>
    </article>
    <section class="seo-tool-section">
      <p class="seo-tool-eyebrow">OVERVIEW</p>
      <h2>${escapeHTML(tool.name)} 是什么？</h2>
      <p>${escapeHTML(tool.description || tool.summary || `${tool.name} 是泥壳AI工具站收录的 AI 工具。`)}</p>
    </section>
    <section class="seo-tool-grid">
      <div class="seo-tool-section">
        <p class="seo-tool-eyebrow">FEATURES</p>
        <h2>主要功能</h2>
        <ul>${(tool.features || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("") || "<li>功能信息待补充</li>"}</ul>
      </div>
      <div class="seo-tool-section">
        <p class="seo-tool-eyebrow">USE CASES</p>
        <h2>适用场景</h2>
        <ul>${(tool.useCases || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("") || "<li>使用场景待补充</li>"}</ul>
      </div>
    </section>
    <section class="seo-tool-section">
      <p class="seo-tool-eyebrow">ALTERNATIVES</p>
      <h2>${escapeHTML(tool.name)} 的同类替代工具</h2>
      <div class="seo-tool-related">${related.map((item) => `
        <a href="/tools/${escapeAttribute(item.slug || item.id)}">
          <img src="${escapeAttribute(item.logoUrl || "/brand-icon-192.png")}" alt="">
          <strong>${escapeHTML(item.name)}</strong>
          <span>${escapeHTML(item.summary || "")}</span>
        </a>
      `).join("") || "<p>同类替代工具正在补充中。</p>"}</div>
    </section>
    <section class="seo-tool-section">
      <p class="seo-tool-eyebrow">FAQ</p>
      <h2>常见问题</h2>
      <div class="seo-tool-faq">${faq.map((item) => `<details><summary>${escapeHTML(item.question)}</summary><p>${escapeHTML(item.answer)}</p></details>`).join("")}</div>
    </section>
  </main>
</body>
</html>`;
}

function buildSitemap(request, db) {
  const baseEntries = [
    ["/", "daily", "1.0"],
    ["/discover", "weekly", "0.8"],
    ["/tutorials", "weekly", "0.8"],
    ["/news", "daily", "0.9"],
    ["/standards", "monthly", "0.5"],
    ["/terms", "monthly", "0.5"],
    ["/privacy", "monthly", "0.5"],
    ["/about", "monthly", "0.5"],
    ["/advertise", "monthly", "0.5"]
  ];
  const categoryEntries = getCategories(db)
    .filter((category) => category.id !== "all")
    .map((category) => [`/category/${category.id}`, "weekly", "0.7"]);
  const toolEntries = listSitemapTools(db)
    .map((tool) => [`/tools/${tool.slug || tool.id}`, "weekly", "0.8", tool.updated]);
  const entries = [...baseEntries, ...categoryEntries, ...toolEntries];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(([path, changefreq, priority, lastmod]) => {
    const lastmodXml = lastmod ? `<lastmod>${escapeHTML(lastmod)}</lastmod>` : "";
    return `  <url><loc>${escapeHTML(absoluteSiteUrl(request, path))}</loc>${lastmodXml}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
  }).join("\n")}\n</urlset>\n`;
}

export function buildApplication(options = {}) {
  const environment = options.environment ?? process.env.NODE_ENV ?? "development";
  const isProduction = environment === "production";
  const configuredDbPath = options.dbPath || process.env.NIKE_DB_PATH;
  const configuredAnalyticsSalt = options.analyticsSalt ?? process.env.NIKE_ANALYTICS_SALT;
  if (isProduction && !configuredDbPath) throw new Error("Production requires NIKE_DB_PATH on persistent storage");
  if (isProduction && !configuredAnalyticsSalt) throw new Error("Production requires NIKE_ANALYTICS_SALT");
  const dbPath = resolve(configuredDbPath || defaultDbPath);
  const staticDir = resolve(options.staticDir || rootDir);
  const logger = options.logger ?? environment !== "test";
  const adminToken = options.adminToken ?? process.env.NIKE_ADMIN_TOKEN ?? "";
  const analyticsSalt = configuredAnalyticsSalt ?? randomBytes(32).toString("hex");
  const tokenAdminEnabled = options.tokenAdminEnabled
    ?? (!isProduction || process.env.NIKE_ENABLE_TOKEN_ADMIN === "true");
  const autoSeed = options.autoSeed
    ?? (process.env.NIKE_AUTO_SEED ? process.env.NIKE_AUTO_SEED === "true" : !isProduction);
  const allowedOrigins = parseAllowedOrigins(
    options.allowedOrigins
      ?? process.env.NIKE_ALLOWED_ORIGINS
      ?? "http://127.0.0.1:4173,http://localhost:4173"
  );
  const trustProxy = String(options.trustProxy ?? process.env.NIKE_TRUST_PROXY ?? "false") === "true";
  const db = openDatabase(dbPath);
  const seedResult = autoSeed
    ? seedDatabase(db, seedData)
    : { seeded: false, tools: Number(db.prepare("SELECT COUNT(*) AS count FROM tools").get().count) };
  const contentSyncResult = autoSeed
    ? syncCuratedContent(db, seedData)
    : { tools: 0, newsItems: 0, retiredTools: 0, retiredNewsItems: 0 };
  const logoSyncResult = syncSeedToolLogos(db, seedData);
  pruneOperationalData(db);
  const retentionTimer = setInterval(() => pruneOperationalData(db), 24 * 60 * 60_000);
  retentionTimer.unref();
  const newsPublisher = scheduleNewsPublisher({ db, environment, logger });
  const rateLimit = createRateLimiter();
  const runtimeStartedAt = new Date();
  const recentRequests = [];
  const monitoringCache = new Map();

  const getIp = (request) => {
    const remoteAddress = request.socket.remoteAddress || "unknown";
    if (trustProxy && isLoopbackAddress(remoteAddress) && request.headers["x-forwarded-for"]) {
      const chain = String(request.headers["x-forwarded-for"]).split(",").map((item) => item.trim()).filter(Boolean);
      return chain.at(-1) || remoteAddress;
    }
    return remoteAddress;
  };
  const hashIp = (ip) => createHmac("sha256", analyticsSalt).update(ip).digest("hex");
  const requireTokenAdmin = (request, ip) => {
    rateLimit(`${ip}:admin`, 60, 60_000);
    if (!tokenAdminEnabled) throw new HttpError(503, "token_admin_disabled", "生产环境已关闭共享令牌管理接口");
    if (!adminToken) throw new HttpError(503, "admin_disabled", "未配置管理端令牌");
    if (!safeEqual(readBearerToken(request), adminToken)) {
      rateLimit(`${ip}:admin-auth`, 5, 15 * 60_000);
      throw new HttpError(401, "unauthorized", "管理端认证失败");
    }
  };
  const requireManagementAccess = (request, ip) => {
    const sessionUser = getUserBySession(db, parseCookies(request)[authCookieName]);
    if (sessionUser?.role === "admin") return { actor: `user:${sessionUser.id}`, user: sessionUser };
    requireTokenAdmin(request, ip);
    return { actor: "admin-token", user: null };
  };
  const requireSuperAdmin = (request, ip) => {
    const access = requireManagementAccess(request, ip);
    if (!access.user?.isSuperAdmin) throw new HttpError(403, "super_admin_required", "仅超级管理员可以管理账号权限");
    return access;
  };
  const getSystemSnapshot = () => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60_000;
    const recent = recentRequests.filter((item) => item.at >= fiveMinutesAgo);
    const errors = recent.filter((item) => item.status >= 500).length;
    const averageResponseMs = recent.length
      ? Math.round((recent.reduce((sum, item) => sum + item.durationMs, 0) / recent.length) * 10) / 10
      : 0;
    const memory = process.memoryUsage();
    const fileSize = (path) => {
      try { return statSync(path).size; } catch { return 0; }
    };
    let databaseReady = false;
    try { databaseReady = Number(db.prepare("SELECT 1 AS ready").get().ready) === 1; } catch {}
    const lastEvent = db.prepare("SELECT MAX(received_at) AS value FROM analytics_events").get().value || null;
    return {
      status: databaseReady ? "healthy" : "degraded",
      databaseReady,
      startedAt: runtimeStartedAt.toISOString(),
      uptimeSeconds: Math.floor((now - runtimeStartedAt.getTime()) / 1000),
      requestsLast5Minutes: recent.length,
      errorRateLast5Minutes: recent.length ? Math.round((errors / recent.length) * 10_000) / 100 : 0,
      averageResponseMs,
      memoryRssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      databaseBytes: fileSize(dbPath),
      walBytes: fileSize(`${dbPath}-wal`),
      schemaVersion: Number(db.prepare("PRAGMA user_version").get().user_version),
      migrations: Number(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count),
      lastEventAt: lastEvent,
      nodeVersion: process.version,
      serverVersion: "0.3.0"
    };
  };

  const server = createServer(async (request, response) => {
    const startedAt = performance.now();
    const requestId = randomUUID();
    const method = request.method || "GET";
    const url = new URL(request.url || "/", "http://localhost");
    const pathname = url.pathname;
    const ip = getIp(request);
    response.setHeader("X-Request-Id", requestId);
    applySecurityHeaders(request, response, allowedOrigins, isProduction);
    if (pathname.startsWith("/api/admin/")) response.setHeader("Cache-Control", "no-store, private");

    response.on("finish", () => {
      const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
      if (pathname !== "/api/admin/v1/monitoring") {
        recentRequests.push({ at: Date.now(), status: response.statusCode, durationMs });
        const cutoff = Date.now() - 60 * 60_000;
        while (recentRequests.length && recentRequests[0].at < cutoff) recentRequests.shift();
        if (recentRequests.length > 10_000) recentRequests.splice(0, recentRequests.length - 10_000);
      }
      if (!logger) return;
      console.log(JSON.stringify({
        time: new Date().toISOString(),
        request_id: requestId,
        method,
        path: pathname,
        status: response.statusCode,
        duration_ms: durationMs
      }));
    });

    try {
      if (method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if ((method === "GET" || method === "HEAD") && pathname === "/sitemap.xml") {
        sendXml(request, response, buildSitemap(request, db));
        return;
      }

      const toolPageMatch = pathname.match(/^\/tools\/([a-z0-9-]+)$/);
      if ((method === "GET" || method === "HEAD") && toolPageMatch) {
        rateLimit(`${ip}:read`, 120, 60_000);
        const tool = getTool(db, toolPageMatch[1]);
        if (!tool) throw new HttpError(404, "tool_not_found", "未找到该工具");
        const relatedTools = listTools(db, {
          category: tool.category,
          sponsored: false,
          sort: "recommended",
          limit: 8,
          offset: 0
        }).items;
        sendHtml(request, response, buildToolSeoPage(request, tool, relatedTools, getCategories(db)));
        return;
      }

      if ((method === "GET" || method === "HEAD") && serveStatic(request, response, pathname, staticDir)) return;

      if (method === "GET" && pathname === "/api/v1/health/live") {
        sendData(response, { status: "ok", process: true, version: 1 });
        return;
      }

      if (method === "GET" && ["/api/v1/health", "/api/v1/health/ready"].includes(pathname)) {
        let dbReady = false;
        try { dbReady = Number(db.prepare("SELECT 1 AS ready").get().ready) === 1; } catch {}
        sendData(response, { status: dbReady ? "ok" : "not_ready", database: dbReady, version: 1 }, null, dbReady ? 200 : 503);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/content/version") {
        rateLimit(`${ip}:read`, 120, 60_000);
        sendData(response, getContentVersion(db), null, 200, { "Cache-Control": "no-store" });
        return;
      }

      if (method === "GET" && pathname === "/api/v1/site/bootstrap") {
        rateLimit(`${ip}:read`, 120, 60_000);
        sendData(response, getBootstrap(db), {
          contentVersion: new Date().toISOString(),
          backend: "node-sqlite"
        });
        return;
      }

      if (method === "GET" && pathname === "/api/v1/site/growth") {
        rateLimit(`${ip}:read`, 120, 60_000);
        sendData(response, getGrowthSnapshot(db), null, 200, { "Cache-Control": "public, max-age=300" });
        return;
      }

      if (method === "POST" && pathname === "/api/v1/auth/register") {
        rateLimit(`${ip}:auth-register`, 5, 60 * 60_000);
        const result = registerUser(db, validateRegistration(await readJsonBody(request)));
        sendData(response, { user: result.user }, null, 201, {
          "Cache-Control": "no-store",
          "Set-Cookie": authCookie(result.token, request, trustProxy)
        });
        return;
      }

      if (method === "POST" && pathname === "/api/v1/auth/login") {
        rateLimit(`${ip}:auth-login`, 10, 15 * 60_000);
        const result = loginUser(db, validateLogin(await readJsonBody(request)));
        sendData(response, { user: result.user }, null, 200, {
          "Cache-Control": "no-store",
          "Set-Cookie": authCookie(result.token, request, trustProxy)
        });
        return;
      }

      if (method === "GET" && pathname === "/api/v1/auth/me") {
        rateLimit(`${ip}:auth-read`, 120, 60_000);
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录");
        sendData(response, { user }, null, 200, { "Cache-Control": "no-store" });
        return;
      }

      if (method === "POST" && pathname === "/api/v1/auth/logout") {
        rateLimit(`${ip}:auth-logout`, 30, 60_000);
        logoutUser(db, parseCookies(request)[authCookieName]);
        sendData(response, { loggedOut: true }, null, 200, {
          "Cache-Control": "no-store",
          "Set-Cookie": authCookie("", request, trustProxy, 0)
        });
        return;
      }

      if (pathname === "/api/v1/account/favorites" || /^\/api\/v1\/account\/favorites\/[a-z0-9-]+$/.test(pathname)) {
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录后管理收藏");
        if (method === "GET" && pathname === "/api/v1/account/favorites") {
          rateLimit(`${ip}:favorites-read`, 120, 60_000);
          sendData(response, { toolIds: listUserFavorites(db, user.id) }, null, 200, { "Cache-Control": "no-store" });
          return;
        }
        const favoriteMatch = pathname.match(/^\/api\/v1\/account\/favorites\/([a-z0-9-]+)$/);
        if (favoriteMatch && method === "PUT") {
          rateLimit(`${ip}:favorites-write`, 60, 60_000);
          if (!addUserFavorite(db, user.id, favoriteMatch[1])) throw new HttpError(404, "tool_not_found", "工具不存在或尚未发布");
          sendData(response, { toolId: favoriteMatch[1], favorite: true }, null, 200, { "Cache-Control": "no-store" });
          return;
        }
        if (favoriteMatch && method === "DELETE") {
          rateLimit(`${ip}:favorites-write`, 60, 60_000);
          removeUserFavorite(db, user.id, favoriteMatch[1]);
          sendData(response, { toolId: favoriteMatch[1], favorite: false }, null, 200, { "Cache-Control": "no-store" });
          return;
        }
      }

      if (method === "GET" && pathname === "/api/v1/account/summary") {
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录");
        sendData(response, getAccountSummary(db, user.id), null, 200, { "Cache-Control": "no-store" });
        return;
      }

      if (method === "GET" && pathname === "/api/v1/account/activity") {
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录");
        rateLimit(`${ip}:account-activity`, 60, 60_000);
        sendData(response, getAccountActivity(db, user.id), null, 200, { "Cache-Control": "no-store" });
        return;
      }

      if (method === "DELETE" && pathname === "/api/v1/account/history") {
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录");
        sendData(response, { cleared: clearUserToolHistory(db, user.id) }, null, 200, { "Cache-Control": "no-store" });
        return;
      }

      const accountHistoryMatch = pathname.match(/^\/api\/v1\/account\/history\/([a-z0-9-]+)$/);
      if (method === "PUT" && accountHistoryMatch) {
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录");
        const tool = getTool(db, accountHistoryMatch[1]);
        if (!tool) throw new HttpError(404, "tool_not_found", "工具不存在或尚未发布");
        recordUserToolHistory(db, user.id, tool.id);
        sendData(response, { recorded: true, toolId: tool.id }, null, 200, { "Cache-Control": "no-store" });
        return;
      }

      if (method === "DELETE" && pathname === "/api/v1/account/newsletter") {
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录");
        sendData(response, { unsubscribed: unsubscribeAccountNewsletter(db, user.id) }, null, 200, { "Cache-Control": "no-store" });
        return;
      }

      if (method === "PATCH" && pathname === "/api/v1/account/notifications") {
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录");
        const body = await readJsonBody(request);
        if (![body.weeklyDigest, body.newToolAlerts, body.favoriteUpdateAlerts].every((value) => typeof value === "boolean")) {
          throw new HttpError(422, "invalid_preferences", "通知设置格式无效");
        }
        sendData(response, updateNotificationPreferences(db, user.id, body), null, 200, { "Cache-Control": "no-store" });
        return;
      }

      if (method === "DELETE" && pathname === "/api/v1/account") {
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录");
        rateLimit(`${ip}:account-delete`, 3, 60 * 60_000);
        const body = await readJsonBody(request);
        if (body.confirmation !== "DELETE") throw new HttpError(422, "confirmation_required", "请输入 DELETE 确认注销账号");
        if (!deleteUserAccount(db, user.id)) throw new HttpError(409, "account_protected", "该账号不能注销");
        sendData(response, { deleted: true }, null, 200, {
          "Cache-Control": "no-store",
          "Set-Cookie": authCookie("", request, trustProxy, 0)
        });
        return;
      }

      if (method === "GET" && pathname === "/api/v1/categories") {
        rateLimit(`${ip}:read`, 120, 60_000);
        sendData(response, getCategories(db));
        return;
      }

      if (method === "GET" && pathname === "/api/v1/tools") {
        rateLimit(`${ip}:read`, 120, 60_000);
        const category = url.searchParams.get("category") || "all";
        const result = listTools(db, {
          q: url.searchParams.get("q") || "",
          category,
          price: url.searchParams.get("price") || "all",
          platform: url.searchParams.get("platform") || "all",
          language: url.searchParams.get("language") || url.searchParams.get("lang") || "all",
          sort: (url.searchParams.get("sort") || "recommended") === "newest" ? "latest" : (url.searchParams.get("sort") || "recommended"),
          sponsored: category === "all" ? false : undefined,
          limit: url.searchParams.get("limit") || 24,
          offset: url.searchParams.get("offset") || 0
        });
        sendData(response, result.items, { total: result.total, limit: result.limit, offset: result.offset });
        return;
      }

      const toolMatch = pathname.match(/^\/api\/v1\/tools\/([a-z0-9-]+)$/);
      if (method === "GET" && toolMatch) {
        rateLimit(`${ip}:read`, 120, 60_000);
        const tool = getTool(db, toolMatch[1]);
        if (!tool) throw new HttpError(404, "tool_not_found", "未找到该工具");
        const historyUser = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (historyUser) recordUserToolHistory(db, historyUser.id, tool.id);
        sendData(response, tool);
        return;
      }

      const ratingMatch = pathname.match(/^\/api\/v1\/tools\/([a-z0-9-]+)\/ratings?$/);
      if (ratingMatch) {
        const tool = getTool(db, ratingMatch[1]);
        if (!tool) throw new HttpError(404, "tool_not_found", "未找到该工具");
        const user = getUserBySession(db, parseCookies(request)[authCookieName]);
        if (method === "GET") {
          rateLimit(`${ip}:ratings-read`, 120, 60_000);
          sendData(response, getToolRatings(db, tool.id, user?.id), null, 200, { "Cache-Control": "no-store" });
          return;
        }
        if (!user) throw new HttpError(401, "not_authenticated", "请先登录后评分");
        if (method === "PUT") {
          rateLimit(`${ip}:ratings-write`, 30, 60_000);
          const rating = Number((await readJsonBody(request)).rating);
          if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            throw new HttpError(422, "invalid_rating", "评分必须是 1 到 5 的整数", { field: "rating" });
          }
          sendData(response, setToolRating(db, user.id, tool.id, rating), null, 200, { "Cache-Control": "no-store" });
          return;
        }
        if (method === "DELETE") {
          rateLimit(`${ip}:ratings-write`, 30, 60_000);
          sendData(response, removeToolRating(db, user.id, tool.id), null, 200, { "Cache-Control": "no-store" });
          return;
        }
      }

      if (method === "GET" && pathname === "/api/v1/articles") {
        rateLimit(`${ip}:read`, 120, 60_000);
        const kind = url.searchParams.get("kind");
        if (kind && !["tutorial", "news"].includes(kind)) throw new HttpError(422, "invalid_kind", "内容类型无效");
        sendData(response, listArticles(db, kind));
        return;
      }

      const articleMatch = pathname.match(/^\/api\/v1\/articles\/([a-z0-9-]+)$/);
      if (method === "GET" && articleMatch) {
        rateLimit(`${ip}:read`, 120, 60_000);
        const article = getArticle(db, articleMatch[1]);
        if (!article) throw new HttpError(404, "article_not_found", "未找到该内容");
        sendData(response, article);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/tool-submissions") {
        rateLimit(`${ip}:submission`, 3, 60 * 60_000);
        const body = await readJsonBody(request);
        const input = validateSubmission(body, request.headers["idempotency-key"]);
        if (input.honeypot) {
          sendData(response, {
            id: randomUUID(),
            trackingCode: `NK-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`,
            status: "pending"
          }, null, 201);
          return;
        }
        const previous = findSubmissionByIdempotencyKey(db, input.idempotencyKey, input);
        if (previous) {
          if (!previous.samePayload) throw new HttpError(409, "idempotency_conflict", "幂等键已用于其他提交");
          const { samePayload, ...result } = previous;
          sendData(response, result, { idempotent: true }, 200);
          return;
        }
        if (!db.prepare("SELECT 1 FROM categories WHERE id = ? AND id != 'all' AND status = 'published'").get(input.categoryId)) {
          throw new HttpError(422, "invalid_category", "工具分类无效", { field: "categoryId" });
        }
        if (db.prepare("SELECT 1 FROM tools WHERE official_url = ? AND status = 'published'").get(input.normalizedUrl)) {
          throw new HttpError(409, "tool_already_listed", "该工具已经收录");
        }
        try {
          const submissionUser = getUserBySession(db, parseCookies(request)[authCookieName]);
          const submission = createSubmission(db, input, submissionUser?.id || null);
          sendData(response, submission, null, 201);
        } catch (error) {
          if (String(error.code || "").startsWith("ERR_SQLITE_CONSTRAINT")) {
            throw new HttpError(409, "duplicate_submission", "该工具地址已有待审核记录");
          }
          throw error;
        }
        return;
      }

      const submissionStatusMatch = pathname.match(/^\/api\/v1\/tool-submissions\/(NK-[A-Z0-9-]+)\/status$/);
      if (method === "GET" && submissionStatusMatch) {
        rateLimit(`${ip}:submission-status`, 20, 60_000);
        const lookupToken = url.searchParams.get("token") || "";
        if (!/^[A-Za-z0-9-]{8,128}$/.test(lookupToken)) throw new HttpError(404, "submission_not_found", "未找到该投稿");
        const status = getSubmissionStatus(db, submissionStatusMatch[1], lookupToken);
        if (!status) throw new HttpError(404, "submission_not_found", "未找到该投稿");
        sendData(response, status);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/newsletter/subscriptions") {
        rateLimit(`${ip}:newsletter`, 5, 60 * 60_000);
        const input = validateSubscription(await readJsonBody(request));
        const subscriptionUser = getUserBySession(db, parseCookies(request)[authCookieName]);
        const subscription = upsertNewsletterSubscription(db, input, subscriptionUser?.id || null);
        sendData(response, subscription, { message: "订阅意向已记录" }, subscription.existing ? 200 : 201);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/feedback") {
        rateLimit(`${ip}:feedback`, 5, 60 * 60_000);
        const input = validateFeedback(await readJsonBody(request));
        if (input.honeypot) {
          sendData(response, { id: randomUUID(), status: "pending" }, null, 201);
          return;
        }
        const feedbackUser = getUserBySession(db, parseCookies(request)[authCookieName]);
        const feedback = createFeedback(db, input, feedbackUser?.id || null);
        void notifyFeedbackEmail(feedback, process.env, console).catch((error) => console.error(`[feedback-email] ${error.message}`));
        sendData(response, feedback, { message: "反馈已收到" }, 201);
        return;
      }

      const unsubscribeMatch = pathname.match(/^\/api\/v1\/newsletter\/subscriptions\/([A-Za-z0-9-]{32,128})$/);
      if (method === "DELETE" && unsubscribeMatch) {
        rateLimit(`${ip}:newsletter-unsubscribe`, 20, 60_000);
        const unsubscribed = unsubscribeNewsletter(db, unsubscribeMatch[1]);
        sendData(response, { unsubscribed: true }, { matched: unsubscribed });
        return;
      }

      if (method === "POST" && pathname === "/api/v1/events/batch") {
        rateLimit(`${ip}:event-requests`, 60, 60_000);
        const input = validateEventBatch(await readJsonBody(request, 128 * 1024));
        rateLimit(`${ip}:event-items`, 300, 60_000, input.events.length);
        const result = insertEvents(db, input.events, {
          visitorId: input.visitorId,
          sessionId: input.sessionId,
          ipHash: hashIp(ip)
        });
        sendData(response, result, null, 202);
        return;
      }

      const redirectMatch = pathname.match(/^\/r\/tools\/([a-z0-9-]+)$/);
      if (method === "GET" && redirectMatch) {
        rateLimit(`${ip}:redirect`, 60, 60_000);
        const row = db.prepare("SELECT id, official_url FROM tools WHERE id = ? AND status = 'published'").get(redirectMatch[1]);
        if (!row) throw new HttpError(404, "tool_not_found", "未找到该工具");
        let targetUrl;
        try { targetUrl = new URL(row.official_url); } catch { throw new HttpError(503, "tool_url_invalid", "工具官网地址暂不可用"); }
        if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new HttpError(503, "tool_url_invalid", "工具官网地址暂不可用");
        const placementValue = url.searchParams.get("placement") || "unknown";
        const placement = placementNames.has(placementValue) ? placementValue : "unknown";
        const sessionCookie = parseCookies(request).nike_session || "";
        const sessionId = /^[A-Za-z0-9-]{8,128}$/.test(sessionCookie)
          ? sessionCookie
          : `anonymous-${hashIp(ip).slice(0, 24)}`;
        try {
          if (!isAutomatedRequest(request)) {
          recordOutboundClick(db, {
            toolId: row.id,
            placement,
            sessionId,
            ipHash: hashIp(ip),
            userAgentFamily: userAgentFamily(request.headers["user-agent"])
          });
          }
        } catch (error) {
          if (logger) console.error(JSON.stringify({ request_id: requestId, event: "outbound_click_failed", message: error.message }));
        }
        response.writeHead(302, { Location: targetUrl.toString(), "Cache-Control": "no-store" });
        response.end();
        return;
      }

      if (method === "GET" && pathname === "/api/admin/v1/monitoring") {
        rateLimit(`${ip}:monitoring`, 30, 60_000);
        const isLocalReadOnly = isTrustedLocalMonitoringRequest(request, isProduction);
        const presentedToken = readBearerToken(request);
        const sessionUser = getUserBySession(db, parseCookies(request)[authCookieName]);
        let hasAdminAccess = false;
        if (sessionUser?.role === "admin") {
          hasAdminAccess = true;
        } else if (presentedToken || !isLocalReadOnly) {
          requireTokenAdmin(request, ip);
          hasAdminAccess = true;
        }
        if (!isLocalReadOnly && !hasAdminAccess) {
          throw new HttpError(401, "unauthorized", "监控数据需要本机访问或管理端认证");
        }
        const requestedHours = Number(url.searchParams.get("hours") || 24);
        if (!monitoringHours.has(requestedHours)) {
          throw new HttpError(422, "invalid_hours", "监控时间窗口仅支持 1、6、24、72 或 168 小时");
        }
        const cachedSnapshot = monitoringCache.get(requestedHours);
        const snapshot = cachedSnapshot && Date.now() - cachedSnapshot.cachedAt < 4_000
          ? cachedSnapshot.value
          : getMonitoringSnapshot(db, { hours: requestedHours });
        if (!cachedSnapshot || snapshot !== cachedSnapshot.value) {
          monitoringCache.set(requestedHours, { cachedAt: Date.now(), value: snapshot });
        }
        const visibleSnapshot = hasAdminAccess
          ? snapshot
          : { ...snapshot, topSearches: [], recentEvents: [] };
        sendData(response, {
          ...visibleSnapshot,
          system: getSystemSnapshot(),
          access: {
            mode: hasAdminAccess ? "admin" : "local-readonly",
            canManage: hasAdminAccess,
            detailedAnalytics: hasAdminAccess
          }
        });
        return;
      }

      if (pathname.startsWith("/api/admin/v1/")) {
        rateLimit(`${ip}:admin`, 60, 60_000);
        const managementAccess = requireManagementAccess(request, ip);
        const managementActor = managementAccess.actor;

        if (method === "GET" && pathname === "/api/admin/v1/users") {
          requireSuperAdmin(request, ip);
          sendData(response, listUsers(db));
          return;
        }
        if (method === "GET" && pathname === "/api/admin/v1/feedback") {
          sendData(response, listFeedback(db, url.searchParams.get("status") || "all"));
          return;
        }
        const feedbackStatusMatch = pathname.match(/^\/api\/admin\/v1\/feedback\/([0-9a-f-]+)$/);
        if (method === "PATCH" && feedbackStatusMatch) {
          const body = await readJsonBody(request, 16 * 1024);
          const updated = updateFeedbackStatus(db, feedbackStatusMatch[1], body.status);
          if (!updated) throw new HttpError(404, "feedback_not_found", "反馈不存在或状态无效");
          sendData(response, updated);
          return;
        }
        const userAccessMatch = pathname.match(/^\/api\/admin\/v1\/users\/([0-9a-f-]+)$/);
        if (method === "PATCH" && userAccessMatch) {
          requireSuperAdmin(request, ip);
          const body = await readJsonBody(request, 32 * 1024);
          const updated = updateUserAccess(db, userAccessMatch[1], { role: body.role, status: body.status });
          if (!updated) throw new HttpError(404, "user_not_found_or_protected", "账号不存在或不能修改超级管理员");
          sendData(response, updated);
          return;
        }

        if (method === "GET" && pathname === "/api/admin/v1/summary") {
          sendData(response, getAdminSummary(db));
          return;
        }
        if (method === "POST" && pathname === "/api/admin/v1/content/media/logos") {
          const uploaded = saveAdminLogo(
            db,
            await readJsonBody(request, 1_600_000),
            { actor: managementActor, requestId },
            staticDir
          );
          const { contentRevision, ...logo } = uploaded;
          sendData(response, logo, { contentRevision }, 201);
          return;
        }
        const contentListMatch = pathname.match(/^\/api\/admin\/v1\/content\/(tools|categories|articles|collections)$/);
        if (contentListMatch) {
          const contentType = contentListMatch[1];
          if (method === "GET") {
            const result = listAdminContent(db, contentType, {
              q: url.searchParams.get("q") || "",
              status: url.searchParams.get("status") || "all",
              categoryId: url.searchParams.get("categoryId") || "",
              kind: url.searchParams.get("kind") || "",
              limit: url.searchParams.get("limit") || 30,
              offset: url.searchParams.get("offset") || 0
            });
            sendData(response, result.items, { total: result.total, limit: result.limit, offset: result.offset });
            return;
          }
          if (method === "POST") {
            const created = createAdminContent(
              db,
              contentType,
              await readJsonBody(request, 512 * 1024),
              { actor: managementActor, requestId }
            );
            sendData(response, created.item, { contentRevision: created.contentRevision }, 201);
            return;
          }
        }
        const contentItemMatch = pathname.match(/^\/api\/admin\/v1\/content\/(tools|categories|articles|collections)\/([a-z0-9-]+)$/);
        if (contentItemMatch) {
          const [, contentType, contentId] = contentItemMatch;
          if (method === "GET") {
            const item = getAdminContent(db, contentType, contentId);
            if (!item) throw new HttpError(404, "content_not_found", "未找到该内容");
            sendData(response, item);
            return;
          }
          if (method === "PATCH") {
            const updated = updateAdminContent(
              db,
              contentType,
              contentId,
              await readJsonBody(request, 512 * 1024),
              { actor: managementActor, requestId }
            );
            if (!updated) throw new HttpError(404, "content_not_found", "未找到该内容");
            sendData(response, updated.item, { contentRevision: updated.contentRevision });
            return;
          }
          if (method === "DELETE") {
            const archived = archiveAdminContent(db, contentType, contentId, { actor: managementActor, requestId });
            if (!archived) throw new HttpError(404, "content_not_found", "未找到该内容");
            sendData(response, archived.item, { contentRevision: archived.contentRevision });
            return;
          }
        }
        if (method === "GET" && pathname === "/api/admin/v1/submissions") {
          const status = url.searchParams.get("status") || "pending";
          if (!["pending", "approved", "rejected", "duplicate"].includes(status)) throw new HttpError(422, "invalid_status", "审核状态无效");
          sendData(response, listSubmissions(db, status));
          return;
        }
        const reviewMatch = pathname.match(/^\/api\/admin\/v1\/submissions\/([0-9a-f-]+)$/);
        if (method === "PATCH" && reviewMatch) {
          const review = validateReview(await readJsonBody(request));
          const result = reviewSubmission(db, {
            id: reviewMatch[1],
            status: review.status,
            reviewNote: review.reviewNote,
            actor: managementActor,
            requestId
          });
          if (!result) throw new HttpError(404, "submission_not_found", "未找到该投稿");
          if (result.conflict) throw new HttpError(409, "submission_already_reviewed", "该投稿已经处理", { currentStatus: result.currentStatus });
          sendData(response, result);
          return;
        }
      }

      if (pathname.startsWith("/api/") || pathname.startsWith("/r/")) {
        throw new HttpError(404, "route_not_found", "接口不存在");
      }
      throw new HttpError(404, "not_found", "页面不存在");
    } catch (error) {
      if (!(error instanceof HttpError) && logger) {
        console.error(JSON.stringify({ request_id: requestId, event: "request_error", message: error.message, stack: error.stack }));
      }
      sendProblem(response, error, requestId);
    }
  });

  return {
    db,
    dbPath,
    seedResult,
    contentSyncResult,
    logoSyncResult,
    server,
    listen(port = 4173, host = "127.0.0.1") {
      return new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolveListen(server.address());
        });
      });
    },
    close() {
      clearInterval(retentionTimer);
      if (newsPublisher.timer) clearInterval(newsPublisher.timer);
      if (newsPublisher.startupTimer) clearTimeout(newsPublisher.startupTimer);
      return new Promise((resolveClose, reject) => {
        server.close((error) => {
          db.close();
          if (error) reject(error);
          else resolveClose();
        });
      });
    }
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = buildApplication();
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || "127.0.0.1";
  app.listen(port, host).then((address) => {
    console.log(`泥壳AI工具站全栈服务：http://${address.address}:${address.port}/`);
    console.log(`数据库：${app.dbPath}（种子：${app.seedResult.seeded ? "已导入" : "已存在"}）`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

  const shutdown = async () => {
    try {
      await app.close();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
