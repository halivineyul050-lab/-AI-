import { createHash } from "node:crypto";
import { HttpError } from "./validation.mjs";

function acceptedSourceUrl(value) {
  const sourceUrl = String(value || "").trim();
  let parsed;
  try { parsed = new URL(sourceUrl); } catch { throw new TypeError("Source URL must be an absolute HTTP(S) URL"); }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new TypeError("Source URL must be an absolute HTTP(S) URL without credentials");
  }
  return sourceUrl;
}

function comparableSourceUrl(value) {
  const parsed = new URL(acceptedSourceUrl(value));
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return parsed.toString();
}

export function sourceUrlHash(sourceUrl) {
  return createHash("sha256").update(acceptedSourceUrl(sourceUrl)).digest("hex");
}

export function normalizeNewsSourceHost(sourceUrl) {
  try {
    const parsed = new URL(acceptedSourceUrl(sourceUrl));
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizedTimestamp(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function sourceRecord(item, discoveredAt) {
  const sourceUrl = acceptedSourceUrl(item?.link ?? item?.sourceUrl);
  const host = normalizeNewsSourceHost(sourceUrl);
  const sourceName = String(item?.sourceName || host || "").trim().slice(0, 512);
  return {
    source_url_hash: sourceUrlHash(sourceUrl),
    source_url: sourceUrl,
    source_name: sourceName,
    feed_url: item?.feedUrl ? acceptedSourceUrl(item.feedUrl) : "",
    source_title: String(item?.title || item?.sourceTitle || "").trim().slice(0, 20_000),
    source_published_at: normalizedTimestamp(item?.publishedAt ?? item?.sourcePublishedAt),
    discovered_at: discoveredAt
  };
}

export function findArticleSourceLink(db, sourceUrl) {
  const link = acceptedSourceUrl(sourceUrl);
  const hash = sourceUrlHash(link);
  const relation = db.prepare(`
    SELECT article_id, source_url FROM article_source_links WHERE source_url_hash = ?
  `).get(hash);
  if (relation) return { articleId: relation.article_id, sourceUrl: relation.source_url, legacy: false };
  const legacy = db.prepare(`
    SELECT id FROM articles WHERE source_url = ? AND source_url <> '' LIMIT 1
  `).get(link);
  const normalizedLegacy = legacy || db.prepare(`
    SELECT id FROM articles WHERE source_url = ? AND source_url <> '' LIMIT 1
  `).get(comparableSourceUrl(link));
  return normalizedLegacy ? { articleId: normalizedLegacy.id, sourceUrl: link, legacy: true } : null;
}

export function insertArticleSourceLinks(db, articleId, sourceItems, discoveredAt = new Date().toISOString()) {
  const normalizedDiscoveredAt = normalizedTimestamp(discoveredAt);
  if (!normalizedDiscoveredAt) throw new TypeError("discoveredAt must be a valid timestamp");
  const records = [...new Map((sourceItems || []).map((item) => {
    const record = sourceRecord(item, normalizedDiscoveredAt);
    return [record.source_url_hash, record];
  })).values()];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO article_source_links (
      source_url_hash, article_id, source_url, source_name, feed_url, source_title,
      source_published_at, discovered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const findOwner = db.prepare(`
    SELECT article_id, source_url FROM article_source_links WHERE source_url_hash = ?
  `);
  let inserted = 0;
  for (const record of records) {
    inserted += Number(insert.run(
      record.source_url_hash,
      articleId,
      record.source_url,
      record.source_name,
      record.feed_url,
      record.source_title,
      record.source_published_at,
      record.discovered_at
    ).changes || 0);
    const existing = findOwner.get(record.source_url_hash);
    if (!existing || existing.article_id !== articleId || existing.source_url !== record.source_url) {
      throw new HttpError(409, "article_source_already_linked", "该来源已关联到另一篇资讯");
    }
  }
  return { inserted, total: records.length };
}

export function hydrateArticleSourceLinks(legacyArticle, relationRows = []) {
  const links = new Map();
  const representedUrls = new Set();
  for (const row of relationRows || []) {
    const sourceUrl = row.source_url ?? row.sourceUrl;
    let hash;
    try { hash = sourceUrlHash(sourceUrl); } catch { continue; }
    const host = normalizeNewsSourceHost(sourceUrl);
    links.set(hash, {
      sourceUrl,
      sourceName: String(row.source_name ?? row.sourceName ?? "").trim() || host || "来源站点",
      sourceTitle: String(row.source_title ?? row.sourceTitle ?? ""),
      sourcePublishedAt: row.source_published_at ?? row.sourcePublishedAt ?? null,
      discoveredAt: row.discovered_at ?? row.discoveredAt ?? null,
      feedUrl: row.feed_url ?? row.feedUrl ?? ""
    });
    try { representedUrls.add(comparableSourceUrl(sourceUrl)); } catch { /* Already excluded above. */ }
  }
  const fallbackUrl = legacyArticle?.source_url ?? legacyArticle?.sourceUrl ?? "";
  if (fallbackUrl) {
    try {
      const hash = sourceUrlHash(fallbackUrl);
      const comparableUrl = comparableSourceUrl(fallbackUrl);
      if (!links.has(hash) && !representedUrls.has(comparableUrl)) {
        const host = normalizeNewsSourceHost(fallbackUrl);
        const publishedDate = legacyArticle.published_date ?? legacyArticle.date ?? "";
        const discoveredAt = publishedDate
          ? `${String(publishedDate).slice(0, 10)}T00:00:00.000Z`
          : legacyArticle.created_at ?? legacyArticle.createdAt ?? null;
        links.set(hash, {
          sourceUrl: fallbackUrl,
          sourceName: String(legacyArticle.source_name ?? legacyArticle.source ?? "").trim() || host || "来源站点",
          sourceTitle: "",
          sourcePublishedAt: null,
          discoveredAt,
          feedUrl: ""
        });
        representedUrls.add(comparableUrl);
      }
    } catch { /* Invalid legacy URLs remain available through the existing scalar fields only. */ }
  }
  return [...links.values()].sort((left, right) => {
    const leftTime = Date.parse(left.sourcePublishedAt || left.discoveredAt || "") || 0;
    const rightTime = Date.parse(right.sourcePublishedAt || right.discoveredAt || "") || 0;
    return rightTime - leftTime || left.sourceUrl.localeCompare(right.sourceUrl);
  });
}

export function listArticleSourceLinks(db, articleId, legacyArticle = null, prefetchedRows = null) {
  const rows = prefetchedRows || db.prepare(`
    SELECT source_url, source_name, source_title, source_published_at, discovered_at, feed_url
    FROM article_source_links WHERE article_id = ?
    ORDER BY COALESCE(source_published_at, discovered_at) DESC, source_url_hash ASC
  `).all(articleId);
  return hydrateArticleSourceLinks(legacyArticle, rows);
}
