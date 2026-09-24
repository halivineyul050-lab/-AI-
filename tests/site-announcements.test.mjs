import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openDatabase } from "../backend/database.mjs";
import { createSiteAnnouncementStore } from "../backend/site-announcements.mjs";

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "nikai-announcements-"));
  const db = openDatabase(join(directory, "announcements.db"));
  return { db, store: createSiteAnnouncementStore(db), close() { db.close(); rmSync(directory, { recursive: true, force: true }); } };
};

const announcement = (overrides = {}) => ({
  title: "新增 AI 生图功能",
  summary: "现在可以直接在站内创作图片。",
  body: "选择模型并输入提示词即可开始。",
  availableAt: "2026-09-23T00:00:00.000Z",
  buttonLabel: "立即体验",
  buttonUrl: "/image-generation",
  version: 1,
  enabled: true,
  ...overrides
});

test("announcement store hides disabled and future announcements from public reads", () => {
  const f = fixture();
  try {
    const active = f.store.create(announcement());
    f.store.create(announcement({ title: "未来公告", version: 2, availableAt: "2026-10-01T00:00:00.000Z" }));
    f.store.create(announcement({ title: "已停用", version: 3, enabled: false }));
    assert.deepEqual(f.store.listPublished("2026-09-24T00:00:00.000Z").map((item) => item.id), [active.id]);
    assert.equal(f.store.listAdmin().length, 3);
    assert.equal("enabled" in f.store.listPublished()[0], false);
  } finally { f.close(); }
});

test("announcement store updates its version and removes records", () => {
  const f = fixture();
  try {
    const created = f.store.create(announcement());
    const updated = f.store.update(created.id, announcement({ summary: "介绍更新了", version: 2, enabled: false }));
    assert.equal(updated.version, 2);
    assert.equal(updated.enabled, false);
    assert.equal(f.store.listPublished().length, 0);
    assert.equal(f.store.remove(created.id), true);
    assert.equal(f.store.get(created.id), null);
  } finally { f.close(); }
});

test("announcement store rejects unsafe text, dates, versions and button destinations", () => {
  const f = fixture();
  try {
    for (const overrides of [
      { body: "<script>alert(1)</script>" },
      { title: "x" },
      { title: "x".repeat(121) },
      { availableAt: "not a date" },
      { version: 0 },
      { buttonLabel: "体验", buttonUrl: "javascript:alert(1)" },
      { buttonLabel: "体验", buttonUrl: "http://example.com" },
      { buttonLabel: "", buttonUrl: "/image-generation" },
      { buttonLabel: "体验", buttonUrl: "//evil.example" }
    ]) assert.throws(() => f.store.create(announcement(overrides)), { status: 422 });
  } finally { f.close(); }
});

test("site announcement and image edit migrations are registered in order", () => {
  const f = fixture();
  try {
    assert.equal(f.db.prepare("PRAGMA user_version").get().user_version, 17);
    assert.ok(f.db.prepare("SELECT 1 FROM schema_migrations WHERE version = 16 AND name = 'site_announcements'").get());
    assert.ok(f.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'site_announcements'").get());
  } finally { f.close(); }
});
