import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const schemaPath = resolve(import.meta.dirname, "schema.sql");
const migrations = [
  { version: 1, name: "initial_schema", sql: readFileSync(schemaPath, "utf8") },
  { version: 2, name: "lookup_tokens", sql: readFileSync(resolve(import.meta.dirname, "migrations", "002_lookup_tokens.sql"), "utf8") },
  { version: 3, name: "article_sources", sql: readFileSync(resolve(import.meta.dirname, "migrations", "003_article_sources.sql"), "utf8") },
  { version: 4, name: "tool_catalog_imports", sql: readFileSync(resolve(import.meta.dirname, "migrations", "004_tool_catalog_imports.sql"), "utf8") },
  { version: 5, name: "comic_category", sql: readFileSync(resolve(import.meta.dirname, "migrations", "005_comic_category.sql"), "utf8") },
  { version: 6, name: "content_management", sql: readFileSync(resolve(import.meta.dirname, "migrations", "006_content_management.sql"), "utf8") },
  { version: 7, name: "feedback_messages", sql: readFileSync(resolve(import.meta.dirname, "migrations", "007_feedback.sql"), "utf8") },
  { version: 8, name: "user_accounts", sql: readFileSync(resolve(import.meta.dirname, "migrations", "008_user_accounts.sql"), "utf8") },
  { version: 9, name: "user_favorites", sql: readFileSync(resolve(import.meta.dirname, "migrations", "009_user_favorites.sql"), "utf8") },
  { version: 10, name: "tool_ratings", sql: readFileSync(resolve(import.meta.dirname, "migrations", "010_tool_ratings.sql"), "utf8") }
  ,{ version: 11, name: "super_admin_controls", sql: readFileSync(resolve(import.meta.dirname, "migrations", "011_super_admin_controls.sql"), "utf8") }
  ,{ version: 12, name: "account_activity", sql: readFileSync(resolve(import.meta.dirname, "migrations", "012_account_activity.sql"), "utf8") }
  ,{ version: 13, name: "analytics_visitors", sql: readFileSync(resolve(import.meta.dirname, "migrations", "013_analytics_visitors.sql"), "utf8") }
];

function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runTransaction(db, callback) {
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

function rowsToStrings(rows, key) {
  return rows.map((row) => row[key]);
}

export function openDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  const hasMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
  const recordMigration = db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)");
  migrations.forEach((migration) => {
    if (hasMigration.get(migration.version)) return;
    db.exec(migration.sql);
    recordMigration.run(migration.version, migration.name);
  });
  return db;
}

export function seedDatabase(db, seedData) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM tools").get().count;
  if (existing > 0) return { seeded: false, tools: Number(existing) };

  return runTransaction(db, () => {
    const insertCategory = db.prepare(`
      INSERT OR IGNORE INTO categories (id, name, icon, sort_order)
      VALUES (?, ?, ?, ?)
    `);
    seedData.categories.forEach((category, index) => {
      insertCategory.run(category.id, category.name, category.icon, index);
    });

    const insertTool = db.prepare(`
      INSERT INTO tools (
        id, slug, name, domain, official_url, canonical_url, logo_url, category_id, category_sort_order, summary, description,
        pricing_type, language, login_requirement, region, content_updated_date,
        editor_score, popularity, data_quality_status, first_published_at,
        last_verified_at, is_sponsored
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPlatform = db.prepare("INSERT INTO tool_platforms (tool_id, platform, position) VALUES (?, ?, ?)");
    const insertFeature = db.prepare("INSERT INTO tool_features (tool_id, feature, position) VALUES (?, ?, ?)");
    const insertUseCase = db.prepare("INSERT INTO tool_use_cases (tool_id, use_case, position) VALUES (?, ?, ?)");
    const insertBadge = db.prepare("INSERT INTO tool_badges (tool_id, badge, position) VALUES (?, ?, ?)");

    seedData.tools.forEach((tool) => {
      insertTool.run(
        tool.id,
        tool.id,
        tool.name,
        tool.domain,
        tool.officialUrl,
        tool.officialUrl,
        tool.logoUrl || "",
        tool.category,
        tool.categorySortOrder ?? 1000,
        tool.summary,
        tool.description,
        tool.price,
        tool.language,
        tool.login,
        tool.region,
        tool.updated,
        tool.score,
        tool.popular,
        "verified",
        tool.updated,
        tool.updated,
        tool.sponsored ? 1 : 0
      );
      tool.platforms.forEach((platform, index) => insertPlatform.run(tool.id, platform, index));
      tool.features.forEach((feature, index) => insertFeature.run(tool.id, feature, index));
      tool.useCases.forEach((useCase, index) => insertUseCase.run(tool.id, useCase, index));
      tool.badges.forEach((badge, index) => insertBadge.run(tool.id, badge, index));
    });

    const insertArticle = db.prepare(`
      INSERT INTO articles (
        id, slug, kind, topic, title, excerpt, cover_url, body_text,
        published_date, read_time, source_name, source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const articleGroups = [
      ["tutorial", seedData.tutorials],
      ["news", seedData.newsItems]
    ];
    articleGroups.forEach(([kind, articles]) => {
      articles.forEach((article) => {
        insertArticle.run(
          article.id,
          article.id,
          kind,
          article.type,
          article.title,
          article.excerpt,
          article.image,
          article.body || article.excerpt,
          article.date,
          article.readTime,
          article.source || "",
          article.sourceUrl || ""
        );
      });
    });

    const insertCollection = db.prepare(`
      INSERT INTO collections (id, title, description, icon, accent, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertCollectionTool = db.prepare(`
      INSERT INTO collection_tools (collection_id, tool_id, position)
      VALUES (?, ?, ?)
    `);
    seedData.collections.forEach((collection, index) => {
      const id = `collection-${index + 1}`;
      insertCollection.run(id, collection.title, collection.description, collection.icon, collection.accent, index);
      collection.toolIds.forEach((toolId, position) => insertCollectionTool.run(id, toolId, position));
    });

    return { seeded: true, tools: seedData.tools.length };
  });
}

const curatedToolIds = new Set([
  "orange-dream-factory",
  "tencent-yuanbao",
  "manus",
  "hailuo-ai",
  "vidu",
  "recraft",
  "napkin-ai",
  "devin"
]);

const retiredToolIds = ["wawawriter"];
const retiredNewsIds = [
  "news-agent-workspace",
  "news-video-model",
  "news-coding-agent",
  "news-search"
];

export function syncCuratedContent(db, seedData) {
  const curatedTools = seedData.tools.filter((tool) => curatedToolIds.has(tool.id));
  const curatedNews = seedData.newsItems;

  return runTransaction(db, () => {
    const upsertTool = db.prepare(`
      INSERT INTO tools (
        id, slug, name, domain, official_url, canonical_url, logo_url, category_id, category_sort_order, summary, description,
        pricing_type, language, login_requirement, region, content_updated_date,
        editor_score, popularity, data_quality_status, first_published_at,
        last_verified_at, is_sponsored, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        name = excluded.name,
        domain = excluded.domain,
        official_url = excluded.official_url,
        canonical_url = excluded.canonical_url,
        logo_url = CASE WHEN excluded.logo_url <> '' THEN excluded.logo_url ELSE tools.logo_url END,
        category_id = excluded.category_id,
        category_sort_order = excluded.category_sort_order,
        summary = excluded.summary,
        description = excluded.description,
        pricing_type = excluded.pricing_type,
        language = excluded.language,
        login_requirement = excluded.login_requirement,
        region = excluded.region,
        content_updated_date = excluded.content_updated_date,
        editor_score = excluded.editor_score,
        popularity = excluded.popularity,
        data_quality_status = excluded.data_quality_status,
        first_published_at = COALESCE(tools.first_published_at, excluded.first_published_at),
        last_verified_at = excluded.last_verified_at,
        is_sponsored = excluded.is_sponsored,
        status = 'published',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `);
    const relationTables = [
      ["tool_platforms", "platform", "platforms"],
      ["tool_features", "feature", "features"],
      ["tool_use_cases", "use_case", "useCases"],
      ["tool_badges", "badge", "badges"]
    ];

    curatedTools.forEach((tool) => {
      if (db.prepare("SELECT cms_managed_at FROM tools WHERE id = ?").get(tool.id)?.cms_managed_at) return;
      upsertTool.run(
        tool.id,
        tool.id,
        tool.name,
        tool.domain,
        tool.officialUrl,
        tool.officialUrl,
        tool.logoUrl || "",
        tool.category,
        tool.categorySortOrder ?? 1000,
        tool.summary,
        tool.description,
        tool.price,
        tool.language,
        tool.login,
        tool.region,
        tool.updated,
        tool.score,
        tool.popular,
        "verified",
        tool.updated,
        tool.updated,
        tool.sponsored ? 1 : 0
      );
      relationTables.forEach(([table, column, property]) => {
        db.prepare(`DELETE FROM ${table} WHERE tool_id = ?`).run(tool.id);
        const insert = db.prepare(`INSERT INTO ${table} (tool_id, ${column}, position) VALUES (?, ?, ?)`);
        tool[property].forEach((value, position) => insert.run(tool.id, value, position));
      });
    });

    const archiveTool = db.prepare("UPDATE tools SET status = 'archived', is_sponsored = 0 WHERE id = ? AND cms_managed_at IS NULL");
    retiredToolIds.forEach((id) => archiveTool.run(id));

    const upsertArticle = db.prepare(`
      INSERT INTO articles (
        id, slug, kind, topic, title, excerpt, cover_url, body_text,
        published_date, read_time, source_name, source_url, status
      ) VALUES (?, ?, 'news', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        kind = 'news',
        topic = excluded.topic,
        title = excluded.title,
        excerpt = excluded.excerpt,
        cover_url = excluded.cover_url,
        body_text = excluded.body_text,
        published_date = excluded.published_date,
        read_time = excluded.read_time,
        source_name = excluded.source_name,
        source_url = excluded.source_url,
        status = 'published',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `);
    curatedNews.forEach((article) => {
      if (db.prepare("SELECT cms_managed_at FROM articles WHERE id = ?").get(article.id)?.cms_managed_at) return;
      upsertArticle.run(
        article.id,
        article.id,
        article.type,
        article.title,
        article.excerpt,
        article.image,
        article.body || article.excerpt,
        article.date,
        article.readTime,
        article.source || "",
        article.sourceUrl || ""
      );
    });

    const archiveArticle = db.prepare("UPDATE articles SET status = 'archived' WHERE id = ? AND kind = 'news' AND cms_managed_at IS NULL");
    retiredNewsIds.forEach((id) => archiveArticle.run(id));

    return {
      tools: curatedTools.length,
      newsItems: curatedNews.length,
      retiredTools: retiredToolIds.length,
      retiredNewsItems: retiredNewsIds.length
    };
  });
}

function hydrateTool(db, row, placement = "detail_drawer") {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    domain: row.domain,
    logoUrl: row.logo_url || "",
    officialUrl: `/r/tools/${encodeURIComponent(row.id)}?placement=${encodeURIComponent(placement)}`,
    category: row.category_id,
    summary: row.summary,
    description: row.description,
    price: row.pricing_type,
    platforms: rowsToStrings(
      db.prepare("SELECT platform FROM tool_platforms WHERE tool_id = ? ORDER BY position").all(row.id),
      "platform"
    ),
    language: row.language,
    features: rowsToStrings(
      db.prepare("SELECT feature FROM tool_features WHERE tool_id = ? ORDER BY position").all(row.id),
      "feature"
    ),
    useCases: rowsToStrings(
      db.prepare("SELECT use_case FROM tool_use_cases WHERE tool_id = ? ORDER BY position").all(row.id),
      "use_case"
    ),
    login: row.login_requirement,
    region: row.region,
    updated: row.content_updated_date,
    score: row.editor_score,
    popular: row.popularity,
    quality: row.data_quality_status || "basic",
    badges: rowsToStrings(
      db.prepare("SELECT badge FROM tool_badges WHERE tool_id = ? ORDER BY position").all(row.id),
      "badge"
    ),
    sponsored: Boolean(row.is_sponsored)
  };
}

export function syncSeedToolLogos(db, seedData) {
  const updateLogo = db.prepare(`
    UPDATE tools
    SET logo_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND status <> 'archived' AND cms_managed_at IS NULL
  `);
  let updated = 0;
  runTransaction(db, () => {
    seedData.tools.forEach((tool) => {
      const logoUrl = String(tool.logoUrl || "").trim();
      if (!/^\/assets\/tool-logos\/[a-z0-9-]+\.(?:png|jpe?g|webp|ico|svg|gif|avif)$/.test(logoUrl)) return;
      updated += Number(updateLogo.run(logoUrl, tool.id).changes || 0);
    });
  });
  return { updated };
}

export function getCategories(db) {
  return db.prepare(`
    SELECT c.id, c.name, c.icon, COUNT(t.id) AS tool_count
    FROM categories c
    LEFT JOIN tools t ON t.category_id = c.id AND t.status = 'published'
    WHERE c.status = 'published'
    GROUP BY c.id
    ORDER BY c.sort_order, c.name
  `).all().map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    toolCount: row.id === "all"
      ? Number(db.prepare("SELECT COUNT(*) AS count FROM tools WHERE status = 'published' AND is_sponsored = 0").get().count)
      : Number(row.tool_count)
  }));
}

export function listTools(db, filters = {}) {
  const where = ["t.status = 'published'"];
  const params = [];

  if (filters.q) {
    where.push(`(
      t.name LIKE ? ESCAPE '\\'
      OR t.summary LIKE ? ESCAPE '\\'
      OR t.description LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM categories c WHERE c.id = t.category_id AND c.name LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM tool_features tf WHERE tf.tool_id = t.id AND tf.feature LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM tool_use_cases tuc WHERE tuc.tool_id = t.id AND tuc.use_case LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM tool_badges tb WHERE tb.tool_id = t.id AND tb.badge LIKE ? ESCAPE '\\')
    )`);
    const escaped = String(filters.q).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const like = `%${escaped}%`;
    params.push(like, like, like, like, like, like, like);
  }
  if (filters.category && filters.category !== "all") {
    where.push("t.category_id = ?");
    params.push(filters.category);
  }
  if (filters.price && filters.price !== "all") {
    where.push("t.pricing_type = ?");
    params.push(filters.price);
  }
  if (filters.language && filters.language !== "all") {
    where.push("t.language = ?");
    params.push(filters.language);
  }
  if (filters.platform && filters.platform !== "all") {
    where.push("EXISTS (SELECT 1 FROM tool_platforms tp WHERE tp.tool_id = t.id AND tp.platform = ?)");
    params.push(filters.platform);
  }
  if (filters.sponsored === false) where.push("t.is_sponsored = 0");
  if (filters.sponsored === true) where.push("t.is_sponsored = 1");

  const selectedOrder = {
    popular: "t.popularity DESC, t.editor_score DESC, t.name ASC, t.id ASC",
    latest: "t.content_updated_date DESC, t.editor_score DESC, t.name ASC, t.id ASC",
    name: "t.name COLLATE NOCASE ASC, t.id ASC",
    recommended: "t.editor_score DESC, t.popularity DESC, t.name ASC, t.id ASC"
  }[filters.sort] || "t.editor_score DESC, t.popularity DESC, t.name ASC, t.id ASC";
  const orderBy = filters.category && filters.category !== "all"
    ? `t.category_sort_order ASC, ${selectedOrder}`
    : selectedOrder;

  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const whereSql = where.join(" AND ");
  const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM tools t WHERE ${whereSql}`).get(...params).count);
  const rows = db.prepare(`
    SELECT t.* FROM tools t
    WHERE ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return {
    items: rows.map((row) => hydrateTool(db, row)),
    total,
    limit,
    offset
  };
}

export function listSitemapTools(db) {
  return db.prepare(`
    SELECT id, slug, content_updated_date AS updated
    FROM tools
    WHERE status = 'published'
    ORDER BY name COLLATE NOCASE ASC, id ASC
  `).all().map((row) => ({
    id: row.id,
    slug: row.slug,
    updated: row.updated
  }));
}

export function getTool(db, idOrSlug) {
  const row = db.prepare(`
    SELECT * FROM tools
    WHERE (id = ? OR slug = ?) AND status = 'published'
    LIMIT 1
  `).get(idOrSlug, idOrSlug);
  return hydrateTool(db, row);
}

function hydrateArticle(row) {
  return row ? {
    id: row.id,
    slug: row.slug,
    type: row.topic,
    kind: row.kind,
    title: row.title,
    excerpt: row.excerpt,
    image: row.cover_url,
    body: row.body_text,
    date: row.published_date,
    readTime: row.read_time,
    source: row.source_name,
    sourceUrl: row.source_url
  } : null;
}

export function listArticles(db, kind) {
  const rows = kind
    ? db.prepare("SELECT * FROM articles WHERE status = 'published' AND kind = ? ORDER BY published_date DESC").all(kind)
    : db.prepare("SELECT * FROM articles WHERE status = 'published' ORDER BY published_date DESC").all();
  return rows.map(hydrateArticle);
}

export function getArticle(db, idOrSlug) {
  return hydrateArticle(db.prepare(`
    SELECT * FROM articles
    WHERE (id = ? OR slug = ?) AND status = 'published'
    LIMIT 1
  `).get(idOrSlug, idOrSlug));
}

export function getCollections(db) {
  return db.prepare("SELECT * FROM collections WHERE status = 'published' ORDER BY sort_order").all().map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    accent: row.accent,
    toolIds: rowsToStrings(
      db.prepare(`
        SELECT ct.tool_id
        FROM collection_tools ct
        JOIN tools t ON t.id = ct.tool_id AND t.status = 'published'
        WHERE ct.collection_id = ?
        ORDER BY ct.position
      `).all(row.id),
      "tool_id"
    )
  }));
}

export function getBootstrap(db) {
  return {
    categories: getCategories(db),
    sponsor: listTools(db, { sponsored: true, limit: 1 }).items[0] || null,
    tutorials: listArticles(db, "tutorial"),
    newsItems: listArticles(db, "news"),
    collections: getCollections(db)
  };
}

export function getGrowthSnapshot(db) {
  const rankedTools = (days) => db.prepare(`
    SELECT tools.id, COUNT(outbound_clicks.id) AS clicks
    FROM tools LEFT JOIN outbound_clicks ON outbound_clicks.tool_id = tools.id
      AND outbound_clicks.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
    WHERE tools.status = 'published' AND tools.is_sponsored = 0
    GROUP BY tools.id ORDER BY clicks DESC, tools.popularity DESC, tools.editor_score DESC LIMIT 6
  `).all(`-${days} days`).map((row) => getTool(db, row.id)).filter(Boolean);
  const weeklyNew = db.prepare(`SELECT id FROM tools WHERE status = 'published' AND is_sponsored = 0
    AND content_updated_date >= date('now', '-6 days') ORDER BY content_updated_date DESC, updated_at DESC LIMIT 12`).all()
    .map((row) => getTool(db, row.id)).filter(Boolean);
  const categoryRanking = db.prepare(`
    SELECT categories.id, categories.name, COUNT(outbound_clicks.id) AS clicks,
      COUNT(DISTINCT tools.id) AS tool_count
    FROM categories JOIN tools ON tools.category_id = categories.id AND tools.status = 'published'
    LEFT JOIN outbound_clicks ON outbound_clicks.tool_id = tools.id
      AND outbound_clicks.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
    WHERE categories.status = 'published' AND categories.id <> 'all'
    GROUP BY categories.id ORDER BY clicks DESC, tool_count DESC, categories.sort_order ASC LIMIT 10
  `).all().map((row) => ({ id: row.id, name: row.name, clicks: Number(row.clicks), toolCount: Number(row.tool_count) }));
  return { weeklyNew, weeklyPopular: rankedTools(7), monthlyPopular: rankedTools(30), categoryRanking };
}

export function createSubmission(db, input, userId = null) {
  const id = randomUUID();
  const lookupToken = input.idempotencyKey || `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
  const trackingCode = `NK-${Date.now().toString(36).toUpperCase()}-${id.slice(0, 6).toUpperCase()}`;
  db.prepare(`
    INSERT INTO tool_submissions (
      id, tracking_code, idempotency_key, name, website_url, normalized_url,
      category_id, summary, contact_email, source, lookup_token_hash, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    trackingCode,
    input.idempotencyKey || null,
    input.name,
    input.websiteUrl,
    input.normalizedUrl,
    input.categoryId,
    input.summary,
    input.contactEmail,
    input.source,
    hashToken(lookupToken),
    userId
  );
  return { id, trackingCode, lookupToken, status: "pending" };
}

export function findSubmissionByIdempotencyKey(db, key, input) {
  if (!key) return null;
  const row = db.prepare(`
    SELECT id, tracking_code, status, name, normalized_url, category_id, summary, contact_email, source
    FROM tool_submissions WHERE idempotency_key = ?
  `).get(key);
  if (!row) return null;
  const samePayload = !input || (
    row.name === input.name
    && row.normalized_url === input.normalizedUrl
    && row.category_id === input.categoryId
    && row.summary === input.summary
    && row.contact_email === input.contactEmail
    && row.source === input.source
  );
  return { id: row.id, trackingCode: row.tracking_code, lookupToken: key, status: row.status, samePayload };
}

export function getSubmissionStatus(db, trackingCode, lookupToken) {
  const row = db.prepare(`
    SELECT tracking_code, status, review_note, submitted_at, reviewed_at
    FROM tool_submissions
    WHERE tracking_code = ? AND lookup_token_hash = ?
  `).get(trackingCode, hashToken(lookupToken));
  return row ? {
    trackingCode: row.tracking_code,
    status: row.status,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at
  } : null;
}

export function upsertNewsletterSubscription(db, input, userId = null) {
  const existing = db.prepare("SELECT id, status FROM newsletter_subscriptions WHERE normalized_email = ?").get(input.normalizedEmail);
  if (existing) {
    if (existing.status !== "active") {
      return { id: existing.id, status: existing.status, existing: true, reactivationRequired: true };
    }
    const unsubscribeToken = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
    db.prepare(`
      UPDATE newsletter_subscriptions
      SET email = ?, topic_slugs_json = ?, consent_version = ?, source = ?,
          consent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), unsubscribe_token_hash = ?,
          user_id = COALESCE(?, user_id)
      WHERE id = ?
    `).run(input.email, JSON.stringify(input.topicSlugs), input.consentVersion, input.source, hashToken(unsubscribeToken), userId, existing.id);
    return { id: existing.id, status: "active", existing: true, unsubscribeToken };
  }
  const id = randomUUID();
  const unsubscribeToken = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
  db.prepare(`
    INSERT INTO newsletter_subscriptions (
      id, email, normalized_email, status, topic_slugs_json, consent_version, source, unsubscribe_token_hash, user_id
    ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `).run(id, input.email, input.normalizedEmail, JSON.stringify(input.topicSlugs), input.consentVersion, input.source, hashToken(unsubscribeToken), userId);
  return { id, status: "active", existing: false, unsubscribeToken };
}

export function unsubscribeNewsletter(db, token) {
  const result = db.prepare(`
    UPDATE newsletter_subscriptions
    SET status = 'unsubscribed', unsubscribed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE unsubscribe_token_hash = ? AND status = 'active'
  `).run(hashToken(token));
  return Number(result.changes) === 1;
}

export function createFeedback(db, input, userId = null) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO feedback_messages (id, user_id, category, message, contact_email, page_url, consent_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, input.category, input.message, input.contactEmail || null, input.pageUrl, input.consentVersion);
  return { id, status: "pending", submittedAt: new Date().toISOString() };
}

export function listFeedback(db, status = "all") {
  const allowed = new Set(["all", "pending", "reviewed", "resolved", "replied", "archived"]);
  const filter = allowed.has(status) ? status : "all";
  const rows = filter === "all"
    ? db.prepare("SELECT * FROM feedback_messages ORDER BY submitted_at DESC LIMIT 500").all()
    : db.prepare("SELECT * FROM feedback_messages WHERE status = ? ORDER BY submitted_at DESC LIMIT 500").all(filter);
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    message: row.message,
    contactEmail: row.contact_email || "",
    pageUrl: row.page_url || "",
    status: row.status,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at
  }));
}

export function updateFeedbackStatus(db, id, status) {
  if (!["pending", "reviewed", "resolved", "replied", "archived"].includes(status)) return null;
  const result = db.prepare("UPDATE feedback_messages SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(status, id);
  if (!result.changes) return null;
  return listFeedback(db, "all").find((item) => item.id === id) || null;
}

export function insertEvents(db, events, context) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO analytics_events (
      event_id, event_name, visitor_id, session_id, page_type, path,
      properties_json, client_time, ip_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let accepted = 0;
  runTransaction(db, () => {
    events.forEach((event) => {
      const result = insert.run(
        event.eventId,
        event.eventName,
        context.visitorId,
        context.sessionId,
        event.pageType,
        event.path,
        JSON.stringify(event.properties),
        event.clientTime,
        context.ipHash
      );
      accepted += Number(result.changes);
    });
    const pageViewTimes = events
      .filter((event) => event.eventName === "page_view")
      .map((event) => event.clientTime)
      .sort();
    if (pageViewTimes.length) {
      db.prepare(`
        INSERT INTO analytics_visitors (visitor_id, first_seen_at, last_seen_at)
        VALUES (?, ?, ?)
        ON CONFLICT(visitor_id) DO UPDATE SET
          first_seen_at = MIN(first_seen_at, excluded.first_seen_at),
          last_seen_at = MAX(last_seen_at, excluded.last_seen_at)
      `).run(context.visitorId, pageViewTimes[0], pageViewTimes.at(-1));
    }
  });
  return { accepted, duplicate: events.length - accepted };
}

export function recordOutboundClick(db, input) {
  const duplicate = db.prepare(`
    SELECT 1 FROM outbound_clicks
    WHERE tool_id = ? AND placement = ? AND session_id = ?
      AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 seconds')
    LIMIT 1
  `).get(input.toolId, input.placement, input.sessionId);
  if (duplicate) return false;
  db.prepare(`
    INSERT INTO outbound_clicks (id, tool_id, placement, session_id, ip_hash, user_agent_family)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), input.toolId, input.placement, input.sessionId, input.ipHash, input.userAgentFamily);
  return true;
}

export function pruneOperationalData(db, eventDays = 90, clickDays = 90) {
  const events = db.prepare(`
    DELETE FROM analytics_events
    WHERE received_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
  `).run(`-${Math.max(Number(eventDays) || 90, 1)} days`);
  const clicks = db.prepare(`
    DELETE FROM outbound_clicks
    WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
  `).run(`-${Math.max(Number(clickDays) || 90, 1)} days`);
  const sessions = db.prepare("DELETE FROM auth_sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").run();
  return { events: Number(events.changes), clicks: Number(clicks.changes), sessions: Number(sessions.changes) };
}

export function getAdminSummary(db) {
  const scalar = (sql) => Number(db.prepare(sql).get().count);
  return {
    tools: scalar("SELECT COUNT(*) AS count FROM tools WHERE status = 'published'"),
    articles: scalar("SELECT COUNT(*) AS count FROM articles WHERE status = 'published'"),
    pendingSubmissions: scalar("SELECT COUNT(*) AS count FROM tool_submissions WHERE status = 'pending'"),
    pendingFeedback: scalar("SELECT COUNT(*) AS count FROM feedback_messages WHERE status = 'pending'"),
    activeSubscribers: scalar("SELECT COUNT(*) AS count FROM newsletter_subscriptions WHERE status = 'active'"),
    events: scalar("SELECT COUNT(*) AS count FROM analytics_events"),
    outboundClicks: scalar("SELECT COUNT(*) AS count FROM outbound_clicks")
  };
}

export function listUserFavorites(db, userId) {
  return db.prepare("SELECT tool_id AS toolId FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC").all(userId).map((row) => row.toolId);
}

export function getAccountSummary(db, userId) {
  return {
    favorites: Number(db.prepare("SELECT COUNT(*) AS count FROM user_favorites WHERE user_id = ?").get(userId).count),
    ratings: Number(db.prepare("SELECT COUNT(*) AS count FROM tool_ratings WHERE user_id = ?").get(userId).count),
    feedback: Number(db.prepare("SELECT COUNT(*) AS count FROM feedback_messages WHERE user_id = ? OR (user_id IS NULL AND contact_email = (SELECT email FROM users WHERE id = ?))").get(userId, userId).count),
    submissions: Number(db.prepare("SELECT COUNT(*) AS count FROM tool_submissions WHERE user_id = ? OR (user_id IS NULL AND contact_email = (SELECT email FROM users WHERE id = ?))").get(userId, userId).count),
    history: Number(db.prepare("SELECT COUNT(*) AS count FROM user_tool_history WHERE user_id = ?").get(userId).count),
    newsletter: Boolean(db.prepare("SELECT 1 FROM newsletter_subscriptions WHERE user_id = ? AND status = 'active' LIMIT 1").get(userId))
  };
}

function accountToolSelect(db, sql, userId) {
  return db.prepare(sql).all(userId).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category_id,
    logoUrl: row.logo_url || "",
    summary: row.summary,
    updated: row.content_updated_date,
    viewedAt: row.viewed_at || null,
    rating: row.rating === undefined ? null : Number(row.rating)
  }));
}

export function getAccountActivity(db, userId) {
  const email = db.prepare("SELECT email FROM users WHERE id = ?").get(userId)?.email || "";
  return {
    favorites: accountToolSelect(db, `SELECT tools.id, tools.name, tools.slug, tools.category_id, tools.logo_url, tools.summary, tools.content_updated_date
      FROM user_favorites JOIN tools ON tools.id = user_favorites.tool_id
      WHERE user_favorites.user_id = ? AND tools.status = 'published' ORDER BY user_favorites.created_at DESC LIMIT 100`, userId),
    ratings: accountToolSelect(db, `SELECT tools.id, tools.name, tools.slug, tools.category_id, tools.logo_url, tools.summary, tools.content_updated_date, tool_ratings.rating
      FROM tool_ratings JOIN tools ON tools.id = tool_ratings.tool_id
      WHERE tool_ratings.user_id = ? AND tools.status = 'published' ORDER BY tool_ratings.updated_at DESC LIMIT 100`, userId),
    history: accountToolSelect(db, `SELECT tools.id, tools.name, tools.slug, tools.category_id, tools.logo_url, tools.summary, tools.content_updated_date, user_tool_history.viewed_at
      FROM user_tool_history JOIN tools ON tools.id = user_tool_history.tool_id
      WHERE user_tool_history.user_id = ? AND tools.status = 'published' ORDER BY user_tool_history.viewed_at DESC LIMIT 100`, userId),
    feedback: db.prepare(`SELECT id, category, message, page_url AS pageUrl, status, submitted_at AS submittedAt, updated_at AS updatedAt
      FROM feedback_messages WHERE user_id = ? OR (user_id IS NULL AND contact_email = ?) ORDER BY submitted_at DESC LIMIT 100`).all(userId, email),
    submissions: db.prepare(`SELECT id, tracking_code AS trackingCode, name, website_url AS websiteUrl, category_id AS categoryId, summary, status, submitted_at AS submittedAt, reviewed_at AS reviewedAt
      FROM tool_submissions WHERE user_id = ? OR (user_id IS NULL AND contact_email = ?) ORDER BY submitted_at DESC LIMIT 100`).all(userId, email),
    newsletter: db.prepare("SELECT status, topic_slugs_json AS topics, consent_at AS subscribedAt, updated_at AS updatedAt FROM newsletter_subscriptions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(userId) || null,
    notifications: db.prepare("SELECT weekly_digest AS weeklyDigest, new_tool_alerts AS newToolAlerts, favorite_update_alerts AS favoriteUpdateAlerts FROM user_notification_preferences WHERE user_id = ?").get(userId) || { weeklyDigest: 1, newToolAlerts: 1, favoriteUpdateAlerts: 1 }
  };
}

export function updateNotificationPreferences(db, userId, input) {
  const values = [input.weeklyDigest, input.newToolAlerts, input.favoriteUpdateAlerts].map((value) => value ? 1 : 0);
  db.prepare(`INSERT INTO user_notification_preferences (user_id, weekly_digest, new_tool_alerts, favorite_update_alerts)
    VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET weekly_digest = excluded.weekly_digest,
      new_tool_alerts = excluded.new_tool_alerts, favorite_update_alerts = excluded.favorite_update_alerts,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).run(userId, ...values);
  return { weeklyDigest: Boolean(values[0]), newToolAlerts: Boolean(values[1]), favoriteUpdateAlerts: Boolean(values[2]) };
}

export function recordUserToolHistory(db, userId, toolId) {
  db.prepare(`INSERT INTO user_tool_history (user_id, tool_id, viewed_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(user_id, tool_id) DO UPDATE SET viewed_at = excluded.viewed_at`).run(userId, toolId);
}

export function clearUserToolHistory(db, userId) {
  return Number(db.prepare("DELETE FROM user_tool_history WHERE user_id = ?").run(userId).changes);
}

export function unsubscribeAccountNewsletter(db, userId) {
  return Number(db.prepare(`UPDATE newsletter_subscriptions
    SET status = 'unsubscribed', unsubscribed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE user_id = ? AND status = 'active'`).run(userId).changes) > 0;
}

export function deleteUserAccount(db, userId) {
  const result = db.prepare("DELETE FROM users WHERE id = ? AND is_super_admin = 0").run(userId);
  return Number(result.changes) === 1;
}

export function addUserFavorite(db, userId, toolId) {
  const tool = db.prepare("SELECT id FROM tools WHERE id = ? AND status = 'published'").get(toolId);
  if (!tool) return false;
  db.prepare("INSERT OR IGNORE INTO user_favorites (user_id, tool_id) VALUES (?, ?)").run(userId, toolId);
  return true;
}

export function removeUserFavorite(db, userId, toolId) {
  return Number(db.prepare("DELETE FROM user_favorites WHERE user_id = ? AND tool_id = ?").run(userId, toolId).changes) > 0;
}

export function getToolRatings(db, toolId, userId = "") {
  const rows = db.prepare(`
    SELECT rating, COUNT(*) AS count
    FROM tool_ratings
    WHERE tool_id = ?
    GROUP BY rating
    ORDER BY rating DESC
  `).all(toolId);
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((rating) => [rating, 0]));
  let count = 0;
  let total = 0;
  rows.forEach((row) => {
    const rowCount = Number(row.count);
    distribution[Number(row.rating)] = rowCount;
    count += rowCount;
    total += Number(row.rating) * rowCount;
  });
  const userRating = userId
    ? db.prepare("SELECT rating FROM tool_ratings WHERE user_id = ? AND tool_id = ?").get(userId, toolId)?.rating || null
    : null;
  return {
    average: count ? Math.round((total / count) * 10) / 10 : null,
    count,
    distribution,
    userRating: userRating ? Number(userRating) : null
  };
}

export function setToolRating(db, userId, toolId, rating) {
  db.prepare(`
    INSERT INTO tool_ratings (user_id, tool_id, rating)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, tool_id) DO UPDATE SET
      rating = excluded.rating,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).run(userId, toolId, rating);
  return getToolRatings(db, toolId, userId);
}

export function removeToolRating(db, userId, toolId) {
  db.prepare("DELETE FROM tool_ratings WHERE user_id = ? AND tool_id = ?").run(userId, toolId);
  return getToolRatings(db, toolId, userId);
}

export function listSubmissions(db, status = "pending") {
  return db.prepare(`
    SELECT id, tracking_code, name, website_url, category_id, summary, contact_email,
           status, source, review_note, submitted_at, reviewed_at
    FROM tool_submissions
    WHERE status = ?
    ORDER BY submitted_at DESC
    LIMIT 100
  `).all(status).map((row) => ({
    id: row.id,
    trackingCode: row.tracking_code,
    name: row.name,
    websiteUrl: row.website_url,
    categoryId: row.category_id,
    summary: row.summary,
    contactEmail: row.contact_email,
    status: row.status,
    source: row.source,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at
  }));
}

export function reviewSubmission(db, input) {
  return runTransaction(db, () => {
    const before = db.prepare("SELECT * FROM tool_submissions WHERE id = ?").get(input.id);
    if (!before) return null;
    if (before.status !== "pending") return { conflict: true, currentStatus: before.status };
    const updated = db.prepare(`
      UPDATE tool_submissions
      SET status = ?, review_note = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND status = 'pending'
    `).run(input.status, input.reviewNote, input.id);
    if (Number(updated.changes) !== 1) return { conflict: true, currentStatus: "changed" };
    const after = db.prepare("SELECT * FROM tool_submissions WHERE id = ?").get(input.id);
    db.prepare(`
      INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, before_json, after_json, request_id)
      VALUES (?, ?, 'review_submission', 'tool_submission', ?, ?, ?, ?)
    `).run(randomUUID(), input.actor, input.id, JSON.stringify(before), JSON.stringify(after), input.requestId);
    return { id: input.id, status: input.status, reviewNote: input.reviewNote };
  });
}
