import { isIP } from "node:net";

const currentConsentVersion = "2026-07";

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function readJsonBody(request, maxBytes = 64 * 1024) {
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > maxBytes) throw new HttpError(413, "payload_too_large", "请求内容过大");

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, "payload_too_large", "请求内容过大");
    chunks.push(chunk);
  }
  if (size === 0) throw new HttpError(400, "empty_body", "请求内容不能为空");
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Body must be an object");
    }
    return value;
  } catch {
    throw new HttpError(400, "invalid_json", "请求内容不是有效 JSON");
  }
}

function assertAllowedKeys(value, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new HttpError(422, "unknown_fields", "请求包含不支持的字段", { fields: unknown });
  }
}

function readText(value, field, min, max) {
  if (typeof value !== "string") throw new HttpError(422, "invalid_field", `${field} 格式不正确`, { field });
  const normalized = value.trim().replaceAll("\u0000", "");
  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(422, "invalid_length", `${field} 长度必须在 ${min}-${max} 个字符之间`, { field });
  }
  return normalized;
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

export function normalizePublicUrl(value) {
  const raw = readText(value, "websiteUrl", 8, 2048);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(422, "invalid_url", "官方网站地址无效", { field: "websiteUrl" });
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new HttpError(422, "invalid_url", "官方网站只允许 HTTP 或 HTTPS 地址", { field: "websiteUrl" });
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
  const ipVersion = isIP(hostname);
  const blocked = hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || (ipVersion === 4 && isPrivateIpv4(hostname))
    || ipVersion === 6;
  if (blocked) throw new HttpError(422, "private_url", "官方网站不能指向本地或私有网络", { field: "websiteUrl" });
  url.hash = "";
  url.hostname = hostname;
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  return url.toString();
}

export function normalizeEmail(value) {
  const email = readText(value, "email", 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, "invalid_email", "邮箱地址格式不正确", { field: "email" });
  }
  return email;
}

function readPassword(value) {
  if (typeof value !== "string" || value.length < 10 || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new HttpError(422, "invalid_password", "密码长度必须为 10-128 个字符", { field: "password" });
  }
  return value;
}

export function validateRegistration(body) {
  assertAllowedKeys(body, ["displayName", "email", "password", "consentVersion", "consentAccepted", "termsAccepted"]);
  if (body.consentAccepted !== true || body.termsAccepted !== true) {
    throw new HttpError(422, "consent_required", "请先同意服务条款和隐私政策", { field: "consentAccepted" });
  }
  const consentVersion = readText(body.consentVersion || currentConsentVersion, "consentVersion", 4, 20);
  if (consentVersion !== currentConsentVersion) {
    throw new HttpError(409, "consent_version_outdated", "隐私政策已更新，请刷新页面后重试");
  }
  const email = normalizeEmail(body.email);
  return {
    displayName: readText(body.displayName, "displayName", 2, 40),
    email,
    normalizedEmail: email,
    password: readPassword(body.password),
    consentVersion
  };
}

export function validateLogin(body) {
  assertAllowedKeys(body, ["email", "password"]);
  const email = normalizeEmail(body.email);
  return { email, normalizedEmail: email, password: readPassword(body.password) };
}

export function validateSubmission(body, idempotencyKey) {
  assertAllowedKeys(body, ["name", "websiteUrl", "categoryId", "summary", "contactEmail", "declarationAccepted", "termsAccepted", "source", "company"]);
  if (body.company) return { honeypot: true };
  if (body.declarationAccepted !== true) {
    throw new HttpError(422, "declaration_required", "请确认提交信息真实有效", { field: "declarationAccepted" });
  }
  if (body.termsAccepted !== true) {
    throw new HttpError(422, "terms_required", "请先同意服务条款和隐私政策", { field: "termsAccepted" });
  }
  const normalizedUrl = normalizePublicUrl(body.websiteUrl);
  const categoryId = readText(body.categoryId, "categoryId", 2, 30);
  if (!/^[a-z0-9-]+$/.test(categoryId) || categoryId === "all") {
    throw new HttpError(422, "invalid_category", "工具分类无效", { field: "categoryId" });
  }
  const source = body.source === undefined ? "sidebar" : readText(body.source, "source", 2, 40);
  return {
    name: readText(body.name, "name", 1, 60),
    websiteUrl: normalizedUrl,
    normalizedUrl,
    categoryId,
    summary: readText(body.summary, "summary", 10, 180),
    contactEmail: normalizeEmail(body.contactEmail),
    source,
    idempotencyKey: idempotencyKey ? readText(idempotencyKey, "Idempotency-Key", 8, 128) : null
  };
}

export function validateSubscription(body) {
  assertAllowedKeys(body, ["email", "topicSlugs", "consentVersion", "consentAccepted", "source"]);
  if (body.consentAccepted !== true) {
    throw new HttpError(422, "consent_required", "请确认同意接收周报", { field: "consentAccepted" });
  }
  const topicSlugs = body.topicSlugs === undefined ? [] : body.topicSlugs;
  if (!Array.isArray(topicSlugs) || topicSlugs.length > 20 || topicSlugs.some((item) => typeof item !== "string" || !/^[a-z0-9-]{1,40}$/.test(item))) {
    throw new HttpError(422, "invalid_topics", "订阅主题格式不正确", { field: "topicSlugs" });
  }
  const consentVersion = readText(body.consentVersion || currentConsentVersion, "consentVersion", 4, 20);
  if (consentVersion !== currentConsentVersion) {
    throw new HttpError(409, "consent_version_outdated", "隐私条款已更新，请刷新页面后重试");
  }
  return {
    email: normalizeEmail(body.email),
    normalizedEmail: normalizeEmail(body.email),
    topicSlugs: [...new Set(topicSlugs)],
    consentVersion: currentConsentVersion,
    source: readText(body.source || "news_sidebar", "source", 2, 40)
  };
}

export function validateFeedback(body) {
  assertAllowedKeys(body, ["category", "message", "contactEmail", "pageUrl", "consentVersion", "consentAccepted", "company"]);
  if (body.company) return { honeypot: true };
  if (body.consentAccepted !== true) {
    throw new HttpError(422, "consent_required", "请确认同意隐私政策", { field: "consentAccepted" });
  }
  const categories = new Set(["content", "bug", "suggestion", "cooperation", "other"]);
  const category = readText(body.category, "category", 3, 20);
  if (!categories.has(category)) throw new HttpError(422, "invalid_category", "反馈类型无效", { field: "category" });
  const consentVersion = readText(body.consentVersion || currentConsentVersion, "consentVersion", 4, 20);
  if (consentVersion !== currentConsentVersion) {
    throw new HttpError(409, "consent_version_outdated", "隐私政策已更新，请刷新页面后重试");
  }
  const contactEmail = body.contactEmail ? normalizeEmail(body.contactEmail) : "";
  const pageUrl = body.pageUrl ? readText(body.pageUrl, "pageUrl", 1, 500) : "";
  return {
    category,
    message: readText(body.message, "message", 10, 2000),
    contactEmail,
    pageUrl,
    consentVersion: currentConsentVersion
  };
}

const eventNames = new Set([
  "page_view",
  "page_engagement",
  "search_submit",
  "search_no_results",
  "category_click",
  "tool_card_click",
  "tool_detail_view",
  "tool_official_click",
  "article_click",
  "ad_impression",
  "ad_click",
  "tool_submit_click",
  "tool_submit_success",
  "newsletter_subscribe",
  "filter_apply",
  "tool_favorite",
  "tool_compare_add"
]);

function redactSensitiveText(value) {
  return String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b1[3-9]\d{9}\b/g, "[phone]")
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[secret]");
}

function validateProperties(properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  if (Object.keys(properties).length > 30 || JSON.stringify(properties).length > 4096) {
    throw new HttpError(422, "invalid_properties", "事件属性过多");
  }
  const clean = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!/^[a-zA-Z0-9_]{1,60}$/.test(key)) continue;
    if (typeof value === "string") clean[key] = redactSensitiveText(value).slice(0, 500);
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean" || value === null) clean[key] = value;
    else if (Array.isArray(value) && value.length <= 20 && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      clean[key] = value.map((item) => typeof item === "string" ? redactSensitiveText(item).slice(0, 200) : item);
    }
  }
  return clean;
}

export function validateEventBatch(body) {
  assertAllowedKeys(body, ["visitorId", "sessionId", "events"]);
  const visitorId = readText(body.visitorId, "visitorId", 8, 128);
  const sessionId = readText(body.sessionId, "sessionId", 8, 128);
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 50) {
    throw new HttpError(422, "invalid_events", "每批事件数量必须在 1-50 条之间");
  }
  const events = body.events.map((event) => {
    assertAllowedKeys(event, ["eventId", "eventName", "clientTime", "pageType", "path", "properties"]);
    const eventName = readText(event.eventName, "eventName", 2, 60);
    if (!eventNames.has(eventName)) throw new HttpError(422, "unknown_event", `不支持的事件：${eventName}`);
    const clientTime = readText(event.clientTime, "clientTime", 10, 40);
    if (!Number.isFinite(Date.parse(clientTime))) throw new HttpError(422, "invalid_time", "事件时间无效");
    return {
      eventId: readText(event.eventId, "eventId", 8, 128),
      eventName,
      clientTime: new Date(clientTime).toISOString(),
      pageType: readText(event.pageType, "pageType", 2, 40),
      path: readText(event.path, "path", 1, 500),
      properties: validateProperties(event.properties)
    };
  });
  return { visitorId, sessionId, events };
}

export function validateReview(body) {
  assertAllowedKeys(body, ["status", "reviewNote"]);
  if (!['approved', 'rejected', 'duplicate'].includes(body.status)) {
    throw new HttpError(422, "invalid_status", "审核状态无效", { field: "status" });
  }
  return {
    status: body.status,
    reviewNote: body.reviewNote ? readText(body.reviewNote, "reviewNote", 1, 500) : ""
  };
}
