import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { getMonitoringSnapshot } from "../backend/monitoring.mjs";
import { buildApplication } from "../server.mjs";

const schemaSql = readFileSync(new URL("../backend/schema.sql", import.meta.url), "utf8");
const fixedNow = "2026-07-13T12:00:00.000Z";

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaSql);
  return db;
}

function insertEvent(db, {
  id,
  name,
  visitor,
  session,
  time,
  properties = {},
  rawProperties
}) {
  db.prepare(`
    INSERT INTO analytics_events (
      event_id, event_name, visitor_id, session_id, page_type, path,
      properties_json, client_time, received_at, ip_hash
    ) VALUES (?, ?, ?, ?, 'tools', '/#tools', ?, ?, ?, 'test-ip-hash')
  `).run(
    id,
    name,
    visitor,
    session,
    rawProperties ?? JSON.stringify(properties),
    time,
    time
  );
}

function seedMonitoringFixture(db) {
  db.prepare(`
    INSERT INTO categories (id, name, icon, description, sort_order)
    VALUES ('writing', 'AI写作', 'pen-line', '', 1)
  `).run();
  db.prepare(`
    INSERT INTO tools (
      id, slug, name, domain, official_url, category_id, summary, description,
      pricing_type, language, content_updated_date, editor_score, popularity
    ) VALUES (?, ?, ?, ?, ?, 'writing', ?, ?, 'freemium', 'multi', '2026-07-13', 90, ?)
  `).run(
    "tool-alpha",
    "tool-alpha",
    "Alpha AI",
    "alpha.example.com",
    "https://alpha.example.com/",
    "Alpha summary",
    "Alpha description",
    90
  );

  const visitors = {
    alpha: "visitor-sensitive-1234567890",
    beta: "visitor-beta-1234567890",
    old: "visitor-old-1234567890"
  };

  const alphaEvents = [
    ["event-alpha-page", "page_view", "2026-07-13T11:01:00.000Z", { page_id: "tools" }],
    ["event-alpha-search", "search_submit", "2026-07-13T11:02:00.000Z", { query: "写作", result_count: 5 }],
    ["event-alpha-category", "category_click", "2026-07-13T11:03:00.000Z", { category_id: "writing" }],
    ["event-alpha-card", "tool_card_click", "2026-07-13T11:04:00.000Z", { tool_id: "tool-alpha" }],
    ["event-alpha-detail", "tool_detail_view", "2026-07-13T11:05:00.000Z", { tool_id: "tool-alpha" }],
    ["event-alpha-official", "tool_official_click", "2026-07-13T11:06:00.000Z", { tool_id: "tool-alpha" }],
    ["event-alpha-ad-view", "ad_impression", "2026-07-13T11:07:00.000Z", { ad_id: "sponsor-1" }],
    ["event-alpha-ad-click", "ad_click", "2026-07-13T11:08:00.000Z", { ad_id: "sponsor-1" }],
    ["event-alpha-recent", "article_click", "2026-07-13T11:59:00.000Z", { article_id: "article-1" }]
  ];
  alphaEvents.forEach(([id, name, time, properties]) => insertEvent(db, {
    id,
    name,
    time,
    properties,
    visitor: visitors.alpha,
    session: "session-alpha-123456"
  }));

  insertEvent(db, {
    id: "event-beta-page",
    name: "page_view",
    visitor: visitors.beta,
    session: "session-beta-123456",
    time: "2026-07-13T10:30:00.000Z",
    properties: { page_id: "tools" }
  });
  insertEvent(db, {
    id: "event-beta-search",
    name: "search_submit",
    visitor: visitors.beta,
    session: "session-beta-123456",
    time: "2026-07-13T10:31:00.000Z",
    properties: { query: "写作", result_count: 3 }
  });
  insertEvent(db, {
    id: "event-old-page",
    name: "page_view",
    visitor: visitors.old,
    session: "session-old-123456",
    time: "2026-07-06T12:30:00.000Z",
    properties: { page_id: "tools" }
  });
  insertEvent(db, {
    id: "event-malformed-json",
    name: "search_submit",
    visitor: "visitor-malformed-1234567890",
    session: "session-malformed-123456",
    time: "2026-07-13T10:32:00.000Z",
    rawProperties: "{not-json"
  });

  db.prepare(`
    INSERT INTO outbound_clicks (
      id, tool_id, placement, session_id, ip_hash, user_agent_family, created_at
    ) VALUES (
      'outbound-alpha', 'tool-alpha', 'detail_drawer', 'session-alpha-123456',
      'test-ip-hash', 'test', '2026-07-13T11:06:01.000Z'
    )
  `).run();

  const insertSubmission = db.prepare(`
    INSERT INTO tool_submissions (
      id, tracking_code, name, website_url, normalized_url, category_id,
      summary, contact_email, status, source, submitted_at
    ) VALUES (?, ?, ?, ?, ?, 'writing', 'Submission summary', 'owner@example.com', ?, 'test', ?)
  `);
  [
    ["submission-pending-1", "NK-PENDING-1", "Pending One", "pending", "2026-07-13T11:10:00.000Z"],
    ["submission-pending-2", "NK-PENDING-2", "Pending Two", "pending", "2026-07-13T11:11:00.000Z"],
    ["submission-approved", "NK-APPROVED", "Approved", "approved", "2026-07-12T11:10:00.000Z"],
    ["submission-rejected", "NK-REJECTED", "Rejected", "rejected", "2026-07-11T11:10:00.000Z"],
    ["submission-duplicate", "NK-DUPLICATE", "Duplicate", "duplicate", "2026-07-10T11:10:00.000Z"]
  ].forEach(([id, trackingCode, name, status, submittedAt]) => {
    const url = `https://${id}.example.com/`;
    insertSubmission.run(id, trackingCode, name, url, url, status, submittedAt);
  });

  const insertSubscription = db.prepare(`
    INSERT INTO newsletter_subscriptions (
      id, email, normalized_email, status, consent_version, source, consent_at
    ) VALUES (?, ?, ?, ?, '2026-07', 'test', ?)
  `);
  insertSubscription.run(
    "subscription-active-1",
    "reader-one@example.com",
    "reader-one@example.com",
    "active",
    "2026-07-13T11:20:00.000Z"
  );
  insertSubscription.run(
    "subscription-active-2",
    "reader-two@example.com",
    "reader-two@example.com",
    "active",
    "2026-07-12T11:20:00.000Z"
  );
  insertSubscription.run(
    "subscription-inactive",
    "reader-old@example.com",
    "reader-old@example.com",
    "unsubscribed",
    "2026-07-11T11:20:00.000Z"
  );

  return visitors;
}

async function withApplication(options, callback) {
  const directory = mkdtempSync(join(tmpdir(), "nike-ai-monitoring-"));
  const application = buildApplication({
    dbPath: join(directory, "monitoring.db"),
    analyticsSalt: "monitoring-test-analytics-salt",
    logger: false,
    autoSeed: false,
    ...options
  });
  try {
    const address = await application.listen(0, "127.0.0.1");
    await callback(application, `http://127.0.0.1:${address.port}`);
  } finally {
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  return { response, body: await response.json() };
}

function getJsonWithRawHeaders(url, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: "GET", headers: { Accept: "application/json", ...headers } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

test("monitoring snapshot returns stable zero values and gap-filled windows", () => {
  const db = createDatabase();
  try {
    for (const hours of [1, 24, 168]) {
      const snapshot = getMonitoringSnapshot(db, { hours, now: fixedNow });
      assert.equal(snapshot.window.hours, hours);
      assert.equal(snapshot.window.endAt, fixedNow);
      assert.equal(snapshot.hourlySeries.length, hours);
      assert.ok(snapshot.hourlySeries.every((bucket) => (
        bucket.pageViews === 0
        && bucket.uniqueVisitors === 0
        && bucket.searches === 0
        && bucket.detailViews === 0
        && bucket.officialClicks === 0
      )));
    }

    const snapshot = getMonitoringSnapshot(db, { hours: 24, now: fixedNow });
    assert.deepEqual(snapshot.kpis, {
      pageViews: 0,
      uniqueVisitors: 0,
      activeSessions: 0,
      searches: 0,
      noResultSearches: 0,
      bounceRate: 0,
      toolCardClicks: 0,
      toolDetailViews: 0,
      officialClicks: 0,
      adImpressions: 0,
      adClicks: 0,
      pendingSubmissions: 0,
      activeSubscribers: 0,
      eventsPerMinute: 0,
      conversionRate: 0,
      adCtr: 0
    });
    assert.deepEqual(snapshot.topTools, []);
    assert.deepEqual(snapshot.topSearches, []);
    assert.deepEqual(snapshot.searchGaps, []);
    assert.deepEqual(snapshot.recentEvents, []);
    assert.deepEqual(snapshot.submissionStatus, {
      pending: 0,
      approved: 0,
      rejected: 0,
      duplicate: 0
    });
    assert.ok(snapshot.funnel.every((step) => (
      step.visitors === 0
      && step.conversionFromPrevious === 0
      && step.conversionFromStart === 0
    )));
  } finally {
    db.close();
  }
});

test("monitoring snapshot aggregates traffic, discovery, conversion and operational data", () => {
  const db = createDatabase();
  try {
    seedMonitoringFixture(db);
    const oneHour = getMonitoringSnapshot(db, { hours: 1, now: fixedNow });
    assert.equal(oneHour.kpis.pageViews, 1);
    assert.equal(oneHour.kpis.uniqueVisitors, 1);
    assert.equal(oneHour.kpis.activeSessions, 1);
    assert.equal(oneHour.kpis.searches, 1);
    assert.equal(oneHour.kpis.toolCardClicks, 1);
    assert.equal(oneHour.kpis.toolDetailViews, 1);
    assert.equal(oneHour.kpis.officialClicks, 1);
    assert.equal(oneHour.kpis.adImpressions, 1);
    assert.equal(oneHour.kpis.adClicks, 1);
    assert.equal(oneHour.kpis.conversionRate, 100);
    assert.equal(oneHour.kpis.adCtr, 100);
    assert.equal(oneHour.kpis.eventsPerMinute, 0.2);
    assert.equal(oneHour.kpis.pendingSubmissions, 2);
    assert.equal(oneHour.kpis.activeSubscribers, 2);
    assert.deepEqual(oneHour.funnel.map((step) => step.visitors), [1, 1, 1, 1, 1]);
    assert.equal(oneHour.hourlySeries[0].officialClicks, 1);

    const day = getMonitoringSnapshot(db, { hours: 24, now: fixedNow });
    assert.equal(day.kpis.pageViews, 2);
    assert.equal(day.kpis.uniqueVisitors, 2);
    assert.equal(day.kpis.activeSessions, 1);
    assert.equal(day.kpis.searches, 3);
    assert.deepEqual(day.funnel.map((step) => step.visitors), [2, 2, 1, 1, 1]);
    assert.deepEqual(day.topTools, [{
      toolId: "tool-alpha",
      name: "Alpha AI",
      detailViews: 1,
      officialClicks: 1,
      conversionRate: 100
    }]);
    assert.deepEqual(day.topSearches, [{ query: "写作", count: 2, uniqueVisitors: 2 }]);
    assert.deepEqual(day.submissionStatus, {
      pending: 2,
      approved: 1,
      rejected: 1,
      duplicate: 1
    });

    const week = getMonitoringSnapshot(db, { hours: 168, now: fixedNow });
    assert.equal(week.kpis.pageViews, 3);
    assert.equal(week.kpis.uniqueVisitors, 3);
    assert.equal(week.hourlySeries.length, 168);
    assert.deepEqual(week.funnel.map((step) => step.visitors), [3, 2, 1, 1, 1]);
  } finally {
    db.close();
  }
});

test("monitoring ignores malformed JSON and masks identifiers in recent events", () => {
  const db = createDatabase();
  try {
    const visitors = seedMonitoringFixture(db);
    const snapshot = getMonitoringSnapshot(db, { hours: 24, now: fixedNow });
    assert.equal(snapshot.topSearches.length, 1);
    assert.equal(snapshot.topSearches[0].query, "写作");

    const recent = snapshot.recentEvents.find((event) => event.eventId === "event-alpha-ad-click");
    assert.ok(recent);
    assert.notEqual(recent.visitorShort, visitors.alpha);
    assert.match(recent.visitorShort, /^visito…890$/);
    assert.equal(JSON.stringify(snapshot.recentEvents).includes(visitors.alpha), false);
    assert.equal(JSON.stringify(snapshot.recentEvents).includes("owner@example.com"), false);

    const malformed = snapshot.recentEvents.find((event) => event.eventId === "event-malformed-json");
    assert.ok(malformed);
    assert.equal(malformed.entityLabel, "/#tools");
  } finally {
    db.close();
  }
});

test("development loopback can read monitoring without management permission", async () => {
  await withApplication({ environment: "development", adminToken: "development-admin-token" }, async (app, baseUrl) => {
    const eventTime = new Date(Date.now() - 60_000).toISOString();
    insertEvent(app.db, {
      id: "development-private-search",
      name: "search_submit",
      visitor: "development-private-visitor",
      session: "development-private-session",
      time: eventTime,
      properties: { query: "不应向匿名请求公开", result_count: 2 }
    });

    const { response, body } = await getJson(`${baseUrl}/api/admin/v1/monitoring?hours=1`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    assert.equal(body.data.window.hours, 1);
    assert.equal(body.data.access.mode, "local-readonly");
    assert.equal(body.data.access.canManage, false);
    assert.equal(body.data.access.detailedAnalytics, false);
    assert.equal(body.data.system.status, "healthy");
    assert.deepEqual(body.data.topSearches, []);
    assert.deepEqual(body.data.recentEvents, []);

    const invalidHours = await getJson(`${baseUrl}/api/admin/v1/monitoring?hours=7`);
    assert.equal(invalidHours.response.status, 422);
    assert.equal(invalidHours.body.code, "invalid_hours");

    const maliciousHost = await getJsonWithRawHeaders(`${baseUrl}/api/admin/v1/monitoring?hours=1`, {
      Host: "evil.example"
    });
    assert.equal(maliciousHost.status, 401);
    assert.equal(maliciousHost.body.code, "unauthorized");

    const crossSiteOrigin = await getJsonWithRawHeaders(`${baseUrl}/api/admin/v1/monitoring?hours=1`, {
      Origin: "https://evil.example",
      "Sec-Fetch-Site": "cross-site"
    });
    assert.equal(crossSiteOrigin.status, 401);
    assert.equal(crossSiteOrigin.body.code, "unauthorized");
  });
});

test("production monitoring rejects missing credentials and marks a valid token as manageable", async () => {
  await withApplication({
    environment: "production",
    adminToken: "production-monitor-token",
    tokenAdminEnabled: true
  }, async (app, baseUrl) => {
    const eventTime = new Date(Date.now() - 60_000).toISOString();
    insertEvent(app.db, {
      id: "production-admin-search",
      name: "search_submit",
      visitor: "production-admin-visitor",
      session: "production-admin-session",
      time: eventTime,
      properties: { query: "管理端可见搜索", result_count: 4 }
    });

    const denied = await getJson(`${baseUrl}/api/admin/v1/monitoring?hours=24`);
    assert.equal(denied.response.status, 401);
    assert.equal(denied.body.code, "unauthorized");

    const allowed = await getJson(`${baseUrl}/api/admin/v1/monitoring?hours=168`, {
      headers: { Authorization: "Bearer production-monitor-token" }
    });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.body.data.window.hours, 168);
    assert.equal(allowed.body.data.access.mode, "admin");
    assert.equal(allowed.body.data.access.canManage, true);
    assert.equal(allowed.body.data.access.detailedAnalytics, true);
    assert.equal(allowed.response.headers.get("cache-control"), "no-store, private");
    assert.deepEqual(allowed.body.data.topSearches, [{
      query: "管理端可见搜索",
      count: 1,
      uniqueVisitors: 1
    }]);
    assert.equal(allowed.body.data.recentEvents[0].eventId, "production-admin-search");
  });
});
