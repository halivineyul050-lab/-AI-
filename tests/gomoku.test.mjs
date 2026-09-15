import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoard, playMove, isWin, isDraw, chooseMove} from '../gomoku-core.mjs';
test('five or more wins in all four directions', () => {
  for (const step of [1, 15, 16, 14]) {
    const b = createBoard();
    for (let k = 0; k < 6; k++) b[34 + step * k] = 1;
    assert.equal(isWin(b, 34, 1), true);
  }
});
test('row wrapping and four stones do not win', () => {
  const b = createBoard(); [13,14,15,16,17].forEach(i => b[i] = 1);
  assert.equal(isWin(b, 14, 1), false);
  const c = createBoard(); [30,31,32,33].forEach(i => c[i] = 2);
  assert.equal(isWin(c, 31, 2), false);
});
test('rejects occupied, out of bounds and invalid moves', () => {
  const b = createBoard(); assert.equal(playMove(b, 0, 1), true);
  for (const i of [0, -1, 225, 1.5]) assert.equal(playMove(b, i, 2), false);
  assert.equal(playMove(b, 1, 3), false);
});
test('AI wins immediately before blocking, leaving input unchanged', () => {
  const b = createBoard(); [30,31,32,33].forEach(i => b[i] = 2); [60,61,62,63].forEach(i => b[i] = 1);
  const copy = [...b]; assert.equal(chooseMove(b), 34); assert.deepEqual(b, copy);
});
test('AI blocks immediate loss and returns legal moves', () => {
  const b = createBoard(); [60,61,62,63].forEach(i => b[i] = 1);
  assert.equal(chooseMove(b), 64);
  assert.equal(chooseMove(createBoard()), 112);
  b[64] = 2; assert.equal(b[chooseMove(b)], 0);
});
test('full board draws and AI cannot move', () => {
  const b = Array(225).fill(1); assert.equal(isDraw(b), true); assert.equal(chooseMove(b), null);
  b[1] = 0; assert.equal(isDraw(b), false);
});
