import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const catalogDir = resolve(root, "backend", "catalog");
const files = readdirSync(catalogDir)
  .filter((name) => /^official-tools-.+-2026-07-14\.json$/.test(name))
  .sort();
const records = files.flatMap((name) => JSON.parse(readFileSync(resolve(catalogDir, name), "utf8")));
const mapping = JSON.parse(readFileSync(resolve(catalogDir, "category-mapping-ai-bot.json"), "utf8"));
const seed = JSON.parse(readFileSync(resolve(root, "backend", "seed-data.json"), "utf8"));

function normalizedUrl(value) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  }
  return url.toString().replace(/\/$/, "").toLowerCase();
}

test("official catalog batch contains 110 independently authored, mapped records", () => {
  assert.equal(files.length, 4);
  assert.equal(records.length, 110);

  const sourceKeys = new Set();
  const names = new Set();
  const officialUrls = new Set();
  const seedNames = new Set(seed.tools.map((tool) => tool.name.trim().toLowerCase()));
  const seedUrls = new Set(seed.tools.map((tool) => normalizedUrl(tool.officialUrl)));
  const pricingValues = new Set(["unknown", "free", "freemium", "trial", "paid", "contact"]);
  const languageValues = new Set(["unknown", "zh", "multi"]);
  const platformValues = new Set(["web", "desktop", "mobile", "api"]);

  records.forEach((record) => {
    assert.match(record.sourceKey, /^official-[a-z0-9-]+$/);
    assert.ok(!sourceKeys.has(record.sourceKey), `重复 sourceKey：${record.sourceKey}`);
    sourceKeys.add(record.sourceKey);

    const normalizedName = record.name.trim().toLowerCase();
    assert.ok(!names.has(normalizedName), `重复工具名称：${record.name}`);
    assert.ok(!seedNames.has(normalizedName), `与种子工具重名：${record.name}`);
    names.add(normalizedName);

    const sourceUrl = new URL(record.sourceDetailUrl);
    const officialUrl = normalizedUrl(record.officialUrl);
    assert.ok(["http:", "https:"].includes(sourceUrl.protocol));
    assert.ok(["http:", "https:"].includes(new URL(record.officialUrl).protocol));
    assert.notEqual(sourceUrl.hostname, "ai-bot.cn");
    assert.ok(!officialUrls.has(officialUrl), `重复官网：${record.officialUrl}`);
    assert.ok(!seedUrls.has(officialUrl), `与种子工具官网重复：${record.officialUrl}`);
    officialUrls.add(officialUrl);

    assert.ok(mapping[record.sourceCategory], `未映射分类：${record.sourceCategory}`);
    assert.ok(pricingValues.has(record.pricingType));
    assert.ok(languageValues.has(record.language));
    assert.ok(Array.isArray(record.platforms) && record.platforms.length >= 1);
    assert.ok(record.platforms.every((platform) => platformValues.has(platform)));
    assert.ok(record.summary.length >= 35 && record.summary.length <= 80, `${record.name} summary 长度异常`);
    assert.ok(record.description.length >= 70 && record.description.length <= 160, `${record.name} description 长度异常`);
    assert.ok(Array.isArray(record.features) && record.features.length >= 2 && record.features.length <= 4);
    assert.ok(Array.isArray(record.useCases) && record.useCases.length >= 1 && record.useCases.length <= 3);
    assert.equal(record.verifiedAt, "2026-07-14");
  });

  const comicRecords = records.filter((record) => mapping[record.sourceCategory] === "comic");
  assert.equal(comicRecords.length, 9);
  assert.ok(comicRecords.every((record) => /^https:\/\//.test(record.logoUrl)), "AI漫剧工具必须提供已核验 Logo URL");
});
