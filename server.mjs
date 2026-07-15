import { createServer } from "node:http";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getMonitoringSnapshot } from "./backend/monitoring.mjs";
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
  createSubmission,
  findSubmissionByIdempotencyKey,
  getAdminSummary,
  getArticle,
  getBootstrap,
  getCategories,
  getSubmissionStatus,
  getTool,
  insertEvents,
  listArticles,
  listSubmissions,
  listTools,
  openDatabase,
  pruneOperationalData,
  recordOutboundClick,
  reviewSubmission,
  seedDatabase,
  syncSeedToolLogos,
  syncCuratedContent,
  unsubscribeNewsletter,
  upsertNewsletterSubscription
} from "./backend/database.mjs";
import {
  HttpError,
  readJsonBody,
  validateEventBatch,
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
};

const staticFiles = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "admin.html",
  "admin.css",
  "admin.js",
  "admin-icons.js",
  "brand-icon-192.png"
]);
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
    "img-src 'self' data: https://www.google.com https://images.unsplash.com",
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
  const fileName = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!logoMatch && !staticFiles.has(fileName)) return false;
  const filePath = logoMatch
    ? resolve(staticDir, "assets", "tool-logos", logoMatch[1])
    : resolve(staticDir, fileName);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
  const content = readFileSync(filePath);
  const isAdminResource = /^admin(?:\.|$)/.test(fileName);
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Content-Length": content.length,
    "Cache-Control": isAdminResource
      ? "no-store, private"
      : fileName === "index.html" ? "no-store" : logoMatch ? "public, max-age=86400" : "public, max-age=300"
  });
  if (request.method === "HEAD") response.end();
  else response.end(content);
  return true;
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
        sendData(response, tool);
        return;
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
          const submission = createSubmission(db, input);
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
        const subscription = upsertNewsletterSubscription(db, input);
        sendData(response, subscription, { message: "订阅意向已记录" }, subscription.existing ? 200 : 201);
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
        let hasAdminAccess = false;
        if (presentedToken || !isLocalReadOnly) {
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
        if (!tokenAdminEnabled) throw new HttpError(503, "token_admin_disabled", "生产环境已关闭共享令牌管理接口");
        if (!adminToken) throw new HttpError(503, "admin_disabled", "未配置管理端令牌");
        if (!safeEqual(readBearerToken(request), adminToken)) {
          rateLimit(`${ip}:admin-auth`, 5, 15 * 60_000);
          throw new HttpError(401, "unauthorized", "管理端认证失败");
        }

        if (method === "GET" && pathname === "/api/admin/v1/summary") {
          sendData(response, getAdminSummary(db));
          return;
        }
        if (method === "POST" && pathname === "/api/admin/v1/content/media/logos") {
          const uploaded = saveAdminLogo(
            db,
            await readJsonBody(request, 1_600_000),
            { actor: "admin-token", requestId },
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
              { actor: "admin-token", requestId }
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
              { actor: "admin-token", requestId }
            );
            if (!updated) throw new HttpError(404, "content_not_found", "未找到该内容");
            sendData(response, updated.item, { contentRevision: updated.contentRevision });
            return;
          }
          if (method === "DELETE") {
            const archived = archiveAdminContent(db, contentType, contentId, { actor: "admin-token", requestId });
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
            actor: "admin-token",
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
