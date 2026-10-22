import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
test('pages and navigation regeneration omit the redundant secondary footer', () => {
  for (const name of readdirSync(new URL('../public/', import.meta.url)).filter(name => name.endsWith('.html'))) {
    assert.doesNotMatch(readFileSync(new URL('../public/' + name, import.meta.url), 'utf8'), /<footer\b[^>]*class="site-secondary-footer"/, name);
  }
  const script = readFileSync(new URL('../scripts/build-site-navigation.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /<footer class="site-secondary-footer"/);
});
