import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { HttpError, normalizePublicUrl } from "./validation.mjs";

const toolStatuses = new Set(["draft", "review", "published", "archived"]);
const simpleStatuses = new Set(["draft", "published", "archived"]);
const pricingTypes = new Set(["unknown", "free", "freemium", "trial", "paid", "contact"]);
const languages = new Set(["unknown", "zh", "multi"]);
const qualityStatuses = new Set(["basic", "enriched", "verified"]);
const articleKinds = new Set(["tutorial", "news"]);
const platforms = new Set(["web", "desktop", "mobile", "api"]);
const contentTypes = new Set(["tools", "categories", "articles", "collections"]);
const singularNames = { tools: "tool", categories: "category", articles: "article", collections: "collection" };
const localMediaPattern = /^\/assets\/tool-logos\/[a-z0-9-]+\.(?:png|jpe?g|webp|ico|svg|gif|avif)$/;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function transaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function assertAllowedKeys(value, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new HttpError(422, "unknown_fields", "请求包含不支持的字段", { fields: unknown });
  }
}

function requiredText(value, field, min = 1, max = 200) {
  if (typeof value !== "string") throw new HttpError(422, "invalid_field", `${field} 格式不正确`, { field });
  const clean = value.trim().replaceAll("\u0000", "");
  if (clean.length < min || clean.length > max) {
    throw new HttpError(422, "invalid_length", `${field} 长度必须在 ${min}-${max} 个字符之间`, { field });
  }
  return clean;
}

function optionalText(value, field, max = 500, fallback = "") {
  if (value === undefined) return fallback;
  if (value === null || value === "") return "";
  return requiredText(value, field, 1, max);
}

function integer(value, field, min, max, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(422, "invalid_integer", `${field} 必须是 ${min}-${max} 之间的整数`, { field });
  }
  return value;
}

function boolean(value, field, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new HttpError(422, "invalid_boolean", `${field} 必须是布尔值`, { field });
  return value;
}

function enumValue(value, field, values, fallback) {
  const selected = value === undefined ? fallback : value;
  if (!values.has(selected)) throw new HttpError(422, "invalid_enum", `${field} 值无效`, { field });
  return selected;
}

function identifier(value, field, fallback) {
  const selected = value === undefined ? fallback : requiredText(value, field, 2, 100).toLowerCase();
  if (!selected || !idPattern.test(selected)) {
    throw new HttpError(422, "invalid_identifier", `${field} 仅支持小写字母、数字和连字符`, { field });
  }
  return selected;
}

function generateIdentifier(prefix, value) {
  const slug = String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug && idPattern.test(slug) ? slug : `${prefix}-${randomUUID().slice(0, 12)}`;
}

function dateValue(value, field, fallback) {
  const selected = value === undefined ? fallback : requiredText(value, field, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selected) || Number.isNaN(Date.parse(`${selected}T00:00:00Z`))) {
    throw new HttpError(422, "invalid_date", `${field} 必须是 YYYY-MM-DD 日期`, { field });
  }
  return selected;
}

function nullableDate(value, field, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  return dateValue(value, field);
}

function externalUrl(value, field, { allowEmpty = false } = {}) {
  if (allowEmpty && (value === undefined || value === null || value === "")) return "";
  try {
    return normalizePublicUrl(requiredText(value, field, 8, 2048));
  } catch (error) {
    if (error instanceof HttpError) {
      error.details = { ...(error.details || {}), field };
    }
    throw error;
  }
}

function mediaUrl(value, field, fallback = "") {
  if (value === undefined) return fallback;
  if (value === null || value === "") return "";
  const clean = requiredText(value, field, 1, 2048);
  if (clean.startsWith("/")) {
    if (!localMediaPattern.test(clean)) {
      throw new HttpError(422, "invalid_media_path", `${field} 不是允许的本地媒体路径`, { field });
    }
    return clean;
  }
  return externalUrl(clean, field);
}

function textArray(value, field, { allowed, maxItems = 20, maxLength = 120, fallback = [] } = {}) {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new HttpError(422, "invalid_array", `${field} 必须是最多 ${maxItems} 项的数组`, { field });
  }
  const clean = value.map((item) => requiredText(item, field, 1, maxLength));
  if (new Set(clean).size !== clean.length) {
    throw new HttpError(422, "duplicate_array_item", `${field} 不能包含重复项`, { field });
  }
  if (allowed && clean.some((item) => !allowed.has(item))) {
    throw new HttpError(422, "invalid_array_item", `${field} 包含不支持的值`, { field });
  }
  return clean;
}

function readRevision(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new HttpError(422, "revision_required", "更新操作必须提供有效的 revision", { field: "revision" });
  }
  return value;
}

function contentState(db) {
  const row = db.prepare("SELECT revision, updated_at FROM content_state WHERE id = 1").get();
  return { revision: Number(row.revision), updatedAt: row.updated_at };
}

function bumpContentState(db) {
  db.prepare(`
    UPDATE content_state
    SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = 1
  `).run();
  return contentState(db);
}

function insertAudit(db, context, action, entityType, entityId, before, after) {
  db.prepare(`
    INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, before_json, after_json, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    context.actor || "admin-token",
    action,
    entityType,
    entityId,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    context.requestId
  );
}

function mapConstraint(error, entityType) {
  if (!String(error?.code || "").startsWith("ERR_SQLITE_CONSTRAINT")) throw error;
  throw new HttpError(409, "content_conflict", `${entityType} 的 ID、slug 或关联字段已存在`, { entityType });
}

function relationValues(db, table, column, toolId) {
  return db.prepare(`SELECT ${column} AS value FROM ${table} WHERE tool_id = ? ORDER BY position`).all(toolId).map((row) => row.value);
}

function hydrateTool(db, row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    domain: row.domain,
    officialUrl: row.official_url,
    canonicalUrl: row.canonical_url,
    logoUrl: row.logo_url,
    categoryId: row.category_id,
    categorySortOrder: Number(row.category_sort_order),
    summary: row.summary,
    description: row.description,
    pricingType: row.pricing_type,
    language: row.language,
    loginRequirement: row.login_requirement,
    region: row.region,
    contentUpdatedDate: row.content_updated_date,
    editorScore: Number(row.editor_score),
    popularity: Number(row.popularity),
    dataQualityStatus: row.data_quality_status,
    firstPublishedAt: row.first_published_at,
    lastVerifiedAt: row.last_verified_at,
    isSponsored: Boolean(row.is_sponsored),
    status: row.status,
    platforms: relationValues(db, "tool_platforms", "platform", row.id),
    features: relationValues(db, "tool_features", "feature", row.id),
    useCases: relationValues(db, "tool_use_cases", "use_case", row.id),
    badges: relationValues(db, "tool_badges", "badge", row.id),
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydrateCategory(db, row) {
  if (!row) return null;
  const count = db.prepare("SELECT COUNT(*) AS count FROM tools WHERE category_id = ?").get(row.id).count;
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    description: row.description,
    sortOrder: Number(row.sort_order),
    status: row.status,
    toolCount: Number(count),
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydrateArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    topic: row.topic,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body_text,
    cover: row.cover_url,
    date: row.published_date,
    readTime: row.read_time,
    source: row.source_name,
    sourceUrl: row.source_url,
    status: row.status,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydrateCollection(db, row) {
  if (!row) return null;
  const toolIds = db.prepare("SELECT tool_id FROM collection_tools WHERE collection_id = ? ORDER BY position").all(row.id).map((item) => item.tool_id);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    accent: row.accent,
    sortOrder: Number(row.sort_order),
    status: row.status,
    toolIds,
    revision: Number(row.revision)
  };
}

const hydrators = {
  tools: hydrateTool,
  categories: hydrateCategory,
  articles: (_db, row) => hydrateArticle(row),
  collections: hydrateCollection
};

function entityRow(db, type, id) {
  if (!contentTypes.has(type)) throw new HttpError(404, "content_type_not_found", "内容类型不存在");
  return db.prepare(`SELECT * FROM ${type} WHERE id = ?`).get(id);
}

export function getContentVersion(db) {
  return contentState(db);
}

export function getAdminContent(db, type, id) {
  const row = entityRow(db, type, id);
  return row ? hydrators[type](db, row) : null;
}

function paging(filters) {
  const limit = Math.min(Math.max(Number(filters.limit) || 30, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  return { limit, offset };
}

export function listAdminContent(db, type, filters = {}) {
  if (!contentTypes.has(type)) throw new HttpError(404, "content_type_not_found", "内容类型不存在");
  const { limit, offset } = paging(filters);
  const where = [];
  const params = [];
  const statusValues = type === "tools" || type === "articles" ? toolStatuses : simpleStatuses;
  if (filters.status && filters.status !== "all") {
    if (!statusValues.has(filters.status)) throw new HttpError(422, "invalid_status", "状态筛选值无效");
    where.push("status = ?");
    params.push(filters.status);
  }
  const q = String(filters.q || "").trim();
  if (q) {
    const escaped = q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const columns = {
      tools: ["name", "summary", "domain"],
      categories: ["name", "description"],
      articles: ["title", "excerpt", "topic"],
      collections: ["title", "description"]
    }[type];
    where.push(`(${columns.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    columns.forEach(() => params.push(`%${escaped}%`));
  }
  if (type === "tools" && filters.categoryId) {
    where.push("category_id = ?");
    params.push(identifier(filters.categoryId, "categoryId"));
  }
  if (type === "articles" && filters.kind) {
    where.push("kind = ?");
    params.push(enumValue(filters.kind, "kind", articleKinds));
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = {
    tools: "ORDER BY updated_at DESC, name COLLATE NOCASE ASC",
    categories: "ORDER BY sort_order ASC, name COLLATE NOCASE ASC",
    articles: "ORDER BY published_date DESC, updated_at DESC",
    collections: "ORDER BY sort_order ASC, title COLLATE NOCASE ASC"
  }[type];
  const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${type} ${whereSql}`).get(...params).count);
  const rows = db.prepare(`SELECT * FROM ${type} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { items: rows.map((row) => hydrators[type](db, row)), total, limit, offset };
}

function validateTool(db, body, previous = null) {
  assertAllowedKeys(body, [
    "id", "slug", "name", "officialUrl", "canonicalUrl", "logoUrl", "categoryId", "categorySortOrder",
    "summary", "description", "pricingType", "language", "loginRequirement", "region", "contentUpdatedDate",
    "editorScore", "popularity", "dataQualityStatus", "firstPublishedAt", "lastVerifiedAt", "isSponsored",
    "status", "platforms", "features", "useCases", "badges", "revision"
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const id = previous?.id || identifier(body.id, "id", generateIdentifier("tool", body.slug || body.name));
  const name = requiredText(body.name ?? previous?.name, "name", 1, 100);
  const slug = identifier(body.slug, "slug", previous?.slug || id);
  const officialUrl = externalUrl(body.officialUrl ?? previous?.officialUrl, "officialUrl");
  const categoryId = identifier(body.categoryId, "categoryId", previous?.categoryId);
  const category = db.prepare("SELECT status FROM categories WHERE id = ?").get(categoryId);
  if (!category || category.status === "archived" || categoryId === "all") {
    throw new HttpError(422, "invalid_category", "工具分类不存在或已归档", { field: "categoryId" });
  }
  const status = enumValue(body.status, "status", toolStatuses, previous?.status || "draft");
  let firstPublishedAt = nullableDate(body.firstPublishedAt, "firstPublishedAt", previous?.firstPublishedAt || null);
  if (status === "published" && !firstPublishedAt) firstPublishedAt = today;
  return {
    id,
    slug,
    name,
    domain: new URL(officialUrl).hostname.replace(/^www\./, ""),
    officialUrl,
    canonicalUrl: externalUrl(body.canonicalUrl ?? previous?.canonicalUrl ?? officialUrl, "canonicalUrl"),
    logoUrl: mediaUrl(body.logoUrl, "logoUrl", previous?.logoUrl || ""),
    categoryId,
    categorySortOrder: integer(body.categorySortOrder, "categorySortOrder", 0, 1_000_000, previous?.categorySortOrder ?? 1000),
    summary: requiredText(body.summary ?? previous?.summary, "summary", 5, 300),
    description: requiredText(body.description ?? previous?.description, "description", 10, 20_000),
    pricingType: enumValue(body.pricingType, "pricingType", pricingTypes, previous?.pricingType || "unknown"),
    language: enumValue(body.language, "language", languages, previous?.language || "unknown"),
    loginRequirement: optionalText(body.loginRequirement, "loginRequirement", 200, previous?.loginRequirement || ""),
    region: optionalText(body.region, "region", 200, previous?.region || ""),
    contentUpdatedDate: dateValue(body.contentUpdatedDate, "contentUpdatedDate", previous?.contentUpdatedDate || today),
    editorScore: integer(body.editorScore, "editorScore", 0, 100, previous?.editorScore ?? 0),
    popularity: integer(body.popularity, "popularity", 0, 100, previous?.popularity ?? 0),
    dataQualityStatus: enumValue(body.dataQualityStatus, "dataQualityStatus", qualityStatuses, previous?.dataQualityStatus || "basic"),
    firstPublishedAt,
    lastVerifiedAt: nullableDate(body.lastVerifiedAt, "lastVerifiedAt", previous?.lastVerifiedAt || null),
    isSponsored: boolean(body.isSponsored, "isSponsored", previous?.isSponsored || false),
    status,
    platforms: textArray(body.platforms, "platforms", { allowed: platforms, maxItems: 4, maxLength: 20, fallback: previous?.platforms || [] }),
    features: textArray(body.features, "features", { maxItems: 20, maxLength: 160, fallback: previous?.features || [] }),
    useCases: textArray(body.useCases, "useCases", { maxItems: 20, maxLength: 160, fallback: previous?.useCases || [] }),
    badges: textArray(body.badges, "badges", { maxItems: 20, maxLength: 80, fallback: previous?.badges || [] })
  };
}

function validateCategory(body, previous = null) {
  assertAllowedKeys(body, ["id", "name", "icon", "description", "sortOrder", "status", "revision"]);
  const id = previous?.id || identifier(body.id, "id", generateIdentifier("category", body.name));
  const status = enumValue(body.status, "status", simpleStatuses, previous?.status || "draft");
  if (id === "all" && status !== "published") throw new HttpError(409, "protected_category", "全部工具分类必须保持发布状态");
  return {
    id,
    name: requiredText(body.name ?? previous?.name, "name", 1, 60),
    icon: identifier(body.icon, "icon", previous?.icon || "folder"),
    description: optionalText(body.description, "description", 500, previous?.description || ""),
    sortOrder: integer(body.sortOrder, "sortOrder", 0, 100_000, previous?.sortOrder ?? 1000),
    status
  };
}

function validateArticle(body, previous = null) {
  assertAllowedKeys(body, [
    "id", "slug", "kind", "topic", "title", "excerpt", "body", "cover", "date", "readTime",
    "source", "sourceUrl", "status", "revision"
  ]);
  const title = requiredText(body.title ?? previous?.title, "title", 2, 200);
  const id = previous?.id || identifier(body.id, "id", generateIdentifier("article", body.slug || title));
  return {
    id,
    slug: identifier(body.slug, "slug", previous?.slug || id),
    kind: enumValue(body.kind, "kind", articleKinds, previous?.kind || "news"),
    topic: requiredText(body.topic ?? previous?.topic, "topic", 1, 80),
    title,
    excerpt: requiredText(body.excerpt ?? previous?.excerpt, "excerpt", 5, 500),
    body: requiredText(body.body ?? previous?.body, "body", 10, 250_000),
    cover: mediaUrl(body.cover, "cover", previous?.cover || ""),
    date: dateValue(body.date, "date", previous?.date || new Date().toISOString().slice(0, 10)),
    readTime: requiredText(body.readTime ?? previous?.readTime ?? "1分钟", "readTime", 1, 30),
    source: optionalText(body.source, "source", 120, previous?.source || ""),
    sourceUrl: externalUrl(body.sourceUrl ?? previous?.sourceUrl, "sourceUrl", { allowEmpty: true }),
    status: enumValue(body.status, "status", toolStatuses, previous?.status || "draft")
  };
}

function validateCollection(db, body, previous = null) {
  assertAllowedKeys(body, ["id", "title", "description", "icon", "accent", "sortOrder", "status", "toolIds", "revision"]);
  const toolIds = textArray(body.toolIds, "toolIds", { maxItems: 100, maxLength: 100, fallback: previous?.toolIds || [] });
  toolIds.forEach((toolId) => {
    if (!idPattern.test(toolId) || !db.prepare("SELECT 1 FROM tools WHERE id = ? AND status <> 'archived'").get(toolId)) {
      throw new HttpError(422, "invalid_tool_reference", `专题引用的工具 ${toolId} 不存在或已归档`, { field: "toolIds", toolId });
    }
  });
  const accent = requiredText(body.accent ?? previous?.accent ?? "#0f766e", "accent", 7, 7).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(accent)) throw new HttpError(422, "invalid_accent", "accent 必须是六位十六进制颜色", { field: "accent" });
  return {
    id: previous?.id || identifier(body.id, "id", generateIdentifier("collection", body.title)),
    title: requiredText(body.title ?? previous?.title, "title", 1, 100),
    description: requiredText(body.description ?? previous?.description, "description", 5, 500),
    icon: identifier(body.icon, "icon", previous?.icon || "sparkles"),
    accent,
    sortOrder: integer(body.sortOrder, "sortOrder", 0, 100_000, previous?.sortOrder ?? 1000),
    status: enumValue(body.status, "status", simpleStatuses, previous?.status || "draft"),
    toolIds
  };
}

function setToolRelations(db, tool) {
  const relations = [
    ["tool_platforms", "platform", tool.platforms],
    ["tool_features", "feature", tool.features],
    ["tool_use_cases", "use_case", tool.useCases],
    ["tool_badges", "badge", tool.badges]
  ];
  relations.forEach(([table, column, values]) => {
    db.prepare(`DELETE FROM ${table} WHERE tool_id = ?`).run(tool.id);
    const insert = db.prepare(`INSERT INTO ${table} (tool_id, ${column}, position) VALUES (?, ?, ?)`);
    values.forEach((value, position) => insert.run(tool.id, value, position));
  });
}

function setCollectionTools(db, collection) {
  db.prepare("DELETE FROM collection_tools WHERE collection_id = ?").run(collection.id);
  const insert = db.prepare("INSERT INTO collection_tools (collection_id, tool_id, position) VALUES (?, ?, ?)");
  collection.toolIds.forEach((toolId, position) => insert.run(collection.id, toolId, position));
}

const validators = {
  tools: validateTool,
  categories: (_db, body, previous) => validateCategory(body, previous),
  articles: (_db, body, previous) => validateArticle(body, previous),
  collections: validateCollection
};

export function createAdminContent(db, type, body, context) {
  if (!contentTypes.has(type)) throw new HttpError(404, "content_type_not_found", "内容类型不存在");
  if (Object.hasOwn(body, "revision")) {
    throw new HttpError(422, "invalid_revision", "新增内容不能指定 revision", { field: "revision" });
  }
  const entity = validators[type](db, body);
  try {
    return transaction(db, () => {
      if (type === "tools") {
        db.prepare(`
          INSERT INTO tools (
            id, slug, name, domain, official_url, canonical_url, logo_url, category_id, category_sort_order,
            summary, description, pricing_type, language, login_requirement, region, content_updated_date,
            editor_score, popularity, data_quality_status, first_published_at, last_verified_at,
            is_sponsored, status, cms_managed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        `).run(
          entity.id, entity.slug, entity.name, entity.domain, entity.officialUrl, entity.canonicalUrl, entity.logoUrl,
          entity.categoryId, entity.categorySortOrder, entity.summary, entity.description, entity.pricingType, entity.language,
          entity.loginRequirement, entity.region, entity.contentUpdatedDate, entity.editorScore, entity.popularity,
          entity.dataQualityStatus, entity.firstPublishedAt, entity.lastVerifiedAt, entity.isSponsored ? 1 : 0, entity.status
        );
        setToolRelations(db, entity);
      } else if (type === "categories") {
        db.prepare(`
          INSERT INTO categories (id, name, icon, description, sort_order, status, cms_managed_at)
          VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        `).run(entity.id, entity.name, entity.icon, entity.description, entity.sortOrder, entity.status);
      } else if (type === "articles") {
        db.prepare(`
          INSERT INTO articles (
            id, slug, kind, topic, title, excerpt, cover_url, body_text, published_date, read_time,
            source_name, source_url, status, cms_managed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        `).run(
          entity.id, entity.slug, entity.kind, entity.topic, entity.title, entity.excerpt, entity.cover, entity.body,
          entity.date, entity.readTime, entity.source, entity.sourceUrl, entity.status
        );
      } else {
        db.prepare(`
          INSERT INTO collections (id, title, description, icon, accent, sort_order, status, cms_managed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        `).run(entity.id, entity.title, entity.description, entity.icon, entity.accent, entity.sortOrder, entity.status);
        setCollectionTools(db, entity);
      }
      const after = getAdminContent(db, type, entity.id);
      insertAudit(db, context, `create_${singularNames[type]}`, singularNames[type], entity.id, null, after);
      const state = bumpContentState(db);
      return { item: after, contentRevision: state.revision };
    });
  } catch (error) {
    mapConstraint(error, singularNames[type]);
  }
}

export function updateAdminContent(db, type, id, body, context) {
  if (!contentTypes.has(type)) throw new HttpError(404, "content_type_not_found", "内容类型不存在");
  if (Object.hasOwn(body, "id")) {
    throw new HttpError(422, "immutable_field", "内容 ID 创建后不能修改", { field: "id" });
  }
  const before = getAdminContent(db, type, id);
  if (!before) return null;
  const expectedRevision = readRevision(body.revision);
  const entity = validators[type](db, body, before);
  if (type === "categories" && entity.status === "archived") {
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM tools WHERE category_id = ?").get(id).count);
    if (count) throw new HttpError(409, "category_in_use", "该分类仍有关联工具，不能归档", { toolCount: count });
  }
  try {
    return transaction(db, () => {
      let changed;
      if (type === "tools") {
        changed = db.prepare(`
          UPDATE tools SET
            slug = ?, name = ?, domain = ?, official_url = ?, canonical_url = ?, logo_url = ?, category_id = ?,
            category_sort_order = ?, summary = ?, description = ?, pricing_type = ?, language = ?,
            login_requirement = ?, region = ?, content_updated_date = ?, editor_score = ?, popularity = ?,
            data_quality_status = ?, first_published_at = ?, last_verified_at = ?, is_sponsored = ?, status = ?,
            cms_managed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), revision = revision + 1
          WHERE id = ? AND revision = ?
        `).run(
          entity.slug, entity.name, entity.domain, entity.officialUrl, entity.canonicalUrl, entity.logoUrl,
          entity.categoryId, entity.categorySortOrder, entity.summary, entity.description, entity.pricingType,
          entity.language, entity.loginRequirement, entity.region, entity.contentUpdatedDate, entity.editorScore,
          entity.popularity, entity.dataQualityStatus, entity.firstPublishedAt, entity.lastVerifiedAt,
          entity.isSponsored ? 1 : 0, entity.status, id, expectedRevision
        );
        if (Number(changed.changes) === 1) setToolRelations(db, entity);
      } else if (type === "categories") {
        changed = db.prepare(`
          UPDATE categories SET name = ?, icon = ?, description = ?, sort_order = ?, status = ?,
            cms_managed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), revision = revision + 1
          WHERE id = ? AND revision = ?
        `).run(entity.name, entity.icon, entity.description, entity.sortOrder, entity.status, id, expectedRevision);
      } else if (type === "articles") {
        changed = db.prepare(`
          UPDATE articles SET slug = ?, kind = ?, topic = ?, title = ?, excerpt = ?, cover_url = ?, body_text = ?,
            published_date = ?, read_time = ?, source_name = ?, source_url = ?, status = ?,
            cms_managed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), revision = revision + 1
          WHERE id = ? AND revision = ?
        `).run(
          entity.slug, entity.kind, entity.topic, entity.title, entity.excerpt, entity.cover, entity.body,
          entity.date, entity.readTime, entity.source, entity.sourceUrl, entity.status, id, expectedRevision
        );
      } else {
        changed = db.prepare(`
          UPDATE collections SET title = ?, description = ?, icon = ?, accent = ?, sort_order = ?, status = ?,
            cms_managed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), revision = revision + 1
          WHERE id = ? AND revision = ?
        `).run(entity.title, entity.description, entity.icon, entity.accent, entity.sortOrder, entity.status, id, expectedRevision);
        if (Number(changed.changes) === 1) setCollectionTools(db, entity);
      }
      if (Number(changed.changes) !== 1) {
        throw new HttpError(409, "revision_conflict", "内容已被其他操作更新，请刷新后重试", { currentRevision: getAdminContent(db, type, id)?.revision });
      }
      const after = getAdminContent(db, type, id);
      insertAudit(db, context, `update_${singularNames[type]}`, singularNames[type], id, before, after);
      const state = bumpContentState(db);
      return { item: after, contentRevision: state.revision };
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    mapConstraint(error, singularNames[type]);
  }
}

export function archiveAdminContent(db, type, id, context) {
  if (!contentTypes.has(type)) throw new HttpError(404, "content_type_not_found", "内容类型不存在");
  const before = getAdminContent(db, type, id);
  if (!before) return null;
  if (type === "categories") {
    if (id === "all") throw new HttpError(409, "protected_category", "全部工具分类不能归档");
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM tools WHERE category_id = ?").get(id).count);
    if (count) throw new HttpError(409, "category_in_use", "该分类仍有关联工具，不能归档", { toolCount: count });
  }
  return transaction(db, () => {
    const timestampUpdate = type === "collections"
      ? "cms_managed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
      : "cms_managed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    db.prepare(`UPDATE ${type} SET status = 'archived', ${timestampUpdate}, revision = revision + 1 WHERE id = ?`).run(id);
    const after = getAdminContent(db, type, id);
    insertAudit(db, context, `archive_${singularNames[type]}`, singularNames[type], id, before, after);
    const state = bumpContentState(db);
    return { item: after, contentRevision: state.revision };
  });
}

const logoTypes = {
  "image/png": { extension: "png", signature: (data) => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { extension: "jpg", signature: (data) => data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  "image/webp": { extension: "webp", signature: (data) => data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP" },
  "image/gif": { extension: "gif", signature: (data) => ["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("ascii")) },
  "image/x-icon": { extension: "ico", signature: (data) => data.length >= 6 && data.readUInt16LE(0) === 0 && data.readUInt16LE(2) === 1 && data.readUInt16LE(4) > 0 },
  "image/svg+xml": { extension: "svg", signature: validateSvg }
};

function validateSvg(data) {
  const source = data.toString("utf8").replace(/^\uFEFF/, "").trim().replace(/^<\?xml[^?]*\?>\s*/i, "");
  if (!/^<svg(?:\s|>)/i.test(source) || (!/<\/svg>\s*$/i.test(source) && !/\/\>\s*$/.test(source))) return false;
  if (/\uFFFD/.test(source)) return false;
  if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject|<iframe|<object|<embed|<image|@import|javascript:|data:/i.test(source)) return false;
  if (/\bon[a-z]+\s*=/i.test(source)) return false;
  if (/\b(?:href|xlink:href)\s*=\s*["'](?!#)[^"']*/i.test(source)) return false;
  const urls = [...source.matchAll(/url\(([^)]+)\)/gi)].map((match) => match[1].trim().replace(/^['"]|['"]$/g, ""));
  return urls.every((value) => /^#[A-Za-z0-9_.:-]+$/.test(value));
}

function decodeBase64(value) {
  const clean = requiredText(value, "dataBase64", 4, 1_500_000).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new HttpError(422, "invalid_base64", "dataBase64 不是有效的 Base64 数据", { field: "dataBase64" });
  }
  const data = Buffer.from(clean, "base64");
  if (data.toString("base64").replace(/=+$/, "") !== clean.replace(/=+$/, "")) {
    throw new HttpError(422, "invalid_base64", "dataBase64 不是有效的 Base64 数据", { field: "dataBase64" });
  }
  if (!data.length || data.length > 1024 * 1024) {
    throw new HttpError(413, "logo_too_large", "Logo 文件解码后不能超过 1MB");
  }
  return data;
}

export function saveAdminLogo(db, body, context, staticDir) {
  assertAllowedKeys(body, ["fileName", "mimeType", "dataBase64"]);
  const mimeType = requiredText(body.mimeType, "mimeType", 5, 40).toLowerCase();
  const type = logoTypes[mimeType];
  if (!type) throw new HttpError(422, "unsupported_logo_type", "仅支持 PNG、JPEG、WebP、GIF、ICO 和安全 SVG");
  const originalName = body.fileName === undefined ? "" : requiredText(body.fileName, "fileName", 1, 180).replace(/[^a-zA-Z0-9._-]/g, "_");
  const data = decodeBase64(body.dataBase64);
  if (!type.signature(data)) throw new HttpError(422, "logo_signature_mismatch", "文件内容与声明的图片类型不一致或 SVG 含不安全内容");
  const fileName = `admin-${randomUUID()}.${type.extension}`;
  const directory = resolve(staticDir, "assets", "tool-logos");
  const filePath = resolve(directory, fileName);
  mkdirSync(directory, { recursive: true });
  writeFileSync(filePath, data, { flag: "wx" });
  try {
    const result = transaction(db, () => {
      const logoUrl = `/assets/tool-logos/${fileName}`;
      const metadata = { logoUrl, mimeType, size: data.length, originalName };
      insertAudit(db, context, "upload_logo", "media_logo", fileName, null, metadata);
      const state = bumpContentState(db);
      return { ...metadata, contentRevision: state.revision };
    });
    return result;
  } catch (error) {
    try { unlinkSync(filePath); } catch {}
    throw error;
  }
}
