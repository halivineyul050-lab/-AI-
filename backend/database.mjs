import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const schemaPath = resolve(import.meta.dirname, "schema.sql");
const migrations = [
  { version: 1, name: "initial_schema", sql: readFileSync(schemaPath, "utf8") },
  { version: 2, name: "lookup_tokens", sql: readFileSync(resolve(import.meta.dirname, "migrations", "002_lookup_tokens.sql"), "utf8") },
  { version: 3, name: "article_sources", sql: readFileSync(resolve(import.meta.dirname, "migrations", "003_article_sources.sql"), "utf8") }
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
      INSERT INTO categories (id, name, icon, sort_order)
      VALUES (?, ?, ?, ?)
    `);
    seedData.categories.forEach((category, index) => {
      insertCategory.run(category.id, category.name, category.icon, index);
    });

    const insertTool = db.prepare(`
      INSERT INTO tools (
        id, slug, name, domain, official_url, category_id, summary, description,
        pricing_type, language, login_requirement, region, content_updated_date,
        editor_score, popularity, is_sponsored
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        tool.category,
        tool.summary,
        tool.description,
        tool.price,
        tool.language,
        tool.login,
        tool.region,
        tool.updated,
        tool.score,
        tool.popular,
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
        id, slug, name, domain, official_url, category_id, summary, description,
        pricing_type, language, login_requirement, region, content_updated_date,
        editor_score, popularity, is_sponsored, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        name = excluded.name,
        domain = excluded.domain,
        official_url = excluded.official_url,
        category_id = excluded.category_id,
        summary = excluded.summary,
        description = excluded.description,
        pricing_type = excluded.pricing_type,
        language = excluded.language,
        login_requirement = excluded.login_requirement,
        region = excluded.region,
        content_updated_date = excluded.content_updated_date,
        editor_score = excluded.editor_score,
        popularity = excluded.popularity,
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
      upsertTool.run(
        tool.id,
        tool.id,
        tool.name,
        tool.domain,
        tool.officialUrl,
        tool.category,
        tool.summary,
        tool.description,
        tool.price,
        tool.language,
        tool.login,
        tool.region,
        tool.updated,
        tool.score,
        tool.popular,
        tool.sponsored ? 1 : 0
      );
      relationTables.forEach(([table, column, property]) => {
        db.prepare(`DELETE FROM ${table} WHERE tool_id = ?`).run(tool.id);
        const insert = db.prepare(`INSERT INTO ${table} (tool_id, ${column}, position) VALUES (?, ?, ?)`);
        tool[property].forEach((value, position) => insert.run(tool.id, value, position));
      });
    });

    const archiveTool = db.prepare("UPDATE tools SET status = 'archived', is_sponsored = 0 WHERE id = ?");
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

    const archiveArticle = db.prepare("UPDATE articles SET status = 'archived' WHERE id = ? AND kind = 'news'");
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
    badges: rowsToStrings(
      db.prepare("SELECT badge FROM tool_badges WHERE tool_id = ? ORDER BY position").all(row.id),
      "badge"
    ),
    sponsored: Boolean(row.is_sponsored)
  };
}

export function getCategories(db) {
  return db.prepare(`
    SELECT c.id, c.name, c.icon, COUNT(t.id) AS tool_count
    FROM categories c
    LEFT JOIN tools t ON t.category_id = c.id AND t.status = 'published' AND t.is_sponsored = 0
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
    where.push("(t.name LIKE ? ESCAPE '\\' OR t.summary LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')");
    const escaped = String(filters.q).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const like = `%${escaped}%`;
    params.push(like, like, like);
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

  const orderBy = {
    popular: "t.popularity DESC, t.editor_score DESC, t.name ASC",
    latest: "t.content_updated_date DESC, t.editor_score DESC, t.name ASC",
    name: "t.name COLLATE NOCASE ASC",
    recommended: "t.is_sponsored ASC, t.editor_score DESC, t.popularity DESC, t.name ASC"
  }[filters.sort] || "t.is_sponsored ASC, t.editor_score DESC, t.popularity DESC, t.name ASC";

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
      db.prepare("SELECT tool_id FROM collection_tools WHERE collection_id = ? ORDER BY position").all(row.id),
      "tool_id"
    )
  }));
}

export function getBootstrap(db) {
  return {
    categories: getCategories(db),
    tools: listTools(db, { limit: 500 }).items,
    tutorials: listArticles(db, "tutorial"),
    newsItems: listArticles(db, "news"),
    collections: getCollections(db)
  };
}

export function createSubmission(db, input) {
  const id = randomUUID();
  const lookupToken = input.idempotencyKey || `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
  const trackingCode = `NK-${Date.now().toString(36).toUpperCase()}-${id.slice(0, 6).toUpperCase()}`;
  db.prepare(`
    INSERT INTO tool_submissions (
      id, tracking_code, idempotency_key, name, website_url, normalized_url,
      category_id, summary, contact_email, source, lookup_token_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    hashToken(lookupToken)
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

export function upsertNewsletterSubscription(db, input) {
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
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), unsubscribe_token_hash = ?
      WHERE id = ?
    `).run(input.email, JSON.stringify(input.topicSlugs), input.consentVersion, input.source, hashToken(unsubscribeToken), existing.id);
    return { id: existing.id, status: "active", existing: true, unsubscribeToken };
  }
  const id = randomUUID();
  const unsubscribeToken = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
  db.prepare(`
    INSERT INTO newsletter_subscriptions (
      id, email, normalized_email, status, topic_slugs_json, consent_version, source, unsubscribe_token_hash
    ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
  `).run(id, input.email, input.normalizedEmail, JSON.stringify(input.topicSlugs), input.consentVersion, input.source, hashToken(unsubscribeToken));
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
  return { events: Number(events.changes), clicks: Number(clicks.changes) };
}

export function getAdminSummary(db) {
  const scalar = (sql) => Number(db.prepare(sql).get().count);
  return {
    tools: scalar("SELECT COUNT(*) AS count FROM tools WHERE status = 'published'"),
    articles: scalar("SELECT COUNT(*) AS count FROM articles WHERE status = 'published'"),
    pendingSubmissions: scalar("SELECT COUNT(*) AS count FROM tool_submissions WHERE status = 'pending'"),
    activeSubscribers: scalar("SELECT COUNT(*) AS count FROM newsletter_subscriptions WHERE status = 'active'"),
    events: scalar("SELECT COUNT(*) AS count FROM analytics_events"),
    outboundClicks: scalar("SELECT COUNT(*) AS count FROM outbound_clicks")
  };
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
