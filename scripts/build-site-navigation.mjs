import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const publicDirectory = resolve(projectDirectory, "public");
const sourceDirectory = resolve(scriptDirectory, "frontend");
const navigation = JSON.parse(readFileSync(resolve(sourceDirectory, "site-navigation.json"), "utf8"));
const templates = {
  app: readFileSync(resolve(sourceDirectory, "app-navigation-template.html"), "utf8").trim(),
  utility: readFileSync(resolve(sourceDirectory, "app-navigation-template.html"), "utf8").trim(),
  pricing: readFileSync(resolve(sourceDirectory, "app-navigation-template.html"), "utf8").trim()
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
    '    AI工具<i data-lucide="chevron-down" class="dropdown-caret"></i>',
    "  </button>",
    '  <div class="nav-dropdown" id="nav-category-dropdown" hidden></div>',
    "</div>"
  ].join("\n");
}

function renderItems(pageName, page) {
  const groups = navigation.groups;
  return groups.map(group => `<details class="nav-more nav-group"><summary class="nav-item${group.active.includes(page.active) ? " is-active" : ""}">${group.label}<i data-lucide="chevron-down" class="dropdown-caret" aria-hidden="true"></i></summary><div class="nav-more-menu">${group.links.map(([href,label]) => `<a href="${href}"${navigation.items.find(item => item.id === page.active)?.href === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</div></details>`).join("\n") + (page.shell === "app" ? '<button class="nav-item" type="button" data-view="news">资讯与教程</button>' : '<a class="nav-item" href="/news">资讯与教程</a>') + `<a class="nav-item${page.active === 'creator' ? ' is-active' : ''}" href="/creator"${page.active === 'creator' ? ' aria-current="page"' : ''}>关于我</a>`;
}

function renderPageNavigation(pageName, page) {
  const template = templates[page.shell];
  if (!template) throw new Error(`${pageName}: unknown navigation shell "${page.shell}"`);
  const itemToken = "{{items}}";
  if (template.split(itemToken).length !== 2) throw new Error(`${page.shell}: navigation template must contain exactly one ${itemToken}`);
  let rendered = template.replace(itemToken, renderItems(pageName, page));
  return rendered;
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

// The homepage is the canonical header. Static tools adapt only their destinations
// and event bindings; menu contents, account controls and icons stay shared.
const headerPattern = /<header\b[^>]*class="[^"]*\bsite-header\b[^"]*"[^>]*>[\s\S]*?<\/header>/;
const homeHeader = readFileSync(resolve(publicDirectory, "index.html"), "utf8").match(headerPattern)?.[0];
if (!homeHeader) throw new Error("index.html: missing canonical header");
const iconPaths = {
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  "circle-plus": '<circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.464.402.807a6.25 6.25 0 0 0 8.268 8.268c.344-.215.83-.004.803.397"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  "columns-3": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  "arrow-right": '<path d="M5 12h14m-7-7 7 7-7 7"/>'
};
function inlineHeaderIcons(html) {
  return html.replace(/<i\b([^>]*data-lucide="([^"]+)"[^>]*)><\/i>/g, (match, attributes, name) => {
    if (!iconPaths[name]) throw new Error(`Unknown shared header icon: ${name}`);
    const cssClass = attributes.match(/class="([^"]+)"/)?.[1];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cssClass ? ` class="${cssClass}"` : ""}>${iconPaths[name]}</svg>`;
  });
}
for (const [pageName, page] of Object.entries(navigation.pages)) {
  const pagePath = resolve(publicDirectory, pageName);
  const relativePagePath = relative(publicDirectory, pagePath);
  if (isAbsolute(relativePagePath) || relativePagePath.startsWith("..")) throw new Error(`Refusing to write outside public/: ${pageName}`);
  const source = readFileSync(pagePath, "utf8");
  let sharedHeader = homeHeader.replace(/class="site-header(?: site-header-shared)?"/, 'class="site-header site-header-shared"');
  if (page.shell !== "app") {
    sharedHeader = sharedHeader
      .replace('href="#tools" data-view-link="tools"', 'href="/"')
      .replace('id="theme-toggle"', 'id="utility-theme"')
      .replace('class="site-header-actions"', 'class="site-header-actions erase-header-actions"')
      .replace('class="icon-button mobile-menu-button" id="mobile-menu-open"', 'class="icon-button mobile-menu-button utility-menu-button" id="utility-menu-open"')
      .replace('href="#directory"', 'href="/#directory"');
  }
  sharedHeader = inlineHeaderIcons(setPageNavigation(sharedHeader, pageName, page));
  if (!headerPattern.test(source)) throw new Error(`${pageName}: missing header`);
  let output = source.replace(headerPattern, sharedHeader);
  // Load the scoped header stylesheet last so a tool's content CSS cannot change it.
  output = output.replace(/\s*<link rel="stylesheet" href="\/site-header\.css\?v=[^"]*">/g, "");
  if (page.shell !== "app") {
    output = output.replace(/\s*<script defer src="\/(?:site-header|header-account)\.js\?v=[^"]*"><\/script>/g, "");
    output = output.replace(/(\/utility-theme\.js)\?v=[^"]*/g, '$1?v=20261012-mobile-nav-1');
    output = output.replace(/(\/utility-theme\.css)\?v=[^"]*/g, '$1?v=20261010-nav-group-1');
    output = output.replace(/<\/head>/i, '<script defer src="/site-header.js?v=20261010-nav-group-1"></script><script defer src="/header-account.js?v=20261012-mobile-nav-1"></script></head>');
  }
  output = output.replace(/<\/head>/i, '<link rel="stylesheet" href="/site-header.css?v=20261012-mobile-nav-1"></head>');
  output = output.replace(/<footer\b[^>]*class="site-secondary-footer"[^>]*>[\s\S]*?<\/footer>/g, '');
  if (output !== source) writeFileSync(pagePath, output, "utf8");
}

process.stdout.write(`Updated static navigation in ${Object.keys(navigation.pages).length} pages.\n`);
