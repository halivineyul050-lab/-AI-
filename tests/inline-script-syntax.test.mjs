import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import { test } from 'node:test';

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

for (const path of htmlFiles('public')) test(`${path} has parseable inline scripts`, () => {
  const html = readFileSync(path, 'utf8');
  let index = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const type = match[1].match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1].toLowerCase() || '';
    if (!['', 'text/javascript', 'application/javascript', 'module'].includes(type) || !match[2].trim()) continue;
    const filename = `${path}:inline-${++index}`;
    if (type === 'module') {
      const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: match[2], encoding: 'utf8' });
      assert.equal(result.status, 0, `${filename}: ${result.stderr}`);
    } else {
      assert.doesNotThrow(() => new Script(match[2], { filename }), filename);
    }
  }
});
