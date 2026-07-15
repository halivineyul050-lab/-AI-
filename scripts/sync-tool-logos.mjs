import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogDir = resolve(root, "backend", "catalog");
const seedPath = resolve(root, "backend", "seed-data.json");
const appPath = resolve(root, "app.js");
const assetDir = resolve(root, "assets", "tool-logos");
const manifestPath = resolve(catalogDir, "tool-logo-manifest-2026-07-15.json");
const verifyOnly = process.argv.includes("--verify");
const refreshAssets = process.argv.includes("--refresh");
const maxBytes = 1_500_000;
const concurrency = 6;
const localLogoPattern = /^\/assets\/tool-logos\/[a-z0-9-]+\.(?:png|jpe?g|webp|ico|svg|gif|avif)$/;
const logoSourceOverrides = {
  notebooklm: { url: "https://notebooklm.google/_/static/branding/v4/light_mode/favicon/apple-touch-icon.png", sourceType: "official" },
  suno: { url: "https://suno.com/favicon.ico", sourceType: "official" },
  perplexity: { url: "https://www.perplexity.ai/favicon.ico", sourceType: "official" },
  "official-uizard": { url: "https://uizard.io/apple-touch-icon.png", sourceType: "official" },
  "official-modal": { url: "https://modal.com/assets/favicon.svg", sourceType: "official" },
  "official-clickup-brain": { url: "https://clickup.com/assets/brain-2/brain.svg", sourceType: "official" },
  "official-zapier-ai": { url: "https://zapier.com/favicon.ico", sourceType: "official" },
  gamma: { url: "https://www.google.com/s2/favicons?domain=gamma.app&sz=128", sourceType: "domain_favicon_fallback" }
};

const catalogFiles = readdirSync(catalogDir)
  .filter((name) => /^official-tools-.+-\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .sort();

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function safeKey(value) {
  const key = String(value || "")
    .toLowerCase()
    .replace(/^official-/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!key) throw new Error(`无法生成 Logo 文件名：${value}`);
  return key;
}

function loadRecords() {
  const seed = readJson(seedPath).tools.map((record) => ({
    ...record,
    recordId: record.id,
    sourceFile: "backend/seed-data.json",
    sourceKind: "seed",
    key: safeKey(record.id)
  }));
  const catalog = catalogFiles.flatMap((file) => readJson(resolve(catalogDir, file)).map((record) => ({
    ...record,
    recordId: record.sourceKey,
    sourceFile: `backend/catalog/${file}`,
    sourceKind: "catalog",
    key: safeKey(record.sourceKey)
  })));
  const records = [...seed, ...catalog];
  const keys = new Set();
  records.forEach((record) => {
    if (keys.has(record.key)) throw new Error(`Logo 文件键重复：${record.key}`);
    keys.add(record.key);
  });
  return records;
}

function detectImage(buffer, contentType = "") {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", contentType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {
    return { extension: "gif", contentType: "image/gif" };
  }
  if (buffer.length >= 4 && buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 1 && buffer[3] === 0) {
    return { extension: "ico", contentType: "image/x-icon" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 12).includes("ftyp") && /(?:avif|avis)/.test(buffer.toString("ascii", 8, 20))) {
    return { extension: "avif", contentType: "image/avif" };
  }
  const text = buffer.subarray(0, Math.min(buffer.length, 16_384)).toString("utf8").trimStart();
  if (/^(?:<\?xml[\s\S]*?>\s*)?<svg\b/i.test(text) || String(contentType).includes("svg")) {
    if (/<script\b|<foreignObject\b|\bon\w+\s*=|javascript:|(?:xlink:)?href\s*=\s*["']https?:/i.test(text)) {
      throw new Error("SVG 包含脚本、事件或外部资源");
    }
    return { extension: "svg", contentType: "image/svg+xml" };
  }
  throw new Error(`响应不是支持的图片（${contentType || "unknown"}）`);
}

async function fetchAsset(url, officialUrl) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
    headers: {
      Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.2",
      Referer: officialUrl,
      "User-Agent": "Mozilla/5.0 (compatible; NikeAIToolDirectory/1.0; logo-verification)"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new Error(`图片超过 ${maxBytes} bytes`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) throw new Error(`图片大小异常：${buffer.length}`);
  const detected = detectImage(buffer, response.headers.get("content-type") || "");
  return { buffer, ...detected, finalUrl: response.url };
}

async function fetchPage(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
      "User-Agent": "Mozilla/5.0 (compatible; NikeAIToolDirectory/1.0; logo-verification)"
    }
  });
  if (!response.ok) throw new Error(`官网 HTML HTTP ${response.status}`);
  const text = await response.text();
  return { html: text.slice(0, 2_000_000), finalUrl: response.url };
}

function tagAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim() || "";
}

function resolveAssetUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function discoverOfficialLogo(record) {
  const candidates = [];
  try {
    const page = await fetchPage(record.officialUrl);
    const linkTags = [...page.html.matchAll(/<link\\b[^>]*>/gi)].map((match) => match[0]);
    linkTags.forEach((tag) => {
      const rel = tagAttribute(tag, "rel").toLowerCase();
      const href = resolveAssetUrl(tagAttribute(tag, "href"), page.finalUrl);
      if (!href) return;
      const sizes = tagAttribute(tag, "sizes");
      const sizeScore = sizes === "any" ? 20 : Math.max(...(sizes.match(/\\d+/g) || [0]).map(Number), 0);
      if (rel.split(/\\s+/).some((part) => ["icon", "shortcut", "apple-touch-icon", "mask-icon"].includes(part))) {
        candidates.push({ url: href, score: 100 + Math.min(sizeScore, 1024) });
      }
      if (rel === "manifest") candidates.push({ url: href, score: 70, manifest: true });
    });
    const metaTags = [...page.html.matchAll(/<meta\\b[^>]*>/gi)].map((match) => match[0]);
    metaTags.forEach((tag) => {
      const property = (tagAttribute(tag, "property") || tagAttribute(tag, "name")).toLowerCase();
      if (property === "og:image") {
        const href = resolveAssetUrl(tagAttribute(tag, "content"), page.finalUrl);
        if (href) candidates.push({ url: href, score: 10 });
      }
    });
  } catch {
    // Many product pages block automated HTML requests; guessed icon paths still get tried.
  }

  const base = (() => {
    try { return new URL(record.officialUrl); } catch { return null; }
  })();
  if (base) {
    ["/favicon.ico", "/favicon.png", "/apple-touch-icon.png", "/favicon.svg", "/logo.png", "/logo.svg"]
      .forEach((path) => candidates.push({ url: new URL(path, base).toString(), score: 40 }));
  }

  const ordered = [...new Map(candidates.map((candidate) => [candidate.url, candidate]))]
    .map(([, candidate]) => candidate)
    .sort((a, b) => b.score - a.score);
  const resolved = [];
  for (const candidate of ordered) {
    if (!candidate.manifest) {
      resolved.push(candidate.url);
      continue;
    }
    try {
      const response = await fetch(candidate.url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/manifest+json,application/json;q=0.9,*/*;q=0.2" }
      });
      if (!response.ok) continue;
      const manifest = await response.json();
      (Array.isArray(manifest.icons) ? manifest.icons : [])
        .sort((a, b) => Math.max(...String(b.sizes || "").match(/\\d+/g)?.map(Number) || [0])
          - Math.max(...String(a.sizes || "").match(/\\d+/g)?.map(Number) || [0]))
        .forEach((icon) => {
          const url = resolveAssetUrl(icon.src, candidate.url);
          if (url) resolved.push(url);
        });
    } catch {
      // Ignore malformed manifests and continue with normal icon candidates.
    }
  }
  return [...new Set(resolved)];
}

function fallbackLogoUrl(record) {
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(record.officialUrl)}&sz=128`;
}

function secondaryFallbackLogoUrl(record) {
  let domain = record.officialUrl;
  try { domain = new URL(record.officialUrl).hostname; } catch {}
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function generatedMonogram(record) {
  const text = String(record.name || "AI").trim();
  const initial = [...text][0] || "AI";
  let hash = 0;
  for (const character of text) hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  const foreground = hue > 45 && hue < 210 ? "#ffffff" : "#172321";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img"><rect width="256" height="256" rx="40" fill="hsl(${hue} 58% 72%)"/><text x="128" y="151" text-anchor="middle" font-family="Arial, sans-serif" font-size="112" font-weight="700" fill="${foreground}">${initial.replace(/[&<>"']/g, "")}</text></svg>`;
  return Buffer.from(svg, "utf8");
}

async function downloadRecord(record, previous) {
  if (!refreshAssets && previous?.localPath && existsSync(resolve(root, previous.localPath.slice(1)))) {
    return previous;
  }
  const override = logoSourceOverrides[record.recordId];
  const explicitSource = override?.url || (String(record.logoUrl || "").startsWith("https://")
    ? record.logoUrl
    : previous?.sourceLogoUrl);
  const attempts = [];
  if (explicitSource) attempts.push({ url: explicitSource, sourceType: override?.sourceType || "official" });
  if (!explicitSource) {
    const discovered = await discoverOfficialLogo(record);
    discovered.forEach((url) => attempts.push({ url, sourceType: "official_discovered" }));
  }
  const fallback = fallbackLogoUrl(record);
  if (!attempts.some((attempt) => attempt.url === fallback)) {
    attempts.push({ url: fallback, sourceType: "domain_favicon_fallback" });
  }
  const secondaryFallback = secondaryFallbackLogoUrl(record);
  if (!attempts.some((attempt) => attempt.url === secondaryFallback)) {
    attempts.push({ url: secondaryFallback, sourceType: "domain_favicon_fallback" });
  }

  let lastError;
  for (const attempt of attempts) {
    try {
      const asset = await fetchAsset(attempt.url, record.officialUrl);
      const fileName = `${record.key}.${asset.extension}`;
      const absolutePath = resolve(assetDir, fileName);
      writeFileSync(absolutePath, asset.buffer);
      return {
        key: record.key,
        name: record.name,
        recordId: record.recordId,
        sourceKind: record.sourceKind,
        sourceFile: record.sourceFile,
        officialUrl: record.officialUrl,
        sourceLogoUrl: attempt.url,
        resolvedSourceLogoUrl: asset.finalUrl,
        sourceType: attempt.sourceType === "official_discovered" ? "official" : attempt.sourceType,
        localPath: `/assets/tool-logos/${fileName}`,
        contentType: asset.contentType,
        bytes: asset.buffer.length,
        sha256: createHash("sha256").update(asset.buffer).digest("hex"),
        verifiedAt: "2026-07-15"
      };
    } catch (error) {
      lastError = error;
    }
  }

  const buffer = generatedMonogram(record);
  const fileName = `${record.key}.svg`;
  const absolutePath = resolve(assetDir, fileName);
  writeFileSync(absolutePath, buffer);
  return {
    key: record.key,
    name: record.name,
    recordId: record.recordId,
    sourceKind: record.sourceKind,
    sourceFile: record.sourceFile,
    officialUrl: record.officialUrl,
    sourceLogoUrl: attempts[0]?.url || fallback,
    resolvedSourceLogoUrl: "",
    sourceType: "generated_monogram_fallback",
    sourceError: lastError?.message || "未知错误",
    localPath: `/assets/tool-logos/${fileName}`,
    contentType: "image/svg+xml",
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    verifiedAt: "2026-07-15"
  };
}

async function runPool(records, worker) {
  const results = new Array(records.length);
  let cursor = 0;
  async function consume() {
    while (cursor < records.length) {
      const index = cursor++;
      results[index] = await worker(records[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, records.length) }, consume));
  return results;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceCatalogLogo(filePath, entries) {
  let source = readFileSync(filePath, "utf8");
  entries.forEach((entry) => {
    const id = escapeRegex(entry.recordId);
    const pattern = new RegExp(`("sourceKey"\\s*:\\s*"${id}"[\\s\\S]*?"logoUrl"\\s*:\\s*")[^"]*(")`);
    if (!pattern.test(source)) throw new Error(`${entry.sourceFile} 缺少 ${entry.recordId} 的 logoUrl 字段`);
    source = source.replace(pattern, `$1${entry.localPath}$2`);
  });
  writeFileSync(filePath, source, "utf8");
}

function replaceSeedLogos(entries) {
  const seed = readJson(seedPath);
  const entryMap = new Map(entries.map((entry) => [entry.recordId, entry.localPath]));
  seed.tools.forEach((tool) => {
    const localPath = entryMap.get(tool.id);
    if (!localPath) throw new Error(`Seed Logo Manifest 缺少 ${tool.id}`);
    tool.logoUrl = localPath;
  });
  writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");

  let app = readFileSync(appPath, "utf8");
  entries.forEach((entry) => {
    const id = escapeRegex(entry.recordId);
    const pattern = new RegExp(`(id:\\s*"${id}"[\\s\\S]*?logoUrl:\\s*")[^"]*(")`);
    if (!pattern.test(app)) throw new Error(`app.js 缺少 ${entry.recordId} 的 logoUrl 字段`);
    app = app.replace(pattern, `$1${entry.localPath}$2`);
  });
  writeFileSync(appPath, app, "utf8");
}

function verify(records, manifest) {
  if (manifest.length !== records.length) throw new Error(`Manifest 数量 ${manifest.length}，应为 ${records.length}`);
  const manifestById = new Map(manifest.map((entry) => [`${entry.sourceKind}:${entry.recordId}`, entry]));
  const hashes = new Set();
  records.forEach((record) => {
    const entry = manifestById.get(`${record.sourceKind}:${record.recordId}`);
    if (!entry) throw new Error(`Manifest 缺少 ${record.name}`);
    if (!localLogoPattern.test(record.logoUrl || "")) throw new Error(`${record.name} 未使用本地 Logo`);
    if (record.logoUrl !== entry.localPath) throw new Error(`${record.name} 的数据路径与 Manifest 不一致`);
    const absolutePath = resolve(root, entry.localPath.slice(1));
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) throw new Error(`${record.name} Logo 文件不存在`);
    const buffer = readFileSync(absolutePath);
    const detected = detectImage(buffer, entry.contentType);
    const digest = createHash("sha256").update(buffer).digest("hex");
    if (digest !== entry.sha256) throw new Error(`${record.name} Logo 哈希不匹配`);
    if (detected.contentType !== entry.contentType) throw new Error(`${record.name} Logo MIME 不匹配`);
    hashes.add(digest);
  });
  return { records: records.length, assets: manifest.length, uniqueHashes: hashes.size };
}

function pruneUnreferencedAssets(manifest) {
  const referenced = new Set(manifest.map((entry) => entry.localPath.split("/").pop()));
  readdirSync(assetDir).forEach((name) => {
    if (!referenced.has(name)) unlinkSync(resolve(assetDir, name));
  });
}

const records = loadRecords();
if (verifyOnly) {
  const manifest = readJson(manifestPath);
  console.log(JSON.stringify(verify(records, manifest), null, 2));
  process.exit(0);
}

mkdirSync(assetDir, { recursive: true });
const previousManifest = existsSync(manifestPath) ? readJson(manifestPath) : [];
const previousById = new Map(previousManifest.map((entry) => [`${entry.sourceKind}:${entry.recordId}`, entry]));
const manifest = await runPool(records, (record) => downloadRecord(
  record,
  previousById.get(`${record.sourceKind}:${record.recordId}`)
));

const seedEntries = manifest.filter((entry) => entry.sourceKind === "seed");
replaceSeedLogos(seedEntries);
for (const file of catalogFiles) {
  const entries = manifest.filter((entry) => entry.sourceFile === `backend/catalog/${file}`);
  replaceCatalogLogo(resolve(catalogDir, file), entries);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
pruneUnreferencedAssets(manifest);

const refreshedRecords = loadRecords();
const report = verify(refreshedRecords, manifest);
console.log(JSON.stringify({
  ...report,
  officialAssets: manifest.filter((entry) => entry.sourceType === "official").length,
  fallbackAssets: manifest.filter((entry) => entry.sourceType === "domain_favicon_fallback").length,
  generatedAssets: manifest.filter((entry) => entry.sourceType === "generated_monogram_fallback").length,
  totalBytes: manifest.reduce((sum, entry) => sum + entry.bytes, 0)
}, null, 2));
