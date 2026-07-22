const ALLOWED_HOURS = new Set([1, 6, 24, 72, 168]);
const DEFAULT_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BEIJING_OFFSET_MS = 8 * HOUR_MS;
const TOP_LIMIT = 10;
const RECENT_LIMIT = 40;
const SUBMISSION_STATUSES = ["pending", "approved", "rejected", "duplicate"];

const sourceLabels = {
  direct: "直接访问",
  search: "搜索引擎",
  wechat: "微信",
  website: "其他网站",
  internal: "站内跳转",
  unknown: "未知来源"
};
const deviceLabels = { desktop: "电脑端", mobile: "移动端", tablet: "平板端", unknown: "未知设备" };

function normalizeHours(value) {
  const hours = Number.parseInt(value, 10);
  return ALLOWED_HOURS.has(hours) ? hours : DEFAULT_HOURS;
}

function normalizeNow(value) {
  const date = value === undefined || value === null ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("now must be a valid date value");
  return date;
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function rate(numerator, denominator) {
  const safeNumerator = Number(numerator) || 0;
  const safeDenominator = Number(denominator) || 0;
  if (safeDenominator <= 0) return 0;
  return Math.round((safeNumerator / safeDenominator) * 10_000) / 100;
}

function decimal(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function changeRate(current, previous) {
  const safePrevious = Number(previous) || 0;
  const safeCurrent = Number(current) || 0;
  if (safePrevious <= 0) return safeCurrent > 0 ? 100 : 0;
  return Math.round(((safeCurrent - safePrevious) / safePrevious) * 10_000) / 100;
}

function safeJsonObject(value) {
  if (typeof value !== "string" || value.length === 0) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function shortenIdentifier(value) {
  if (typeof value !== "string" || value.length === 0) return "—";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-3)}`;
}

function beijingDate(date) {
  return new Date(date.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

function utcForBeijingDate(dateString, dayOffset = 0) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day + dayOffset) - BEIJING_OFFSET_MS);
}

function addDays(dateString, days) {
  const start = utcForBeijingDate(dateString, days);
  return beijingDate(new Date(start.getTime()));
}

function daysBetweenBeijingDates(startDate, endDate) {
  const start = utcForBeijingDate(startDate);
  const end = utcForBeijingDate(endDate);
  if (!start || !end) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
}

function buildWindow(options = {}) {
  const now = normalizeNow(options.now);
  if (options.range || options.startDate || options.endDate) {
    const today = beijingDate(now);
    const range = String(options.range || "7d");
    let startDate;
    let endDate;
    if (range === "today") {
      startDate = today;
      endDate = today;
    } else if (range === "yesterday") {
      startDate = addDays(today, -1);
      endDate = startDate;
    } else if (range === "30d") {
      startDate = addDays(today, -29);
      endDate = today;
    } else if (range === "custom") {
      startDate = String(options.startDate || today);
      endDate = String(options.endDate || startDate);
    } else {
      startDate = addDays(today, -6);
      endDate = today;
    }
    if (!utcForBeijingDate(startDate) || !utcForBeijingDate(endDate)) {
      startDate = addDays(today, -6);
      endDate = today;
    }
    if (utcForBeijingDate(startDate).getTime() > utcForBeijingDate(endDate).getTime()) {
      [startDate, endDate] = [endDate, startDate];
    }
    if (daysBetweenBeijingDates(startDate, endDate) > 365) {
      endDate = addDays(startDate, 364);
    }
    const start = utcForBeijingDate(startDate);
    const endOfEndDate = utcForBeijingDate(endDate, 1);
    const end = endDate === today && range !== "yesterday" ? now : endOfEndDate;
    const durationMs = Math.max(end.getTime() - start.getTime(), HOUR_MS);
    const compareEnd = start;
    const compareStart = new Date(compareEnd.getTime() - durationMs);
    return {
      mode: "date",
      range,
      timezone: "Asia/Shanghai",
      startDate,
      endDate,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      compareStartAt: compareStart.toISOString(),
      compareEndAt: compareEnd.toISOString(),
      granularity: daysBetweenBeijingDates(startDate, endDate) > 62 ? "month" : daysBetweenBeijingDates(startDate, endDate) > 31 ? "week" : "day",
      days: daysBetweenBeijingDates(startDate, endDate)
    };
  }

  const hours = normalizeHours(options.hours);
  const start = new Date(now.getTime() - hours * HOUR_MS);
  const compareStart = new Date(start.getTime() - hours * HOUR_MS);
  return {
    mode: "hours",
    range: `${hours}h`,
    timezone: "Asia/Shanghai",
    hours,
    startAt: start.toISOString(),
    endAt: now.toISOString(),
    compareStartAt: compareStart.toISOString(),
    compareEndAt: start.toISOString(),
    granularity: "hour",
    days: Math.max(1, hours / 24)
  };
}

function makeEntityLabel(row, properties) {
  if (row.tool_name) return row.tool_name;
  const candidate = properties.query
    || properties.tool_name
    || properties.tool_id
    || properties.article_id
    || properties.category_id
    || properties.page_id;
  if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
    return String(candidate).trim().slice(0, 120);
  }
  return row.path || row.page_type || "—";
}

function pageName(path, pageType) {
  if (path === "/" || path === "/#tools") return "首页 / 工具库";
  if (path.startsWith("/tools/")) return `工具详情：${decodeURIComponent(path.split("/").pop() || "")}`;
  if (path.startsWith("/guides/")) return `专题：${decodeURIComponent(path.split("/").pop() || "")}`;
  if (path === "/guides") return "按任务找工具";
  if (path.startsWith("/compare/")) return `对比：${decodeURIComponent(path.split("/").pop() || "")}`;
  if (path === "/compare") return "工具对比页";
  if (path.startsWith("/category/")) return `分类页：${decodeURIComponent(path.split("/").pop() || "")}`;
  return pageType || path || "页面";
}

function baseKpiRow(db, startAt, endAt) {
  const activeStartAt = new Date(new Date(endAt).getTime() - 5 * 60 * 1000).toISOString();
  const analytics = db.prepare(`
    SELECT
      SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN visitor_id END) AS unique_visitors,
      COUNT(DISTINCT CASE WHEN received_at >= ? THEN NULLIF(session_id, '') END) AS active_sessions,
      SUM(CASE WHEN event_name = 'search_submit' THEN 1 ELSE 0 END) AS searches,
      SUM(CASE WHEN event_name = 'tool_card_click' THEN 1 ELSE 0 END) AS tool_card_clicks,
      SUM(CASE WHEN event_name = 'tool_detail_view' THEN 1 ELSE 0 END) AS tool_detail_views,
      SUM(CASE WHEN event_name = 'ad_impression' THEN 1 ELSE 0 END) AS ad_impressions,
      SUM(CASE WHEN event_name = 'ad_click' THEN 1 ELSE 0 END) AS ad_clicks
    FROM analytics_events
    WHERE received_at >= ? AND received_at < ?
  `).get(activeStartAt, startAt, endAt);
  const officialClicks = count(db.prepare(`
    SELECT COUNT(*) AS count FROM outbound_clicks WHERE created_at >= ? AND created_at < ?
  `).get(startAt, endAt).count);
  const noResultSearches = count(db.prepare(`SELECT COUNT(*) AS count FROM analytics_events
    WHERE event_name = 'search_submit' AND received_at >= ? AND received_at < ?
      AND json_valid(properties_json) AND CAST(json_extract(properties_json, '$.result_count') AS INTEGER) = 0`).get(startAt, endAt).count);
  return {
    pageViews: count(analytics.page_views),
    uniqueVisitors: count(analytics.unique_visitors),
    activeSessions: count(analytics.active_sessions),
    searches: count(analytics.searches),
    noResultSearches,
    toolCardClicks: count(analytics.tool_card_clicks),
    toolDetailViews: count(analytics.tool_detail_views),
    officialClicks,
    adImpressions: count(analytics.ad_impressions),
    adClicks: count(analytics.ad_clicks)
  };
}

function getKpis(db, window) {
  const current = baseKpiRow(db, window.startAt, window.endAt);
  const previous = baseKpiRow(db, window.compareStartAt, window.compareEndAt);
  const recentEvents = count(db.prepare(`
    SELECT COUNT(*) AS count FROM analytics_events WHERE received_at >= ? AND received_at < ?
  `).get(new Date(new Date(window.endAt).getTime() - 5 * 60 * 1000).toISOString(), window.endAt).count);
  const operational = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tool_submissions WHERE status = 'pending') AS pending_submissions,
      (SELECT COUNT(*) FROM newsletter_subscriptions WHERE status = 'active') AS active_subscribers,
      (SELECT COUNT(*) FROM analytics_visitors) AS cumulative_uv,
      (SELECT MIN(first_seen_at) FROM analytics_visitors) AS stats_start_at
  `).get();
  const sessionStats = db.prepare(`
    WITH session_activity AS (
      SELECT session_id,
        SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
        SUM(CASE WHEN event_name NOT IN ('page_view', 'page_engagement') THEN 1 ELSE 0 END) AS interactions
      FROM analytics_events
      WHERE received_at >= ? AND received_at < ? AND session_id <> ''
      GROUP BY session_id
    )
    SELECT COUNT(*) AS sessions,
      SUM(CASE WHEN page_views = 1 AND interactions = 0 THEN 1 ELSE 0 END) AS bounced
    FROM session_activity
  `).get(window.startAt, window.endAt);
  const avgDuration = db.prepare(`
    SELECT AVG(CAST(json_extract(properties_json, '$.duration_ms') AS REAL)) AS value
    FROM analytics_events
    WHERE event_name = 'page_engagement' AND received_at >= ? AND received_at < ?
      AND json_valid(properties_json)
  `).get(window.startAt, window.endAt).value;
  return {
    ...current,
    bounceRate: rate(sessionStats.bounced, sessionStats.sessions),
    pendingSubmissions: count(operational.pending_submissions),
    activeSubscribers: count(operational.active_subscribers),
    eventsPerMinute: decimal(recentEvents / 5),
    conversionRate: rate(current.officialClicks, current.toolDetailViews),
    adCtr: rate(current.adClicks, current.adImpressions),
    cumulativeUv: count(operational.cumulative_uv),
    statsStartDate: operational.stats_start_at ? beijingDate(new Date(operational.stats_start_at)) : "",
    averageDailyPv: decimal(current.pageViews / Math.max(window.days, 1)),
    averageDailyUv: decimal(current.uniqueVisitors / Math.max(window.days, 1)),
    averageEngagementSeconds: decimal((Number(avgDuration) || 0) / 1000),
    changes: {
      pageViews: changeRate(current.pageViews, previous.pageViews),
      uniqueVisitors: changeRate(current.uniqueVisitors, previous.uniqueVisitors),
      searches: changeRate(current.searches, previous.searches),
      officialClicks: changeRate(current.officialClicks, previous.officialClicks),
      noResultSearches: changeRate(current.noResultSearches, previous.noResultSearches)
    }
  };
}

function dimensionStats(db, window, jsonKey, labels) {
  const query = `
    WITH current_rows AS (
      SELECT COALESCE(NULLIF(TRIM(CAST(json_extract(properties_json, ?) AS TEXT)), ''), 'unknown') AS dimension,
        COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv
      FROM analytics_events
      WHERE event_name = 'page_view' AND received_at >= ? AND received_at < ? AND json_valid(properties_json)
      GROUP BY dimension
    ),
    previous_rows AS (
      SELECT COALESCE(NULLIF(TRIM(CAST(json_extract(properties_json, ?) AS TEXT)), ''), 'unknown') AS dimension,
        COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv
      FROM analytics_events
      WHERE event_name = 'page_view' AND received_at >= ? AND received_at < ? AND json_valid(properties_json)
      GROUP BY dimension
    )
    SELECT current_rows.dimension, current_rows.pv, current_rows.uv,
      COALESCE(previous_rows.pv, 0) AS previous_pv,
      COALESCE(previous_rows.uv, 0) AS previous_uv
    FROM current_rows LEFT JOIN previous_rows ON previous_rows.dimension = current_rows.dimension
    ORDER BY current_rows.pv DESC, current_rows.uv DESC, current_rows.dimension COLLATE NOCASE ASC
  `;
  const rows = db.prepare(query).all(`$.${jsonKey}`, window.startAt, window.endAt, `$.${jsonKey}`, window.compareStartAt, window.compareEndAt);
  const totals = rows.reduce((sum, row) => ({ pv: sum.pv + count(row.pv), uv: sum.uv + count(row.uv) }), { pv: 0, uv: 0 });
  return rows.map((row) => ({
    key: row.dimension,
    label: labels[row.dimension] || row.dimension,
    pageViews: count(row.pv),
    uniqueVisitors: count(row.uv),
    pvShare: rate(row.pv, totals.pv),
    uvShare: rate(row.uv, totals.uv),
    change: changeRate(row.pv, row.previous_pv)
  }));
}

function getSourceStats(db, window) {
  const rows = dimensionStats(db, window, "source_type", sourceLabels);
  const websiteDomains = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(CAST(json_extract(properties_json, '$.source_domain') AS TEXT)), ''), 'unknown') AS domain,
      COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv
    FROM analytics_events
    WHERE event_name = 'page_view' AND received_at >= ? AND received_at < ?
      AND json_valid(properties_json)
      AND COALESCE(NULLIF(TRIM(CAST(json_extract(properties_json, '$.source_type') AS TEXT)), ''), 'unknown') = 'website'
    GROUP BY domain ORDER BY pv DESC, uv DESC LIMIT 10
  `).all(window.startAt, window.endAt).map((row) => ({ domain: row.domain, pageViews: count(row.pv), uniqueVisitors: count(row.uv) }));
  return rows.map((row) => row.key === "website" ? { ...row, domains: websiteDomains } : row);
}

function getPagePerformance(db, window, kpis) {
  const rows = db.prepare(`
    WITH current_rows AS (
      SELECT path, MIN(page_type) AS page_type, COUNT(*) AS page_views,
        COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM analytics_events
      WHERE event_name = 'page_view' AND received_at >= ? AND received_at < ?
        AND TRIM(path) <> ''
      GROUP BY path
    ),
    previous_rows AS (
      SELECT path, COUNT(*) AS page_views
      FROM analytics_events
      WHERE event_name = 'page_view' AND received_at >= ? AND received_at < ?
        AND TRIM(path) <> ''
      GROUP BY path
    )
    SELECT current_rows.*, COALESCE(previous_rows.page_views, 0) AS previous_page_views
    FROM current_rows LEFT JOIN previous_rows ON previous_rows.path = current_rows.path
    ORDER BY current_rows.page_views DESC, current_rows.unique_visitors DESC, current_rows.path COLLATE NOCASE ASC
    LIMIT 100
  `).all(window.startAt, window.endAt, window.compareStartAt, window.compareEndAt);
  return rows.map((row) => ({
    path: row.path,
    pageName: pageName(row.path, row.page_type),
    pageType: row.page_type,
    pageViews: count(row.page_views),
    uniqueVisitors: count(row.unique_visitors),
    pvShare: rate(row.page_views, kpis.pageViews),
    uvShare: rate(row.unique_visitors, kpis.uniqueVisitors),
    averageViewsPerVisitor: decimal(count(row.page_views) / Math.max(count(row.unique_visitors), 1)),
    change: changeRate(row.page_views, row.previous_page_views)
  }));
}

function getTrafficSeries(db, window) {
  if (window.granularity === "hour") {
    const hours = window.hours || DEFAULT_HOURS;
    const rows = db.prepare(`
      SELECT CAST(((julianday(received_at) - julianday(?)) * 24.0) + 0.0000001 AS INTEGER) AS bucket_index,
        SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
        COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN visitor_id END) AS unique_visitors,
        SUM(CASE WHEN event_name = 'search_submit' THEN 1 ELSE 0 END) AS searches,
        SUM(CASE WHEN event_name = 'tool_detail_view' THEN 1 ELSE 0 END) AS detail_views
      FROM analytics_events
      WHERE received_at >= ? AND received_at < ?
      GROUP BY bucket_index
      HAVING bucket_index >= 0 AND bucket_index < ?
    `).all(window.startAt, window.startAt, window.endAt, hours);
    const outboundRows = db.prepare(`
      SELECT CAST(((julianday(created_at) - julianday(?)) * 24.0) + 0.0000001 AS INTEGER) AS bucket_index,
        COUNT(*) AS official_clicks
      FROM outbound_clicks
      WHERE created_at >= ? AND created_at < ?
      GROUP BY bucket_index
      HAVING bucket_index >= 0 AND bucket_index < ?
    `).all(window.startAt, window.startAt, window.endAt, hours);
    const byBucket = new Map(rows.map((row) => [Number(row.bucket_index), row]));
    const outboundByBucket = new Map(outboundRows.map((row) => [Number(row.bucket_index), row]));
    const firstBucket = new Date(window.startAt);
    return Array.from({ length: hours }, (_, index) => {
      const hour = new Date(firstBucket.getTime() + index * HOUR_MS).toISOString();
      const row = byBucket.get(index) || {};
      return {
        hour,
        date: beijingDate(new Date(hour)),
        label: hour.slice(5, 16).replace("T", " "),
        pageViews: count(row.page_views),
        uniqueVisitors: count(row.unique_visitors),
        searches: count(row.searches),
        detailViews: count(row.detail_views),
        officialClicks: count(outboundByBucket.get(index)?.official_clicks)
      };
    });
  }

  const rows = db.prepare(`
    SELECT date(received_at, '+8 hours') AS day,
      SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN visitor_id END) AS unique_visitors,
      SUM(CASE WHEN event_name = 'search_submit' THEN 1 ELSE 0 END) AS searches,
      SUM(CASE WHEN event_name = 'tool_detail_view' THEN 1 ELSE 0 END) AS detail_views
    FROM analytics_events
    WHERE received_at >= ? AND received_at < ?
    GROUP BY day
  `).all(window.startAt, window.endAt);
  const byDate = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: window.days }, (_, index) => {
    const date = addDays(window.startDate, index);
    const row = byDate.get(date) || {};
    return {
      hour: `${date}T00:00:00.000+08:00`,
      date,
      label: date.slice(5),
      pageViews: count(row.page_views),
      uniqueVisitors: count(row.unique_visitors),
      searches: count(row.searches),
      detailViews: count(row.detail_views),
      officialClicks: 0
    };
  });
}

function getSearchGaps(db, startAt, endAt) {
  return db.prepare(`WITH searches AS (
    SELECT visitor_id, TRIM(CAST(json_extract(properties_json, '$.query') AS TEXT)) AS query
    FROM analytics_events
    WHERE event_name = 'search_submit' AND received_at >= ? AND received_at < ?
      AND json_valid(properties_json) AND CAST(json_extract(properties_json, '$.result_count') AS INTEGER) = 0
  ) SELECT MIN(query) AS query, COUNT(*) AS count, COUNT(DISTINCT visitor_id) AS unique_visitors
    FROM searches WHERE query IS NOT NULL AND query <> '' GROUP BY LOWER(query)
    ORDER BY count DESC, unique_visitors DESC LIMIT ?`).all(startAt, endAt, TOP_LIMIT).map((row) => ({
      query: row.query,
      count: count(row.count),
      uniqueVisitors: count(row.unique_visitors)
    }));
}

function getCategoryPerformance(db, startAt, endAt) {
  return db.prepare(`WITH category_clicks AS (
    SELECT CAST(json_extract(properties_json, '$.category_id') AS TEXT) AS category_id, COUNT(*) AS clicks
    FROM analytics_events WHERE event_name = 'category_click' AND received_at >= ? AND received_at < ?
      AND json_valid(properties_json) GROUP BY category_id
  ) SELECT categories.id, categories.name, COALESCE(category_clicks.clicks, 0) AS clicks
    FROM categories LEFT JOIN category_clicks ON category_clicks.category_id = categories.id
    WHERE categories.status = 'published' AND categories.id <> 'all'
    ORDER BY clicks DESC, categories.sort_order ASC`).all(startAt, endAt).map((row) => ({
      categoryId: row.id,
      name: row.name,
      clicks: count(row.clicks)
    }));
}

function getFunnel(db, startAt, endAt) {
  const result = db.prepare(`
    WITH
      entry_visitors AS (
        SELECT visitor_id, MIN(received_at) AS reached_at
        FROM analytics_events
        WHERE received_at >= ? AND received_at < ?
          AND event_name = 'page_view' AND visitor_id <> ''
        GROUP BY visitor_id
      ),
      discovery_visitors AS (
        SELECT events.visitor_id, MIN(events.received_at) AS reached_at
        FROM analytics_events events
        INNER JOIN entry_visitors entry ON entry.visitor_id = events.visitor_id
        WHERE events.received_at >= entry.reached_at AND events.received_at < ?
          AND events.event_name IN ('search_submit', 'category_click')
        GROUP BY events.visitor_id
      ),
      card_visitors AS (
        SELECT events.visitor_id, MIN(events.received_at) AS reached_at
        FROM analytics_events events
        INNER JOIN discovery_visitors discovery ON discovery.visitor_id = events.visitor_id
        WHERE events.received_at >= discovery.reached_at AND events.received_at < ?
          AND events.event_name = 'tool_card_click'
        GROUP BY events.visitor_id
      ),
      detail_visitors AS (
        SELECT events.visitor_id, MIN(events.received_at) AS reached_at
        FROM analytics_events events
        INNER JOIN card_visitors card ON card.visitor_id = events.visitor_id
        WHERE events.received_at >= card.reached_at AND events.received_at < ?
          AND events.event_name = 'tool_detail_view'
        GROUP BY events.visitor_id
      ),
      official_visitors AS (
        SELECT events.visitor_id, MIN(events.received_at) AS reached_at
        FROM analytics_events events
        INNER JOIN detail_visitors detail ON detail.visitor_id = events.visitor_id
        WHERE events.received_at >= detail.reached_at AND events.received_at < ?
          AND events.event_name = 'tool_official_click'
        GROUP BY events.visitor_id
      )
    SELECT
      (SELECT COUNT(*) FROM entry_visitors) AS entries,
      (SELECT COUNT(*) FROM discovery_visitors) AS discoveries,
      (SELECT COUNT(*) FROM card_visitors) AS card_clicks,
      (SELECT COUNT(*) FROM detail_visitors) AS detail_views,
      (SELECT COUNT(*) FROM official_visitors) AS official_clicks
  `).get(startAt, endAt, endAt, endAt, endAt, endAt);
  const definitions = [
    ["page_view", "访问页面", result.entries],
    ["discover", "搜索或选择分类", result.discoveries],
    ["tool_card_click", "点击工具卡片", result.card_clicks],
    ["tool_detail_view", "查看工具详情", result.detail_views],
    ["tool_official_click", "点击访问官网", result.official_clicks]
  ];
  const first = count(definitions[0][2]);
  return definitions.map(([key, label, rawVisitors], index) => {
    const visitors = count(rawVisitors);
    const previous = index === 0 ? visitors : count(definitions[index - 1][2]);
    return {
      key,
      label,
      visitors,
      conversionFromPrevious: index === 0 ? (visitors > 0 ? 100 : 0) : rate(visitors, previous),
      conversionFromStart: index === 0 ? (visitors > 0 ? 100 : 0) : rate(visitors, first)
    };
  });
}

function getTopTools(db, startAt, endAt) {
  return db.prepare(`
    WITH detail_counts AS (
      SELECT CASE WHEN json_valid(properties_json)
          AND json_type(properties_json, '$.tool_id') = 'text'
          THEN CAST(json_extract(properties_json, '$.tool_id') AS TEXT)
          ELSE NULL END AS tool_id,
        COUNT(*) AS detail_views
      FROM analytics_events
      WHERE received_at >= ? AND received_at < ? AND event_name = 'tool_detail_view'
      GROUP BY tool_id
    ),
    official_counts AS (
      SELECT tool_id, COUNT(*) AS official_clicks
      FROM outbound_clicks
      WHERE created_at >= ? AND created_at < ?
      GROUP BY tool_id
    )
    SELECT tools.id AS tool_id, tools.name,
      COALESCE(detail_counts.detail_views, 0) AS detail_views,
      COALESCE(official_counts.official_clicks, 0) AS official_clicks
    FROM tools
    LEFT JOIN detail_counts ON detail_counts.tool_id = tools.id
    LEFT JOIN official_counts ON official_counts.tool_id = tools.id
    WHERE tools.status = 'published'
      AND (COALESCE(detail_counts.detail_views, 0) + COALESCE(official_counts.official_clicks, 0)) > 0
    ORDER BY official_clicks DESC, detail_views DESC, tools.popularity DESC, tools.name COLLATE NOCASE ASC
    LIMIT ?
  `).all(startAt, endAt, startAt, endAt, TOP_LIMIT).map((row) => ({
    toolId: row.tool_id,
    name: row.name,
    detailViews: count(row.detail_views),
    officialClicks: count(row.official_clicks),
    conversionRate: rate(row.official_clicks, row.detail_views)
  }));
}

function getTopSearches(db, startAt, endAt) {
  return db.prepare(`
    WITH parsed_searches AS (
      SELECT visitor_id,
        CASE WHEN json_valid(properties_json) THEN TRIM(CAST(json_extract(properties_json, '$.query') AS TEXT)) ELSE NULL END AS query
      FROM analytics_events
      WHERE event_name = 'search_submit' AND received_at >= ? AND received_at < ?
    )
    SELECT MIN(query) AS query, COUNT(*) AS count, COUNT(DISTINCT visitor_id) AS unique_visitors
    FROM parsed_searches
    WHERE query IS NOT NULL AND query <> ''
    GROUP BY LOWER(query)
    ORDER BY count DESC, unique_visitors DESC, query COLLATE NOCASE ASC
    LIMIT ?
  `).all(startAt, endAt, TOP_LIMIT).map((row) => ({
    query: row.query,
    count: count(row.count),
    uniqueVisitors: count(row.unique_visitors)
  }));
}

function getRecentEvents(db, startAt, endAt) {
  return db.prepare(`
    SELECT events.event_id, events.event_name, events.page_type, events.path,
      events.visitor_id, events.properties_json, events.received_at, tools.name AS tool_name
    FROM analytics_events events
    LEFT JOIN tools ON tools.id = CASE
      WHEN json_valid(events.properties_json) THEN CAST(json_extract(events.properties_json, '$.tool_id') AS TEXT)
      ELSE NULL END
    WHERE events.received_at >= ? AND events.received_at < ?
    ORDER BY events.received_at DESC
    LIMIT ?
  `).all(startAt, endAt, RECENT_LIMIT).map((row) => {
    const properties = safeJsonObject(row.properties_json);
    return {
      eventId: row.event_id,
      eventName: row.event_name,
      pageType: row.page_type,
      entityLabel: makeEntityLabel(row, properties),
      visitorShort: shortenIdentifier(row.visitor_id),
      receivedAt: row.received_at
    };
  });
}

function getSubmissionStatus(db) {
  const rows = db.prepare("SELECT status, COUNT(*) AS count FROM tool_submissions GROUP BY status").all();
  const values = Object.fromEntries(SUBMISSION_STATUSES.map((status) => [status, 0]));
  rows.forEach((row) => {
    if (Object.hasOwn(values, row.status)) values[row.status] = count(row.count);
  });
  return values;
}

export function getMonitoringSnapshot(db, options = {}) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("db must be an open SQLite database");
  const window = buildWindow(options);
  const kpis = getKpis(db, window);
  const trafficSeries = getTrafficSeries(db, window);
  return {
    generatedAt: window.endAt,
    window: {
      hours: window.hours,
      mode: window.mode,
      range: window.range,
      timezone: window.timezone,
      startDate: window.startDate,
      endDate: window.endDate,
      startAt: window.startAt,
      endAt: window.endAt,
      compareStartAt: window.compareStartAt,
      compareEndAt: window.compareEndAt,
      granularity: window.granularity
    },
    kpis,
    hourlySeries: trafficSeries,
    trafficSeries,
    funnel: getFunnel(db, window.startAt, window.endAt),
    topTools: getTopTools(db, window.startAt, window.endAt),
    topSearches: getTopSearches(db, window.startAt, window.endAt),
    searchGaps: getSearchGaps(db, window.startAt, window.endAt),
    categoryPerformance: getCategoryPerformance(db, window.startAt, window.endAt),
    pagePerformance: getPagePerformance(db, window, kpis),
    sourceStats: getSourceStats(db, window),
    deviceStats: dimensionStats(db, window, "device_type", deviceLabels),
    recentEvents: getRecentEvents(db, window.startAt, window.endAt),
    submissionStatus: getSubmissionStatus(db)
  };
}
