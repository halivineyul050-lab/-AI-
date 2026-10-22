import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

import { listTools, openDatabase, seedDatabase } from "../backend/database.mjs";

const seedData = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "backend", "seed-data.json"), "utf8"));
let db;
let testDir;

before(() => {
  testDir = mkdtempSync(join(tmpdir(), "nike-ai-tool-hydration-"));
  db = openDatabase(join(testDir, "catalog.db"));
  seedDatabase(db, seedData);
});

after(() => {
  db.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("listTools hydrates a page with one query per relation table", () => {
  const relationQueries = [];
  const countingDb = {
    prepare(sql) {
      if (/FROM tool_(platforms|features|use_cases|badges)\s+WHERE tool_id\s+(?:=|IN\s*\()/i.test(sql)) {
        relationQueries.push(sql);
      }
      return db.prepare(sql);
    }
  };

  const result = listTools(countingDb, { limit: 10, sort: "name" });

  assert.equal(result.items.length, 10);
  assert.equal(relationQueries.length, 4, "each relation table should be read once for the page");
  assert.ok(result.items.every((tool) => Array.isArray(tool.platforms) && Array.isArray(tool.features)
    && Array.isArray(tool.useCases) && Array.isArray(tool.badges)));
  for (const tool of result.items) {
    assert.deepEqual(tool.platforms, db.prepare("SELECT platform FROM tool_platforms WHERE tool_id = ? ORDER BY position").all(tool.id).map((row) => row.platform));
    assert.deepEqual(tool.features, db.prepare("SELECT feature FROM tool_features WHERE tool_id = ? ORDER BY position").all(tool.id).map((row) => row.feature));
    assert.deepEqual(tool.useCases, db.prepare("SELECT use_case FROM tool_use_cases WHERE tool_id = ? ORDER BY position").all(tool.id).map((row) => row.use_case));
    assert.deepEqual(tool.badges, db.prepare("SELECT badge FROM tool_badges WHERE tool_id = ? ORDER BY position").all(tool.id).map((row) => row.badge));
  }
});
