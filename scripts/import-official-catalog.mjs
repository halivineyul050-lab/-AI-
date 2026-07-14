import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { openDatabase } from "../backend/database.mjs";
import { importToolCatalog, normalizeCatalogRecord } from "../backend/tool-import.mjs";

const root = resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const catalogDir = resolve(root, "backend", "catalog");
const dbPath = resolve(process.env.NIKE_DB_PATH || resolve(root, "data", "nike-ai.db"));
const categoryMapping = JSON.parse(readFileSync(resolve(catalogDir, "category-mapping-ai-bot.json"), "utf8"));
const files = readdirSync(catalogDir)
  .filter((name) => /^official-tools-.+-\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .sort();

if (!files.length) throw new Error("未找到 official-tools-*.json 官方目录文件");

const records = files.flatMap((name) => {
  const value = JSON.parse(readFileSync(resolve(catalogDir, name), "utf8"));
  if (!Array.isArray(value)) throw new Error(`${name} 必须是 JSON 数组`);
  return value.map((record) => ({ ...record, sourceFile: name }));
});

const seenKeys = new Map();
const seenUrls = new Map();
for (const record of records) {
  const sourceKey = String(record.sourceKey || "").trim().toLowerCase();
  const officialUrl = String(record.officialUrl || "").trim().toLowerCase().replace(/\/$/, "");
  if (!sourceKey) throw new Error(`缺少 sourceKey：${record.name || "未命名工具"}`);
  if (!officialUrl) throw new Error(`缺少 officialUrl：${record.name || sourceKey}`);
  if (seenKeys.has(sourceKey)) throw new Error(`重复 sourceKey：${sourceKey}（${seenKeys.get(sourceKey)} / ${record.name}）`);
  if (seenUrls.has(officialUrl)) throw new Error(`重复官网：${officialUrl}（${seenUrls.get(officialUrl)} / ${record.name}）`);
  seenKeys.set(sourceKey, record.name);
  seenUrls.set(officialUrl, record.name);
}

const db = openDatabase(dbPath);
try {
  records.forEach((record) => normalizeCatalogRecord(db, record, {
    provider: "official-sites-20260714",
    categoryMapping,
    acceptEditorialText: true
  }));
  const report = importToolCatalog(db, records, {
    provider: "official-sites-20260714",
    sourceFile: files.join(","),
    categoryMapping,
    publish: true,
    dryRun,
    acceptEditorialText: true
  });
  console.log(JSON.stringify({ files, ...report }, null, 2));
  if (report.rejected) process.exitCode = 2;
} finally {
  db.close();
}
