import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));
const inputPath = args.input;
const outputPath = args.output;
const concurrency = Math.min(Math.max(Number(args.concurrency || 6), 1), 12);
if (!inputPath || !outputPath) throw new Error("usage: --input <json> --output <json> [--concurrency 6]");

const categoryMap = new Map(Object.entries({
  "chatbot-ai": "chat", "generative-search": "search", "text-writing": "writing",
  "content-summarization": "writing", "nlp-tools": "writing", "ai-translation": "writing",
  "image-editing": "image", "computer-vision": "image", "gan-tools": "image",
  "video-creation": "video", "design-tools": "design", "creative-tools": "design",
  "gaming-ai": "design", "voice-tools": "audio", "voice-cloning": "audio",
  "speech-recognition": "audio", "music-creation": "audio", "code-writing": "coding",
  "data-engineering": "coding", "automation-tools": "agent", "ai-agents": "agent",
  "large-models": "model", "machine-learning": "model", "deep-learning": "model",
  "reinforcement-learning": "model", "learning-tools": "education", "education-training": "education",
  "marketing-tools": "business", "social-media": "business", finance: "business",
  "human-resources": "business", "recruitment-talent": "business", healthcare: "business",
  "health-management": "business", "legal-affairs": "business", "business-management": "business",
  "customer-support": "business", "market-research": "business", "low-code-ai": "office",
  "knowledge-management": "office", "life-assistant": "office", "smart-home": "office",
  "team-collaboration": "office", "meeting-notes": "office", "data-analysis": "office",
  "data-privacy": "detection", "ai-security": "detection", "content-moderation": "detection",
  "content-creation": "writing", "multimodal-ai": "model"
}));

function cleanOfficialUrl(value) {
  const url = new URL(String(value || ""));
  if (!/^https?:$/.test(url.protocol) || /(^|\.)novatools\.cn$/i.test(url.hostname)) return "";
  const tracking = new Set(["via", "fpr", "fp_ref", "ref", "refcode", "invitecode", "atp", "aff", "affiliate", "source"]);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || tracking.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}

function findSoftwareApplication(value, expectedName) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    return value.map((item) => findSoftwareApplication(item, expectedName)).find(Boolean) || null;
  }
  const type = value["@type"];
  if ((type === "SoftwareApplication" || (Array.isArray(type) && type.includes("SoftwareApplication"))) && value.url) {
    const sameName = !value.name || !expectedName || String(value.name).trim().toLowerCase() === String(expectedName).trim().toLowerCase();
    if (sameName) return value;
  }
  for (const child of Object.values(value)) {
    const match = findSoftwareApplication(child, expectedName);
    if (match) return match;
  }
  return null;
}

async function resolveRecord(record) {
  const detailUrl = `https://www.novatools.cn/tools/${encodeURIComponent(record.slug)}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(detailUrl, { headers: { Accept: "text/html", "User-Agent": "NikaiCatalogVerifier/1.0" }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      for (const script of scripts) {
        try {
          const schema = JSON.parse(script[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
          const app = findSoftwareApplication(schema, record.name);
          const officialUrl = cleanOfficialUrl(app?.url);
          if (officialUrl) return { officialUrl, detailUrl, schema: app };
        } catch {}
      }
      throw new Error("official URL missing");
    } catch (error) {
      if (attempt === 1) return { error: error.message, detailUrl };
    } finally {
      clearTimeout(timer);
    }
  }
}

function importRecord(record, resolved) {
  const categories = Array.isArray(record.categories) ? record.categories.map((item) => item.slug) : [];
  const sourceCategory = categories.find((category) => categoryMap.has(category)) || "";
  const categoryId = categoryMap.get(sourceCategory);
  if (!categoryId || !resolved?.officialUrl) return null;
  const schema = resolved.schema || {};
  const languages = Array.isArray(record.languages) ? record.languages : [];
  return {
    sourceKey: record.id || record.slug,
    sourceDetailUrl: resolved.detailUrl,
    officialUrl: resolved.officialUrl,
    logoUrl: record.logo_url || "",
    categoryId,
    sourceCategory,
    name: record.name,
    summary: String(record.brief || schema.description || "").slice(0, 180),
    description: String(schema.description || record.title || record.brief || "").slice(0, 4000),
    pricingType: ["free", "freemium", "trial", "paid"].includes(record.pricing_type) ? record.pricing_type : "unknown",
    language: languages.length === 1 && languages[0] === "zh" ? "zh" : languages.length ? "multi" : "unknown",
    platforms: ["web"],
    updated: "2026-07-17",
    features: Array.isArray(schema.featureList) ? schema.featureList.slice(0, 6) : [],
    useCases: []
  };
}

const source = JSON.parse(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
const limit = Number(args.limit || 0);
const offset = Math.max(Number(args.offset || 0), 0);
const candidates = source.filter((record) => !record.affiliate_url && record.slug && record.name);
const queue = limit > 0 ? candidates.slice(offset, offset + limit) : candidates.slice(offset);
const resolved = new Array(queue.length);
let cursor = 0;
let completed = 0;
async function worker() {
  while (cursor < queue.length) {
    const index = cursor++;
    resolved[index] = await resolveRecord(queue[index]);
    completed += 1;
    if (completed % 100 === 0 || completed === queue.length) console.log(`[novatools] ${completed}/${queue.length}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));

const records = [];
const failures = [];
const seen = new Set();
for (let index = 0; index < queue.length; index += 1) {
  const item = importRecord(queue[index], resolved[index]);
  if (!item) {
    failures.push({ slug: queue[index].slug, name: queue[index].name, reason: resolved[index]?.error || "unmapped category" });
    continue;
  }
  const canonical = cleanOfficialUrl(item.officialUrl).replace(/\/$/, "").toLowerCase();
  if (seen.has(canonical)) continue;
  seen.add(canonical);
  records.push(item);
}
writeFileSync(outputPath, JSON.stringify({ records, failures }, null, 2));
console.log(JSON.stringify({ discovered: queue.length, resolved: records.length, failed: failures.length, outputPath }));
