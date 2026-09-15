import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, flipCard, settleMismatch } from '../memory-game-core.mjs';

test('shuffle preserves exactly eight pairs and uses random choices', () => {
  const a = createGame(() => 0), b = createGame(() => 0.999);
  assert.equal(a.cards.length, 16);
  for (let value = 0; value < 8; value++) assert.equal(a.cards.filter(c => c.value === value).length, 2);
  assert.notDeepEqual(a.cards, b.cards);
});
test('matching excludes same card and counts one move per pair', () => {
  const s = createGame(() => 0.999);
  assert.equal(flipCard(s, 0), 'first');
  assert.equal(flipCard(s, 0), 'ignored');
  assert.equal(flipCard(s, 8), 'match');
  assert.equal(s.moves, 1);
  assert.equal(s.matched, 1);
  assert.equal(flipCard(s, 0), 'ignored');
});
test('mismatch locks third card until settled; paused game rejects input', () => {
  const s = createGame(() => 0.999);
  flipCard(s, 0);
  assert.equal(flipCard(s, 1), 'mismatch');
  assert.equal(flipCard(s, 2), 'ignored');
  assert.equal(s.selected.length, 2);
  settleMismatch(s);
  assert.equal(s.selected.length, 0);
  s.paused = true;
  assert.equal(flipCard(s, 2), 'ignored');
});
test('all pairs produce a win in eight moves', () => {
  const s = createGame(() => 0.999);
  for (let i = 0; i < 8; i++) { flipCard(s, i); flipCard(s, i + 8); }
  assert.equal(s.won, true);
  assert.equal(s.moves, 8);
  assert.equal(flipCard(s, -1), 'ignored');
});
