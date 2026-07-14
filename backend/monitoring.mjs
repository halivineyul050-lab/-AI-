const ALLOWED_HOURS = new Set([1, 6, 24, 72, 168]);
const DEFAULT_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const TOP_LIMIT = 10;
const RECENT_LIMIT = 40;
const SUBMISSION_STATUSES = ["pending", "approved", "rejected", "duplicate"];

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
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
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

function getKpis(db, startAt, endAt, hours) {
  const activeStartAt = new Date(new Date(endAt).getTime() - 5 * 60 * 1000).toISOString();
  const analytics = db.prepare(`
    SELECT
      COUNT(*) AS total_events,
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

  const recentEvents = count(db.prepare(`
    SELECT COUNT(*) AS count FROM analytics_events
    WHERE received_at >= ? AND received_at < ?
  `).get(activeStartAt, endAt).count);

  const officialClicks = count(db.prepare(`
    SELECT COUNT(*) AS count
    FROM outbound_clicks
    WHERE created_at >= ? AND created_at < ?
  `).get(startAt, endAt).count);

  const operational = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tool_submissions WHERE status = 'pending') AS pending_submissions,
      (SELECT COUNT(*) FROM newsletter_subscriptions WHERE status = 'active') AS active_subscribers
  `).get();

  const toolDetailViews = count(analytics.tool_detail_views);
  const adImpressions = count(analytics.ad_impressions);
  const adClicks = count(analytics.ad_clicks);

  return {
    pageViews: count(analytics.page_views),
    uniqueVisitors: count(analytics.unique_visitors),
    activeSessions: count(analytics.active_sessions),
    searches: count(analytics.searches),
    toolCardClicks: count(analytics.tool_card_clicks),
    toolDetailViews,
    officialClicks,
    adImpressions,
    adClicks,
    pendingSubmissions: count(operational.pending_submissions),
    activeSubscribers: count(operational.active_subscribers),
    eventsPerMinute: decimal(recentEvents / 5),
    conversionRate: rate(officialClicks, toolDetailViews),
    adCtr: rate(adClicks, adImpressions)
  };
}

function getHourlySeries(db, startAt, endAt, hours) {
  const analyticsRows = db.prepare(`
    SELECT
      CAST(((julianday(received_at) - julianday(?)) * 24.0) + 0.0000001 AS INTEGER) AS bucket_index,
      SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      COUNT(DISTINCT CASE WHEN event_name = 'page_view' THEN visitor_id END) AS unique_visitors,
      SUM(CASE WHEN event_name = 'search_submit' THEN 1 ELSE 0 END) AS searches,
      SUM(CASE WHEN event_name = 'tool_detail_view' THEN 1 ELSE 0 END) AS detail_views
    FROM analytics_events
    WHERE received_at >= ? AND received_at < ?
    GROUP BY bucket_index
    HAVING bucket_index >= 0 AND bucket_index < ?
  `).all(startAt, startAt, endAt, hours);

  const outboundRows = db.prepare(`
    SELECT
      CAST(((julianday(created_at) - julianday(?)) * 24.0) + 0.0000001 AS INTEGER) AS bucket_index,
      COUNT(*) AS official_clicks
    FROM outbound_clicks
    WHERE created_at >= ? AND created_at < ?
    GROUP BY bucket_index
    HAVING bucket_index >= 0 AND bucket_index < ?
  `).all(startAt, startAt, endAt, hours);

  const analyticsByBucket = new Map(analyticsRows.map((row) => [Number(row.bucket_index), row]));
  const outboundByBucket = new Map(outboundRows.map((row) => [Number(row.bucket_index), row]));
  const firstBucket = new Date(startAt);

  return Array.from({ length: hours }, (_, index) => {
    const hour = new Date(firstBucket.getTime() + index * HOUR_MS).toISOString();
    const analytics = analyticsByBucket.get(index) || {};
    const outbound = outboundByBucket.get(index) || {};
    return {
      hour,
      label: hour.slice(5, 16).replace("T", " "),
      pageViews: count(analytics.page_views),
      uniqueVisitors: count(analytics.unique_visitors),
      searches: count(analytics.searches),
      detailViews: count(analytics.detail_views),
      officialClicks: count(outbound.official_clicks)
    };
  });
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
    ["page_view", "访问首页", result.entries],
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
      SELECT
        CASE WHEN json_valid(properties_json)
          AND json_type(properties_json, '$.tool_id') = 'text'
          THEN CAST(json_extract(properties_json, '$.tool_id') AS TEXT)
          ELSE NULL END AS tool_id,
        COUNT(*) AS detail_views
      FROM analytics_events
      WHERE received_at >= ? AND received_at < ?
        AND event_name = 'tool_detail_view'
      GROUP BY tool_id
    ),
    official_counts AS (
      SELECT tool_id, COUNT(*) AS official_clicks
      FROM outbound_clicks
      WHERE created_at >= ? AND created_at < ?
      GROUP BY tool_id
    )
    SELECT
      tools.id AS tool_id,
      tools.name,
      COALESCE(detail_counts.detail_views, 0) AS detail_views,
      COALESCE(official_counts.official_clicks, 0) AS official_clicks
    FROM tools
    LEFT JOIN detail_counts ON detail_counts.tool_id = tools.id
    LEFT JOIN official_counts ON official_counts.tool_id = tools.id
    WHERE tools.status = 'published'
      AND (COALESCE(detail_counts.detail_views, 0) + COALESCE(official_counts.official_clicks, 0)) > 0
    ORDER BY official_clicks DESC, detail_views DESC, tools.popularity DESC,
             tools.name COLLATE NOCASE ASC
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
      SELECT
        visitor_id,
        CASE WHEN json_valid(properties_json)
          THEN TRIM(CAST(json_extract(properties_json, '$.query') AS TEXT))
          ELSE NULL END AS query
      FROM analytics_events
      WHERE event_name = 'search_submit'
        AND received_at >= ? AND received_at < ?
    )
    SELECT MIN(query) AS query, COUNT(*) AS count,
           COUNT(DISTINCT visitor_id) AS unique_visitors
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
    SELECT
      events.event_id,
      events.event_name,
      events.page_type,
      events.path,
      events.visitor_id,
      events.properties_json,
      events.received_at,
      tools.name AS tool_name
    FROM analytics_events events
    LEFT JOIN tools ON tools.id = CASE
      WHEN json_valid(events.properties_json)
      THEN CAST(json_extract(events.properties_json, '$.tool_id') AS TEXT)
      ELSE NULL
    END
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
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM tool_submissions
    GROUP BY status
  `).all();
  const values = Object.fromEntries(SUBMISSION_STATUSES.map((status) => [status, 0]));
  rows.forEach((row) => {
    if (Object.hasOwn(values, row.status)) values[row.status] = count(row.count);
  });
  return values;
}

/**
 * Return a read-only UTC snapshot for the real-time administration dashboard.
 * User-controlled values are normalized in JavaScript; all SQL values are bound.
 */
export function getMonitoringSnapshot(db, options = {}) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("db must be an open SQLite database");

  const hours = normalizeHours(options.hours);
  const now = normalizeNow(options.now);
  const start = new Date(now.getTime() - hours * HOUR_MS);
  const startAt = start.toISOString();
  const endAt = now.toISOString();

  return {
    generatedAt: endAt,
    window: { hours, startAt, endAt },
    kpis: getKpis(db, startAt, endAt, hours),
    hourlySeries: getHourlySeries(db, startAt, endAt, hours),
    funnel: getFunnel(db, startAt, endAt),
    topTools: getTopTools(db, startAt, endAt),
    topSearches: getTopSearches(db, startAt, endAt),
    recentEvents: getRecentEvents(db, startAt, endAt),
    submissionStatus: getSubmissionStatus(db)
  };
}
