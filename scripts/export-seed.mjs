import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "app.js"), "utf8");

function extractArray(name) {
  const pattern = new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`);
  const match = source.match(pattern);
  if (!match) throw new Error(`Cannot find array: ${name}`);
  return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
}

const data = {
  categories: extractArray("categories"),
  tools: extractArray("tools"),
  tutorials: extractArray("tutorials"),
  newsItems: extractArray("newsItems"),
  collections: extractArray("collections")
};

writeFileSync(resolve(root, "backend", "seed-data.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Exported ${data.tools.length} tools and ${data.tutorials.length + data.newsItems.length} articles.`);
