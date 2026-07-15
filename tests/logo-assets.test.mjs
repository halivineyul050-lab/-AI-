import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const catalogDir = resolve(root, "backend", "catalog");
const manifest = JSON.parse(readFileSync(resolve(catalogDir, "tool-logo-manifest-2026-07-15.json"), "utf8"));
const seed = JSON.parse(readFileSync(resolve(root, "backend", "seed-data.json"), "utf8"));
const catalogRecords = readdirSync(catalogDir)
  .filter((name) => /^official-tools-.+-\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .flatMap((name) => JSON.parse(readFileSync(resolve(catalogDir, name), "utf8")));
const records = [...seed.tools, ...catalogRecords];

test("all published catalog definitions use verified local logo assets", () => {
  assert.equal(records.length, 138);
  assert.equal(manifest.length, 138);
  assert.equal(new Set(manifest.map((entry) => `${entry.sourceKind}:${entry.recordId}`)).size, 138);

  const manifestByPath = new Map(manifest.map((entry) => [entry.localPath, entry]));
  records.forEach((record) => {
    assert.match(record.logoUrl, /^\/assets\/tool-logos\/[a-z0-9-]+\.(?:png|jpg|jpeg|webp|ico|svg|gif|avif)$/);
    const entry = manifestByPath.get(record.logoUrl);
    assert.ok(entry, `Manifest 缺少 ${record.name}`);
    assert.match(entry.sourceLogoUrl, /^https:\/\//);
    assert.equal(entry.verifiedAt, "2026-07-15");
    const path = resolve(root, record.logoUrl.slice(1));
    assert.ok(existsSync(path) && statSync(path).isFile(), `${record.name} Logo 文件不存在`);
    const buffer = readFileSync(path);
    assert.equal(buffer.length, entry.bytes);
    assert.equal(createHash("sha256").update(buffer).digest("hex"), entry.sha256);
    if (record.logoUrl.endsWith(".svg")) {
      const svg = buffer.toString("utf8");
      assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bon\w+\s*=|javascript:|(?:xlink:)?href\s*=\s*["']https?:/i);
    }
  });
});

test("logo manifest keeps domain favicon fallbacks visible for editorial follow-up", () => {
  const fallbackCount = manifest.filter((entry) => entry.sourceType === "domain_favicon_fallback").length;
  assert.equal(manifest.filter((entry) => entry.sourceType === "official").length, 136);
  assert.equal(fallbackCount, 2);
  assert.equal(manifest.filter((entry) => entry.sourceType === "generated_monogram_fallback").length, 0);
});
