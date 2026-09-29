import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const siteRoot = projectDirectory;
const sourceDirectory = resolve(scriptDirectory, "frontend");
const navigation = JSON.parse(readFileSync(resolve(sourceDirectory, "site-navigation.json"), "utf8"));
const templates = {
  app: readFileSync(resolve(sourceDirectory, "app-navigation-template.html"), "utf8").trim(),
  utility: readFileSync(resolve(sourceDirectory, "utility-navigation-template.html"), "utf8").trim(),
  pricing: readFileSync(resolve(sourceDirectory, "utility-navigation-template.html"), "utf8").trim()
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setAttribute(openingTag, name, value) {
  const attribute = new RegExp(`\\s${name}=(?:"[^"]*"|'[^']*')`, "i");
  const replacement = ` ${name}="${escapeHtml(value)}"`;
  return attribute.test(openingTag)
    ? openingTag.replace(attribute, replacement)
    : openingTag.replace(/>$/, `${replacement}>`);
}

function categoryDropdown() {
  return [
    '<div class="nav-dropdown-wrap">',
    '  <button class="nav-item nav-dropdown-toggle" type="button" aria-haspopup="true" aria-expanded="false">',
    '    分类<i data-lucide="chevron-down" class="dropdown-caret"></i>',
    "  </button>",
    '  <div class="nav-dropdown" id="nav-category-dropdown" hidden></div>',
    "</div>"
  ].join("\n");
}

function renderItems(pageName, page) {
  const visibleItems = navigation.items.filter((item) => item.showOn.includes(page.shell));
  const activeExists = visibleItems.some((item) => item.id === page.active);
  if (!activeExists) throw new Error(`${pageName}: active navigation item "${page.active}" is not available in ${page.shell}`);

  const output = [];
  for (const item of visibleItems) {
    const isActive = item.id === page.active;
    if (page.shell === "app" && item.appView) {
      const activeClass = isActive ? " is-active" : "";
      output.push(`<button class="nav-item${activeClass}" type="button" data-view="${escapeHtml(item.appView)}">${escapeHtml(item.label)}</button>`);
    } else {
      const activeClass = isActive ? " is-active" : "";
      const currentPage = isActive ? ' aria-current="page"' : "";
      output.push(`<a class="nav-item${activeClass}" href="${escapeHtml(item.href)}"${currentPage}>${escapeHtml(item.label)}</a>`);
    }

    if (page.shell === "app" && item.id === "tools") output.push(categoryDropdown());
  }
  return output.join("\n");
}

function renderPageNavigation(pageName, page) {
  const template = templates[page.shell];
  if (!template) throw new Error(`${pageName}: unknown navigation shell "${page.shell}"`);
  const itemToken = "{{items}}";
  if (template.split(itemToken).length !== 2) throw new Error(`${page.shell}: navigation template must contain exactly one ${itemToken}`);
  return template.replace(itemToken, renderItems(pageName, page));
}

function setPageNavigation(html, pageName, page) {
  const navPattern = /<nav\b[^>]*class=["'][^"']*\bsite-nav\b[^"']*["'][^>]*>[\s\S]*?<\/nav>/gi;
  const matches = [...html.matchAll(navPattern)];
  if (matches.length !== 1) throw new Error(`${pageName}: expected one .site-nav block, found ${matches.length}`);

  const nav = matches[0][0];
  const openingTag = nav.match(/^<nav\b[^>]*>/i)?.[0];
  if (!openingTag) throw new Error(`${pageName}: could not read the site navigation opening tag`);

  let updatedOpeningTag = setAttribute(openingTag, "data-site-shell", page.shell);
  updatedOpeningTag = setAttribute(updatedOpeningTag, "data-page", page.active);
  const renderedNavigation = renderPageNavigation(pageName, page);
  const updatedNav = `${updatedOpeningTag}${renderedNavigation}</nav>`;
  return html.slice(0, matches[0].index) + updatedNav + html.slice(matches[0].index + nav.length);
}

for (const [pageName, page] of Object.entries(navigation.pages)) {
  const pagePath = resolve(siteRoot, pageName);
  const relativePagePath = relative(siteRoot, pagePath);
  if (isAbsolute(relativePagePath) || relativePagePath.startsWith("..")) throw new Error(`Refusing to write outside the project root: ${pageName}`);
  const source = readFileSync(pagePath, "utf8");
  const output = setPageNavigation(source, pageName, page);
  if (output !== source) writeFileSync(pagePath, output, "utf8");
}

process.stdout.write(`Updated static navigation in ${Object.keys(navigation.pages).length} pages.\n`);
