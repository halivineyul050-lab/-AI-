import { createHash, randomUUID } from "node:crypto";

import { normalizePublicUrl } from "./validation.mjs";

const allowedPricing = new Set(["unknown", "free", "freemium", "trial", "paid", "contact"]);
const allowedLanguages = new Set(["unknown", "zh", "multi"]);
const allowedPlatforms = new Set(["web", "desktop", "mobile", "api"]);
const trackingParameters = new Set([
  "gclid",
  "fbclid",
  "msclkid",
  "ref",
  "referrer",
  "source"
]);

function hash(value, length = 64) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function readText(value, field, { required = false, max = 2048 } = {}) {
  const normalized = String(value ?? "").trim().replaceAll("\u0000", "");
  if (required && !normalized) throw new Error(`${field} 不能为空`);
  if (normalized.length > max) throw new Error(`${field} 超过 ${max} 个字符`);
  return normalized;
}

function canonicalizeUrl(value) {
  const normalized = normalizePublicUrl(value);
  const url = new URL(normalized);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || trackingParameters.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

function normalizeDate(value, fallback) {
  const candidate = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback.slice(0, 10);
}

function normalizePlatforms(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "web").split(/[|;,，、]/);
  const normalized = [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter((item) => allowedPlatforms.has(item)))];
  return normalized.length ? normalized : ["web"];
}

function slugBase(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);
}

function uniqueIdentifier(db, base, stableSuffix, column) {
  const safeBase = base || "tool";
  const first = safeBase.slice(0, 60);
  const exists = db.prepare(`SELECT 1 FROM tools WHERE ${column} = ?`).get(first);
  if (!exists) return first;
  return `${safeBase.slice(0, 50)}-${stableSuffix}`;
}

function categoryForRecord(db, record, categoryMapping) {
  const explicit = readText(record.categoryId, "categoryId", { max: 40 });
  const sourceCategory = readText(record.sourceCategory || record.sourceCategoryName, "sourceCategory", { max: 120 });
  const categoryId = explicit || categoryMapping[sourceCategory];
  if (!categoryId) throw new Error(`未映射分类：${sourceCategory || "空"}`);
  if (!db.prepare("SELECT 1 FROM categories WHERE id = ? AND status = 'published'").get(categoryId)) {
    throw new Error(`目标分类不存在：${categoryId}`);
  }
  return { categoryId, sourceCategory };
}

export function normalizeCatalogRecord(db, input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("记录必须是对象");
  const provider = readText(options.provider, "provider", { required: true, max: 80 });
  const now = options.now || new Date().toISOString();
  const name = readText(input.name, "name", { required: true, max: 80 });
  const sourceKey = readText(input.sourceKey || input.sourceId, "sourceKey", { required: true, max: 200 });
  const sourceDetailUrl = canonicalizeUrl(readText(input.sourceDetailUrl, "sourceDetailUrl", { required: true }));
  const sourceListingUrl = input.sourceListingUrl ? canonicalizeUrl(input.sourceListingUrl) : "";
  const officialUrl = canonicalizeUrl(readText(input.officialUrl || input.websiteUrl, "officialUrl", { required: true }));
  const canonicalUrl = canonicalizeUrl(input.canonicalUrl || officialUrl);
  const logoUrl = input.logoUrl ? canonicalizeUrl(input.logoUrl) : "";
  const { categoryId, sourceCategory } = categoryForRecord(db, input, options.categoryMapping || {});
  const pricingType = allowedPricing.has(String(input.pricingType || input.price || "unknown").toLowerCase())
    ? String(input.pricingType || input.price || "unknown").toLowerCase()
    : "unknown";
  const language = allowedLanguages.has(String(input.language || "unknown").toLowerCase())
    ? String(input.language || "unknown").toLowerCase()
    : "unknown";
  const verifiedDate = normalizeDate(input.verifiedAt || input.updated, now);
  const contentKey = JSON.stringify({
    name,
    officialUrl,
    canonicalUrl,
    sourceCategory,
    pricingType,
    language,
    logoUrl
  });
  return {
    provider,
    sourceKey,
    sourceDetailUrl,
    sourceListingUrl,
    sourceCategory,
    name,
    officialUrl,
    canonicalUrl,
    logoUrl,
    domain: new URL(canonicalUrl).hostname.replace(/^www\./, ""),
    categoryId,
    pricingType,
    language,
    platforms: normalizePlatforms(input.platforms),
    verifiedDate,
    summary: options.acceptEditorialText ? readText(input.summary, "summary", { max: 180 }) : "",
    description: options.acceptEditorialText ? readText(input.description, "description", { max: 4000 }) : "",
    contentHash: hash(contentKey),
    stableSuffix: hash(`${provider}:${sourceKey}`, 8)
  };
}

function findExistingTool(db, record) {
  const source = db.prepare(`
    SELECT tool_id FROM tool_sources
    WHERE provider = ? AND (source_key = ? OR source_detail_url = ?)
    LIMIT 1
  `).get(record.provider, record.sourceKey, record.sourceDetailUrl);
  if (source) return { toolId: source.tool_id, match: "source" };

  const canonical = db.prepare(`
    SELECT id FROM tools
    WHERE canonical_url = ? OR official_url = ?
    ORDER BY status = 'published' DESC
    LIMIT 1
  `).get(record.canonicalUrl, record.officialUrl);
  if (canonical) return { toolId: canonical.id, match: "canonical_url" };

  const domainName = db.prepare(`
    SELECT id FROM tools
    WHERE domain = ? AND name = ? COLLATE NOCASE
    ORDER BY status = 'published' DESC
    LIMIT 1
  `).get(record.domain, record.name);
  return domainName ? { toolId: domainName.id, match: "domain_name" } : null;
}

function genericEditorialCopy(record, categoryName) {
  return {
    summary: record.summary || `${record.name}是收录于${categoryName}分类的AI产品，具体能力与价格请以官方网站为准。`,
    description: record.description || `${record.name}的公开目录信息已完成基础整理。使用前请前往官网核验功能、定价、地区可用性与隐私条款。`
  };
}

function insertTool(db, record, options) {
  const readableBase = slugBase(record.name);
  const slug = uniqueIdentifier(db, readableBase || `tool-${record.stableSuffix}`, record.stableSuffix, "slug");
  const id = uniqueIdentifier(db, `catalog-${readableBase || "tool"}-${record.stableSuffix}`, record.stableSuffix, "id");
  const categoryName = db.prepare("SELECT name FROM categories WHERE id = ?").get(record.categoryId).name;
  const copy = genericEditorialCopy(record, categoryName);
  const status = options.publish ? "published" : "review";
  const now = options.now;

  db.prepare(`
    INSERT INTO tools (
      id, slug, name, domain, official_url, canonical_url, logo_url, category_id,
      summary, description, pricing_type, language, login_requirement, region,
      content_updated_date, editor_score, popularity, data_quality_status,
      first_published_at, last_verified_at, imported_at, is_sponsored, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'basic', ?, ?, ?, 0, ?)
  `).run(
    id,
    slug,
    record.name,
    record.domain,
    record.officialUrl,
    record.canonicalUrl,
    record.logoUrl,
    record.categoryId,
    copy.summary,
    copy.description,
    record.pricingType,
    record.language,
    "待核验",
    "可用性待核验",
    record.verifiedDate,
    45,
    35,
    options.publish ? now : null,
    record.verifiedDate,
    now,
    status
  );
  const insertPlatform = db.prepare("INSERT INTO tool_platforms (tool_id, platform, position) VALUES (?, ?, ?)");
  record.platforms.forEach((platform, position) => insertPlatform.run(id, platform, position));
  db.prepare("INSERT INTO tool_badges (tool_id, badge, position) VALUES (?, '待核验', 0)").run(id);
  return id;
}

function updateMatchedTool(db, toolId, record) {
  db.prepare(`
    UPDATE tools SET
      canonical_url = CASE WHEN canonical_url = '' THEN ? ELSE canonical_url END,
      logo_url = CASE WHEN logo_url = '' THEN ? ELSE logo_url END,
      last_verified_at = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(record.canonicalUrl, record.logoUrl, record.verifiedDate, toolId);
}

function upsertSource(db, toolId, record, batchId, now) {
  const existing = db.prepare(`
    SELECT id FROM tool_sources
    WHERE provider = ? AND (source_key = ? OR source_detail_url = ?)
    LIMIT 1
  `).get(record.provider, record.sourceKey, record.sourceDetailUrl);
  if (existing) {
    db.prepare(`
      UPDATE tool_sources SET
        tool_id = ?, source_key = ?, source_detail_url = ?, source_listing_url = ?,
        source_category_key = ?, source_category_name = ?, content_hash = ?,
        import_batch_id = ?, last_seen_at = ?, imported_at = ?
      WHERE id = ?
    `).run(
      toolId,
      record.sourceKey,
      record.sourceDetailUrl,
      record.sourceListingUrl,
      record.sourceCategory,
      record.sourceCategory,
      record.contentHash,
      batchId,
      now,
      now,
      existing.id
    );
    return;
  }
  db.prepare(`
    INSERT INTO tool_sources (
      id, tool_id, provider, source_key, source_detail_url, source_listing_url,
      source_category_key, source_category_name, content_hash, import_batch_id,
      first_seen_at, last_seen_at, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    toolId,
    record.provider,
    record.sourceKey,
    record.sourceDetailUrl,
    record.sourceListingUrl,
    record.sourceCategory,
    record.sourceCategory,
    record.contentHash,
    batchId,
    now,
    now,
    now
  );
}

export function importToolCatalog(db, records, options = {}) {
  if (!Array.isArray(records)) throw new TypeError("records 必须是数组");
  const now = options.now || new Date().toISOString();
  const provider = readText(options.provider || "authorized-export", "provider", { required: true, max: 80 });
  const batchId = options.batchId || randomUUID();
  const report = {
    batchId,
    provider,
    status: options.dryRun ? "dry_run" : "completed",
    discovered: records.length,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    rejected: 0,
    errors: []
  };
  const manifestHash = hash(JSON.stringify(records));

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO catalog_import_batches (
        id, provider, source_file, status, discovered_count, manifest_hash, started_at
      ) VALUES (?, ?, ?, 'running', ?, ?, ?)
    `).run(batchId, provider, String(options.sourceFile || ""), records.length, manifestHash, now);

    records.forEach((input, index) => {
      try {
        const record = normalizeCatalogRecord(db, input, {
          provider,
          now,
          categoryMapping: options.categoryMapping || {},
          acceptEditorialText: options.acceptEditorialText === true
        });
        const existing = findExistingTool(db, record);
        let toolId;
        if (existing) {
          toolId = existing.toolId;
          updateMatchedTool(db, toolId, record);
          if (existing.match === "source") report.updated += 1;
          else report.duplicates += 1;
        } else {
          toolId = insertTool(db, record, { publish: options.publish === true, now });
          report.inserted += 1;
        }
        upsertSource(db, toolId, record, batchId, now);
      } catch (error) {
        report.rejected += 1;
        if (report.errors.length < 100) report.errors.push({ index, message: error.message });
      }
    });

    const finishedAt = new Date().toISOString();
    db.prepare(`
      UPDATE catalog_import_batches SET
        status = ?, inserted_count = ?, updated_count = ?, duplicate_count = ?,
        rejected_count = ?, error_count = ?, report_json = ?, finished_at = ?
      WHERE id = ?
    `).run(
      report.status,
      report.inserted,
      report.updated,
      report.duplicates,
      report.rejected,
      report.errors.length,
      JSON.stringify(report),
      finishedAt,
      batchId
    );

    if (options.dryRun) db.exec("ROLLBACK");
    else db.exec("COMMIT");
    return report;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
