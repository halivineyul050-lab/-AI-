import { normalizeNewsSourceHost } from "./article-source-links.mjs";

const WINDOW_MS = 48 * 60 * 60_000;
const HALF_LIFE_HOURS = 24;
const TREND_WINDOW_MS = 6 * 60 * 60_000;

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function heatAt(sourceRows, at) {
  const hosts = new Map();
  for (const row of sourceRows) {
    const host = normalizeNewsSourceHost(row.sourceUrl ?? row.source_url);
    const evidenceAt = timestamp(row.sourcePublishedAt ?? row.source_published_at)
      ?? timestamp(row.discoveredAt ?? row.discovered_at);
    if (!host || evidenceAt === null || evidenceAt > at || at - evidenceAt > WINDOW_MS) continue;
    const previous = hosts.get(host);
    if (!previous || evidenceAt > previous.evidenceAt) {
      hosts.set(host, {
        evidenceAt,
        sourceName: String(row.sourceName ?? row.source_name ?? host).trim() || host
      });
    }
  }
  let score = 0;
  for (const source of hosts.values()) {
    const ageHours = Math.max(0, (at - source.evidenceAt) / 3_600_000);
    score += 2 ** (-ageHours / HALF_LIFE_HOURS);
  }
  return { hosts, score };
}

function articleSummary(article) {
  return {
    id: article.id,
    slug: article.slug || article.id,
    type: article.type ?? article.topic ?? "AI 行业",
    title: article.title || "",
    excerpt: article.excerpt || "",
    image: article.image ?? article.cover_url ?? "",
    date: article.date ?? article.published_date ?? "",
    readTime: article.readTime ?? article.read_time ?? "",
    source: article.source ?? article.source_name ?? "",
    sourceUrl: article.sourceUrl ?? article.source_url ?? ""
  };
}

export function calculateNewsHotRanking(articles, now = Date.now(), limit = 10) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) throw new TypeError("now must be a valid timestamp");
  const safeLimit = Math.max(0, Math.min(10, Math.floor(Number(limit) || 0)));
  const ranked = [];

  for (const article of articles || []) {
    const sourceRows = Array.isArray(article.sources) ? article.sources : [];
    const current = heatAt(sourceRows, nowMs);
    if (current.hosts.size < 2) continue;

    const comparison = heatAt(sourceRows, nowMs - TREND_WINDOW_MS);
    const firstEvidenceAt = timestamp(article.firstSourceAt ?? article.first_source_at)
      ?? sourceRows.reduce((earliest, row) => {
        const evidenceAt = timestamp(row.sourcePublishedAt ?? row.source_published_at)
          ?? timestamp(row.discoveredAt ?? row.discovered_at);
        return evidenceAt === null ? earliest : earliest === null ? evidenceAt : Math.min(earliest, evidenceAt);
      }, null);
    const firstEvidenceByHost = new Map();
    for (const row of sourceRows) {
      const host = normalizeNewsSourceHost(row.sourceUrl ?? row.source_url);
      const evidenceAt = timestamp(row.sourcePublishedAt ?? row.source_published_at)
        ?? timestamp(row.discoveredAt ?? row.discovered_at);
      if (!host || evidenceAt === null || evidenceAt > nowMs) continue;
      const previousFirst = firstEvidenceByHost.get(host);
      if (previousFirst === undefined || evidenceAt < previousFirst) firstEvidenceByHost.set(host, evidenceAt);
    }
    const newlySeenHosts = [...firstEvidenceByHost]
      .filter(([host, firstAt]) => current.hosts.has(host) && firstAt > nowMs - TREND_WINDOW_MS)
      .map(([host]) => host);

    const badges = [];
    if (firstEvidenceAt !== null && firstEvidenceAt > nowMs - TREND_WINDOW_MS && firstEvidenceAt <= nowMs) badges.push("new");
    if (comparison.score > 0 && current.score > comparison.score * 1.15) badges.push("rising");
    if (newlySeenHosts.length >= 3 && newlySeenHosts.length / current.hosts.size >= 0.5) badges.push("surge");

    const currentSources = [...current.hosts.values()].sort((left, right) => right.evidenceAt - left.evidenceAt);
    ranked.push({
      ...articleSummary(article),
      heat: current.score,
      sourceCount: current.hosts.size,
      sourceNames: [...new Set(currentSources.map((source) => source.sourceName))],
      latestSourceAt: new Date(currentSources[0].evidenceAt).toISOString(),
      badges
    });
  }

  ranked.sort((left, right) => right.heat - left.heat
    || Date.parse(right.latestSourceAt) - Date.parse(left.latestSourceAt)
    || (String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0));
  return ranked.slice(0, safeLimit).map(({ heat, ...item }, index) => ({ rank: index + 1, ...item }));
}
