import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import { getBootstrap, listSitemapTools, listTools, openDatabase, seedDatabase } from "../backend/database.mjs";
import { importToolCatalog } from "../backend/tool-import.mjs";

const seedData = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "backend", "seed-data.json"), "utf8"));
const categoryMapping = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "backend", "catalog", "category-mapping-ai-bot.json"), "utf8"));

let db;
let testDir;

before(() => {
  testDir = mkdtempSync(join(tmpdir(), "nike-ai-import-"));
  db = openDatabase(join(testDir, "catalog.db"));
  seedDatabase(db, seedData);
});

after(() => {
  db.close();
  rmSync(testDir, { recursive: true, force: true });
});

function designRecord(overrides = {}) {
  return {
    sourceKey: "authorized-design-001",
    sourceDetailUrl: "https://catalog.example.org/sites/1001",
    sourceListingUrl: "https://catalog.example.org/design",
    sourceCategory: "AI设计工具",
    name: "合规目录示例工具",
    officialUrl: "https://product.example.org/?utm_source=catalog",
    pricingType: "unknown",
    language: "unknown",
    platforms: "web|desktop",
    features: "协作画布|模板辅助",
    useCases: "视觉设计|内容创作",
    verifiedAt: "2026-07-14",
    ...overrides
  };
}

test("catalog and CMS migrations add provenance, revisions and honest unknown values", () => {
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 12);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count, 12);
  assert.ok(db.prepare("SELECT 1 FROM categories WHERE id = 'design'").get());
  assert.ok(db.prepare("SELECT 1 FROM categories WHERE id = 'comic'").get());
  const columns = db.prepare("PRAGMA table_info(tools)").all().map((row) => row.name);
  assert.ok(columns.includes("canonical_url"));
  assert.ok(columns.includes("data_quality_status"));
  assert.ok(columns.includes("category_sort_order"));
  assert.ok(columns.includes("cms_managed_at"));
  assert.ok(columns.includes("revision"));
  assert.equal(db.prepare("SELECT revision FROM content_state WHERE id = 1").get().revision, 1);
});

test("version 4 and 5 migrations preserve populated version 3 tools and relations", () => {
  const upgradePath = join(testDir, "upgrade-v3.db");
  const legacy = new DatabaseSync(upgradePath);
  legacy.exec(readFileSync(resolve(import.meta.dirname, "..", "backend", "schema.sql"), "utf8"));
  legacy.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT INTO schema_migrations (version, name) VALUES (1, 'initial_schema');
  `);
  legacy.exec(readFileSync(resolve(import.meta.dirname, "..", "backend", "migrations", "002_lookup_tokens.sql"), "utf8"));
  legacy.prepare("INSERT INTO schema_migrations (version, name) VALUES (2, 'lookup_tokens')").run();
  legacy.exec(readFileSync(resolve(import.meta.dirname, "..", "backend", "migrations", "003_article_sources.sql"), "utf8"));
  legacy.prepare("INSERT INTO schema_migrations (version, name) VALUES (3, 'article_sources')").run();
  legacy.prepare("INSERT INTO categories (id, name, icon, sort_order) VALUES ('all', '全部工具', 'layout-grid', 0)").run();
  legacy.prepare("INSERT INTO categories (id, name, icon, sort_order) VALUES ('chat', 'AI 对话', 'messages-square', 1)").run();
  legacy.prepare(`
    INSERT INTO tools (
      id, slug, name, domain, official_url, category_id, summary, description,
      pricing_type, language, content_updated_date
    ) VALUES ('legacy-tool', 'legacy-tool', '旧版工具', 'legacy.example.com',
      'https://legacy.example.com/', 'chat', '旧版摘要', '旧版详情', 'free', 'zh', '2026-07-01')
  `).run();
  legacy.prepare("INSERT INTO tool_platforms (tool_id, platform, position) VALUES ('legacy-tool', 'web', 0)").run();
  legacy.close();

  const upgraded = openDatabase(upgradePath);
  try {
    const tool = upgraded.prepare("SELECT * FROM tools WHERE id = 'legacy-tool'").get();
    assert.equal(tool.canonical_url, "https://legacy.example.com/");
    assert.equal(tool.data_quality_status, "verified");
    assert.equal(tool.category_sort_order, 1000);
    assert.equal(upgraded.prepare("SELECT name FROM categories WHERE id = 'comic'").get().name, "AI 漫剧");
    assert.equal(upgraded.prepare("SELECT COUNT(*) AS count FROM tool_platforms WHERE tool_id = 'legacy-tool'").get().count, 1);
    assert.equal(upgraded.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    upgraded.close();
  }
});

test("dry-run reports changes and rolls back every catalog row", () => {
  const beforeCount = db.prepare("SELECT COUNT(*) AS count FROM tools").get().count;
  const report = importToolCatalog(db, [designRecord()], {
    provider: "authorized-fixture",
    categoryMapping,
    dryRun: true,
    now: "2026-07-14T00:00:00.000Z"
  });
  assert.equal(report.status, "dry_run");
  assert.equal(report.inserted, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM tools").get().count, beforeCount);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM catalog_import_batches").get().count, 0);
});

test("authorized catalog import is review-first and idempotent", () => {
  const first = importToolCatalog(db, [designRecord()], {
    provider: "authorized-fixture",
    categoryMapping,
    acceptEditorialText: true,
    now: "2026-07-14T00:00:00.000Z"
  });
  assert.equal(first.inserted, 1);
  assert.equal(first.rejected, 0);

  const tool = db.prepare("SELECT * FROM tools WHERE name = ?").get("合规目录示例工具");
  assert.equal(tool.status, "review");
  assert.equal(tool.pricing_type, "unknown");
  assert.equal(tool.language, "unknown");
  assert.equal(tool.canonical_url, "https://product.example.org/");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM tool_sources WHERE tool_id = ?").get(tool.id).count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM tool_features WHERE tool_id = ?").get(tool.id).count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM tool_use_cases WHERE tool_id = ?").get(tool.id).count, 2);

  const second = importToolCatalog(db, [designRecord({
    logoUrl: "https://product.example.org/logo.png",
    summary: "经过独立核验后更新的示例摘要，用于确认来源批次可以安全刷新自有编辑内容。",
    features: "模板辅助|团队协作|品牌设计"
  })], {
    provider: "authorized-fixture",
    categoryMapping,
    acceptEditorialText: true,
    now: "2026-07-14T01:00:00.000Z"
  });
  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM tools WHERE name = ?").get("合规目录示例工具").count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM tool_features WHERE tool_id = ?").get(tool.id).count, 3);
  assert.match(db.prepare("SELECT summary FROM tools WHERE id = ?").get(tool.id).summary, /更新的示例摘要/);
});

test("canonical URL matches an existing curated tool instead of cloning it", () => {
  const beforeCount = db.prepare("SELECT COUNT(*) AS count FROM tools").get().count;
  const report = importToolCatalog(db, [{
    sourceKey: "authorized-chatgpt",
    sourceDetailUrl: "https://catalog.example.org/sites/chatgpt",
    sourceCategory: "AI聊天助手",
    name: "ChatGPT",
    officialUrl: "https://chatgpt.com/?utm_campaign=directory",
    verifiedAt: "2026-07-14"
  }], {
    provider: "authorized-fixture",
    categoryMapping,
    publish: true,
    now: "2026-07-14T02:00:00.000Z"
  });
  assert.equal(report.inserted, 0);
  assert.equal(report.duplicates, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM tools").get().count, beforeCount);
  const source = db.prepare("SELECT tool_id FROM tool_sources WHERE provider = ? AND source_key = ?").get("authorized-fixture", "authorized-chatgpt");
  assert.equal(source.tool_id, "chatgpt");
});

test("unmapped categories and private URLs are rejected without aborting the batch", () => {
  const report = importToolCatalog(db, [
    designRecord({ sourceKey: "bad-category", sourceCategory: "未配置分类", officialUrl: "https://valid.example.com/" }),
    designRecord({ sourceKey: "bad-url", sourceDetailUrl: "https://catalog.example.org/sites/2", officialUrl: "http://127.0.0.1/private" })
  ], {
    provider: "authorized-fixture",
    categoryMapping,
    now: "2026-07-14T03:00:00.000Z"
  });
  assert.equal(report.rejected, 2);
  assert.equal(report.inserted, 0);
  assert.equal(report.errors.length, 2);
});

test("a 1001-tool authorized catalog remains paginable without bloating bootstrap", () => {
  const records = Array.from({ length: 1001 }, (_, index) => ({
    sourceKey: `bulk-${index + 1}`,
    sourceDetailUrl: `https://catalog.example.org/sites/bulk-${index + 1}`,
    sourceCategory: "AI办公工具",
    name: `Bulk Tool ${String(index + 1).padStart(4, "0")}`,
    officialUrl: `https://bulk-${index + 1}.example.com/`,
    pricingType: "unknown",
    language: "unknown",
    platforms: "web",
    verifiedAt: "2026-07-14"
  }));
  const report = importToolCatalog(db, records, {
    provider: "authorized-bulk-fixture",
    categoryMapping,
    publish: true,
    now: "2026-07-14T04:00:00.000Z"
  });
  assert.equal(report.inserted, 1001);
  assert.equal(report.rejected, 0);

  const first = listTools(db, { sponsored: false, sort: "name", limit: 60, offset: 0 });
  const second = listTools(db, { sponsored: false, sort: "name", limit: 60, offset: 60 });
  assert.equal(first.items.length, 60);
  assert.equal(second.items.length, 60);
  assert.ok(first.total >= 1001);
  assert.equal(second.items.some((tool) => first.items.some((candidate) => candidate.id === tool.id)), false);

  const sitemapTools = listSitemapTools(db);
  assert.ok(sitemapTools.length >= 1001);
  assert.ok(sitemapTools.some((tool) => tool.slug === "bulk-tool-1001"));

  const bootstrap = getBootstrap(db);
  assert.equal(Object.hasOwn(bootstrap, "tools"), false);
  assert.ok(JSON.stringify(bootstrap).length < 200_000);
});
