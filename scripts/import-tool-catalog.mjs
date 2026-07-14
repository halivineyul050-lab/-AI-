import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

import { openDatabase } from "../backend/database.mjs";
import { importToolCatalog } from "../backend/tool-import.mjs";

function parseArgs(argv) {
  const result = {
    input: "",
    db: process.env.NIKE_DB_PATH || "./data/nike-ai.db",
    provider: "authorized-export",
    mapping: "./backend/catalog/category-mapping-ai-bot.json",
    publish: false,
    dryRun: false,
    acceptEditorialText: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--publish") result.publish = true;
    else if (value === "--dry-run") result.dryRun = true;
    else if (value === "--accept-editorial-text") result.acceptEditorialText = true;
    else if (["--input", "--db", "--provider", "--mapping"].includes(value)) {
      const next = argv[index + 1];
      if (!next) throw new Error(`${value} 缺少参数`);
      result[value.slice(2)] = next;
      index += 1;
    } else if (value === "--help" || value === "-h") result.help = true;
    else throw new Error(`未知参数：${value}`);
  }
  return result;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((value) => value.trim().replace(/^\uFEFF/, ""));
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function readRecords(inputPath) {
  const text = readFileSync(inputPath, "utf8");
  const extension = extname(inputPath).toLowerCase();
  if (extension === ".csv") return parseCsv(text);
  if (extension === ".ndjson" || extension === ".jsonl") {
    return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.tools)) return parsed.tools;
  throw new Error("JSON 必须是数组或包含 tools 数组的对象");
}

function printHelp() {
  console.log(`
本地授权工具目录导入器

用法：
  npm run catalog:import -- --input <CSV|JSON|NDJSON> [选项]

选项：
  --db <path>                 SQLite 数据库路径
  --provider <name>           数据提供方标识
  --mapping <path>            来源分类映射 JSON
  --dry-run                   在事务中演练并回滚
  --publish                   将新增记录直接发布；默认进入 review
  --accept-editorial-text     明确授权后才导入文件中的摘要与详情

该命令只读取本地文件，不会抓取或绕过第三方网站 robots.txt。
`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}
if (!options.input) {
  printHelp();
  throw new Error("必须提供 --input");
}

const inputPath = resolve(options.input);
const dbPath = resolve(options.db);
const mappingPath = resolve(options.mapping);
const records = readRecords(inputPath);
const categoryMapping = JSON.parse(readFileSync(mappingPath, "utf8"));
const db = openDatabase(dbPath);

try {
  const report = importToolCatalog(db, records, {
    provider: options.provider,
    sourceFile: inputPath,
    categoryMapping,
    dryRun: options.dryRun,
    publish: options.publish,
    acceptEditorialText: options.acceptEditorialText
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.rejected) process.exitCode = 2;
} finally {
  db.close();
}
