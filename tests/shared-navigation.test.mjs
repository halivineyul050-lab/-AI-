import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const config = JSON.parse(readFileSync('scripts/frontend/site-navigation.json', 'utf8'));
const header = (html) => html.match(/<header\b[^>]*class="[^"]*site-header[^\"]*"[\s\S]*?<\/header>/)[0];
const primaryLabels = (html) => [...header(html).matchAll(/<(?:a|button|summary) class="nav-item[^\"]*"[^>]*>([^<]+)/g)].map((match) => match[1].trim());

test('every public navigation shell keeps the homepage menu and account actions', () => {
  const home = readFileSync('public/index.html', 'utf8');
  for (const name of Object.keys(config.pages)) {
    const html = readFileSync(`public/${name}`, 'utf8');
    assert.deepEqual(primaryLabels(html), primaryLabels(home), name);
    for (const entry of ['global-search-input', 'submit-tool-open', 'favorite-toggle', 'compare-open', 'header-login']) {
      assert.ok(header(html).includes(entry), `${name}: ${entry}`);
    }
    assert.match(html, /\/site-header\.css\?v=/, name);
    if (name !== 'index.html') {
      assert.match(html, /\/header-account\.js\?v=/, name);
      assert.match(html, /\/site-header\.js\?v=/, name);
      assert.match(header(html), /class="site-brand" href="\/"/, name);
    }
  }
});

test('secondary destinations highlight their current navigation group without changing menu order', () => {
  for (const [name, destination] of [['image-generation.html', '/image-generation'], ['utilities.html', '/utilities'], ['video-pricing.html', '/video-pricing']]) {
    const markup = header(readFileSync(`public/${name}`, 'utf8'));
    assert.match(markup, /<summary class="nav-item is-active">(?:AI 工具|创作与效率)/);
    assert.ok(markup.includes(`href="${destination}" aria-current="page"`), name);
  }
});

test('regenerating headers repairs drift and is idempotent', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'nikai-navigation-test-'));
  try {
    mkdirSync(resolve(directory, 'scripts/frontend'), { recursive: true });
    mkdirSync(resolve(directory, 'public'));
    for (const file of ['scripts/build-site-navigation.mjs', 'scripts/frontend/site-navigation.json', 'scripts/frontend/app-navigation-template.html', 'scripts/frontend/utility-navigation-template.html', ...Object.keys(config.pages).map((name) => `public/${name}`)]) {
      writeFileSync(resolve(directory, file), readFileSync(file));
    }
    const game = resolve(directory, 'public/games.html');
    writeFileSync(game, readFileSync(game, 'utf8').replace(/<header\b[\s\S]*?<\/header>/, '<header class="site-header"><nav class="site-nav"><a>过期菜单</a></nav></header>'));
    execFileSync(process.execPath, ['scripts/build-site-navigation.mjs'], { cwd: directory });
    assert.deepEqual(primaryLabels(readFileSync(game, 'utf8')), primaryLabels(readFileSync('public/index.html', 'utf8')));
    const first = Object.keys(config.pages).map((name) => readFileSync(resolve(directory, 'public', name), 'utf8'));
    execFileSync(process.execPath, ['scripts/build-site-navigation.mjs'], { cwd: directory });
    assert.deepEqual(Object.keys(config.pages).map((name) => readFileSync(resolve(directory, 'public', name), 'utf8')), first);
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir()));
    assert.ok(directory.startsWith(resolve(tmpdir(), 'nikai-navigation-test-')));
    rmSync(directory, { recursive: true, force: true });
  }
});
