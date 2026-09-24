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

const sensitiveKey = /^(?:authorization|proxy-authorization|api[_-]?key|encryptedApiKey|encrypted_api_key|ciphertext)$/i;

export function redactSensitiveText(value) {
  return String(value)
    .replace(/((?:["']?(?:authorization|proxy-authorization|api[_-]?key|encryptedApiKey|encrypted_api_key|ciphertext)["']?)\s*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|(?:Bearer|Basic)\s+[^\s,;&"'<>]+|[^\s,;&"'<>}]+)/gi, "$1[secret]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [secret]")
    .replace(/\bv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/g, "[secret]")
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]+/gi, "[secret]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b1[3-9]\d{9}\b/g, "[phone]");
}

export function sanitizeSensitiveData(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactSensitiveText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeSensitiveData(item, seen));
  const entries = value instanceof Error
    ? Object.entries({ ...value, name: value.name, message: value.message, stack: value.stack })
    : Object.entries(value);
  return Object.fromEntries(entries.map(([key, item]) => [key, sensitiveKey.test(key) ? "[secret]" : sanitizeSensitiveData(item, seen)]));
}

function validateProperties(properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  if (Object.keys(properties).length > 30 || JSON.stringify(properties).length > 4096) {
    throw new HttpError(422, "invalid_properties", "事件属性过多");
  }
  const clean = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!/^[a-zA-Z0-9_]{1,60}$/.test(key)) continue;
    if (sensitiveKey.test(key)) clean[key] = "[secret]";
    else if (typeof value === "string") clean[key] = redactSensitiveText(value).slice(0, 500);
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

const imageRatios = new Set(["1:1", "16:9", "9:16", "4:3", "3:4"]);
function imageInteger(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new HttpError(422, "invalid_field", `${field} 数值无效`, { field });
  return value;
}
function imageBoolean(value, field) {
  if (typeof value !== "boolean") throw new HttpError(422, "invalid_field", `${field} 必须是布尔值`, { field });
  return value;
}

export function validateImageRevision(body, additionalKeys = []) {
  assertAllowedKeys(body, ["revision", ...additionalKeys]);
  return { revision: imageInteger(body.revision, "revision", 1, Number.MAX_SAFE_INTEGER) };
}

export function validateImageProvider(body, partial = false) {
  const fields = ["name", "baseUrl", "generationPath", "editPath", "apiKey", "timeoutMs", "enabled"];
  assertAllowedKeys(body, partial ? [...fields, "revision"] : fields);
  const result = partial ? validateImageRevision(body, fields) : {};
  if (!partial || Object.hasOwn(body, "name")) result.name = readText(body.name, "name", 1, 80);
  if (!partial || Object.hasOwn(body, "baseUrl")) {
    const url = new URL(normalizePublicUrl(body.baseUrl));
    if (url.protocol !== "https:" || url.search || url.hash) throw new HttpError(422, "invalid_url", "生图平台必须使用不含查询参数的 HTTPS 地址");
    result.baseUrl = url.toString();
  }
  if (Object.hasOwn(body, "generationPath")) {
    const path = readText(body.generationPath, "generationPath", 1, 200);
    if (!/^\/(?!\/)[A-Za-z0-9/_-]+$/.test(path)) throw new HttpError(422, "invalid_field", "生成接口必须是站内绝对路径");
    result.generationPath = path;
  }
  if (Object.hasOwn(body, "editPath")) {
    const path = readText(body.editPath, "editPath", 0, 200);
    if (path && !/^\/(?!\/)[A-Za-z0-9/_-]+$/.test(path)) throw new HttpError(422, "invalid_field", "参考图编辑路径必须是站内绝对路径");
    result.editPath = path;
  }
  if (!partial || Object.hasOwn(body, "apiKey")) {
    if (partial && body.apiKey === "") { /* An empty edit preserves the stored key. */ }
    else {
      result.apiKey = readText(body.apiKey, "apiKey", 1, 4096);
      if (/[\u0000-\u0020\u007f]/.test(result.apiKey)) throw new HttpError(422, "invalid_field", "API Key 格式不正确");
    }
  }
  if (Object.hasOwn(body, "timeoutMs")) result.timeoutMs = imageInteger(body.timeoutMs, "timeoutMs", 10000, 180000);
  if (Object.hasOwn(body, "enabled")) result.enabled = imageBoolean(body.enabled, "enabled");
  return result;
}

export function validateImageModel(body, partial = false) {
  const fields = ["providerId", "modelId", "displayName", "supportedRatios", "maxImages", "sortOrder", "enabled", "isDefault"];
  assertAllowedKeys(body, partial ? [...fields, "revision"] : fields);
  const result = partial ? validateImageRevision(body, fields) : {};
  for (const [field, max] of [["providerId", 100], ["modelId", 200], ["displayName", 100]]) {
    if (!partial || Object.hasOwn(body, field)) result[field] = readText(body[field], field, 1, max);
  }
  if (!partial || Object.hasOwn(body, "supportedRatios")) {
    if (!Array.isArray(body.supportedRatios) || !body.supportedRatios.length || body.supportedRatios.length > 5 || body.supportedRatios.some((ratio) => !imageRatios.has(ratio))) throw new HttpError(422, "invalid_field", "支持的图片比例无效");
    result.supportedRatios = [...new Set(body.supportedRatios)];
  }
  if (!partial || Object.hasOwn(body, "maxImages")) result.maxImages = imageInteger(body.maxImages, "maxImages", 1, 4);
  if (Object.hasOwn(body, "sortOrder")) result.sortOrder = imageInteger(body.sortOrder, "sortOrder", -100000, 100000);
  for (const field of ["enabled", "isDefault"]) if (Object.hasOwn(body, field)) result[field] = imageBoolean(body[field], field);
  return result;
}

export function validateImageGeneration(body) {
  if (Object.hasOwn(body, "referenceImages")) throw new HttpError(422, "invalid_field", "一次只能上传一张参考图。");
  assertAllowedKeys(body, ["modelRecordId", "prompt", "ratio", "style", "count", "referenceImage"]);
  if (!imageRatios.has(body.ratio)) throw new HttpError(422, "invalid_field", "图片比例无效");
  const result = {
    modelRecordId: readText(body.modelRecordId, "modelRecordId", 1, 100),
    prompt: readText(body.prompt, "prompt", 1, 4000),
    ratio: body.ratio,
    style: body.style === undefined ? "自动" : readText(body.style, "style", 0, 100),
    count: imageInteger(body.count, "count", 1, 4)
  };
  if (Object.hasOwn(body, "referenceImage")) {
    const reference = body.referenceImage;
    if (typeof reference === "string") throw new HttpError(422, "image_reference_unsupported", "请通过上传文件添加参考图，不支持内嵌图片数据。");
    if (!reference || !Buffer.isBuffer(reference.bytes) || !["image/png", "image/jpeg", "image/webp"].includes(reference.mimeType)
      || reference.bytes.length < 1 || reference.bytes.length > 10 * 1024 * 1024) {
      throw new HttpError(422, "invalid_reference_image", "参考图格式无效，支持 PNG、JPEG 或 WebP，最大 10MB。");
    }
    result.referenceImage = reference;
  }
  return result;
}

export async function readImageRequestBody(request) {
  const contentType = String(request.headers["content-type"] || "");
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type === "multipart/form-data") {
    const maxBytes = 10 * 1024 * 1024 + 128 * 1024;
    if (Number(request.headers["content-length"]) > maxBytes) throw new HttpError(413, "payload_too_large", "请求内容过大");
    let size = 0;
    let oversized = false;
    const chunks = [];
    for await (const chunk of request) {
      if (oversized) continue;
      size += chunk.length;
      if (size > maxBytes) { oversized = true; chunks.length = 0; continue; }
      chunks.push(chunk);
    }
    if (oversized) throw new HttpError(413, "payload_too_large", "请求内容过大");
    const boundaryMatch = /(?:^|;)\s*boundary=(?:"([^"]{1,70})"|([^;\s]{1,70}))/i.exec(contentType);
    const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
    if (!boundary || !/^[0-9A-Za-z'()+_,./:=?-]{1,70}$/.test(boundary)) throw new HttpError(400, "invalid_multipart", "上传数据格式无效。");
    return parseImageMultipart(Buffer.concat(chunks, size), boundary);
  }
  if (type !== "application/json") throw new HttpError(415, "invalid_type", "请使用 JSON 提交生图请求");
  return readJsonBody(request, 64 * 1024);
}

function parseImageMultipart(body, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  const separator = Buffer.from(`\r\n--${boundary}`);
  const result = {};
  let offset = 0;
  let parts = 0;
  while (offset < body.length) {
    if (!body.subarray(offset, offset + marker.length).equals(marker)) throw new HttpError(400, "invalid_multipart", "上传数据格式无效。");
    offset += marker.length;
    if (body.subarray(offset, offset + 2).equals(Buffer.from("--"))) {
      offset += 2;
      if (offset < body.length && !body.subarray(offset).equals(Buffer.from("\r\n"))) throw new HttpError(400, "invalid_multipart", "上传数据格式无效。");
      break;
    }
    if (!body.subarray(offset, offset + 2).equals(Buffer.from("\r\n"))) throw new HttpError(400, "invalid_multipart", "上传数据格式无效。");
    offset += 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), offset);
    if (headerEnd < 0 || headerEnd - offset > 4096) throw new HttpError(400, "invalid_multipart", "上传数据格式无效。");
    const headers = body.toString("latin1", offset, headerEnd);
    const disposition = /^Content-Disposition:\s*form-data;\s*name="([A-Za-z][A-Za-z0-9]*)"(?:;\s*filename="([^"\r\n]{1,255})")?\r?$/im.exec(headers);
    if (!disposition || /\r?\n(?!Content-Type:)/i.test(headers.replace(/^Content-Disposition:[^\r\n]*/i, ""))) throw new HttpError(400, "invalid_multipart", "上传数据格式无效。");
    const name = disposition[1];
    if (Object.hasOwn(result, name) || ++parts > 6) throw new HttpError(400, "invalid_multipart", "上传字段重复或过多。");
    offset = headerEnd + 4;
    const next = body.indexOf(separator, offset);
    if (next < 0) throw new HttpError(400, "invalid_multipart", "上传数据格式无效。");
    const value = body.subarray(offset, next);
    offset = next + 2;
    if (disposition[2] !== undefined) {
      if (name !== "referenceImage") throw new HttpError(422, "unknown_fields", "请求包含不支持的字段。");
      const typeMatch = /^Content-Type:\s*(image\/(?:png|jpeg|webp))\s*$/im.exec(headers);
      if (!typeMatch || value.length > 10 * 1024 * 1024) throw new HttpError(422, "invalid_reference_image", "参考图格式无效，支持 PNG、JPEG 或 WebP，最大 10MB。");
      result.referenceImage = { bytes: Buffer.from(value), mimeType: typeMatch[1].toLowerCase(), fileName: disposition[2] };
    } else {
      if (headers.includes("Content-Type:")) throw new HttpError(400, "invalid_multipart", "上传数据格式无效。");
      try { result[name] = new TextDecoder("utf-8", { fatal: true }).decode(value); }
      catch { throw new HttpError(400, "invalid_multipart", "上传数据格式无效。"); }
      if (name === "count" && /^\d+$/.test(result[name])) result[name] = Number(result[name]);
    }
  }
  if (offset !== body.length && !(offset + 2 === body.length && body.subarray(offset).equals(Buffer.from("\r\n")))) throw new HttpError(400, "invalid_multipart", "上传数据格式无效。");
  if (!result.referenceImage) throw new HttpError(422, "invalid_reference_image", "请上传一张 PNG、JPEG 或 WebP 参考图。");
  return result;
}
