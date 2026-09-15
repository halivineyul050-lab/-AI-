import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const entries = [
  'index.html', 'admin.html', 'auth.html', 'utilities.html',
  'image-edit.html', 'image-background.html', 'image-enhance.html', 'image-erase.html', 'link-extract.html',
  'video-crop.html', 'video-gif.html', 'video-mask.html', 'video-pricing.html',
  'games.html', 'game-2048.html', 'memory-game.html', 'breakout.html', 'snake.html', 'gomoku.html', 'flight.html', 'never-retreat.html'
];

test('every application page loads the shared design system first', () => {
  for (const file of entries) {
    const html = readFileSync(file, 'utf8');
    const shared = html.indexOf('/design-system.css');
    const local = html.search(/(?:styles|admin|auth|utility-theme|image-ai|image-edit|image-erase|link-extract|video-(?:crop|gif|mask)|games|game-2048|memory-game|breakout|snake|gomoku|flight|never-retreat)\.css/);
    assert.ok(shared >= 0, `${file} does not load design-system.css`);
    if (local >= 0) assert.ok(shared < local, `${file} loads its local stylesheet before the design system`);
  }
});

test('shared stylesheet defines both themes, focus and motion contracts', () => {
  const css = readFileSync('design-system.css', 'utf8');
  for (const value of ['#f6f5fb', '#ffffff', '#6558f5', '#11101a', '#1b1927', '#9388ff']) {
    assert.match(css.toLowerCase(), new RegExp(value.replace('#', '#')));
  }
  assert.match(css, /\[data-theme=["']dark["']\]/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('server exposes the shared stylesheet', () => {
  const source = readFileSync('server.mjs', 'utf8');
  assert.match(source, /["']design-system\.css["']/);
  assert.match(source, /["']game-shell\.css["']/);
});

test('pages load one design-system link and games share one outer shell', () => {
  for (const file of entries) {
    const html = readFileSync(file, 'utf8');
    assert.equal((html.match(/design-system\.css/g) || []).length, 1, `${file} should load the design system once`);
  }
  for (const file of ['games.html', 'never-retreat.html', 'snake.html', 'gomoku.html', 'flight.html', 'game-2048.html', 'memory-game.html', 'breakout.html']) {
    assert.match(readFileSync(file, 'utf8'), /game-shell\.css/, `${file} should load the game shell`);
  }
});
