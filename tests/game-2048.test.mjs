import test from 'node:test';
import assert from 'node:assert/strict';
import { slide, move, createGame, canMove, undo } from '../game-2048-core.mjs';
const grid = (...rows) => rows.flat();
test('each tile merges once and awards resulting values', () => {
  const result = slide(grid([2,2,2,2],[4,4,8,0],[0,0,0,0],[0,0,0,0]), 'left');
  assert.deepEqual(result.board.slice(0,8), [4,4,0,0,8,8,0,0]);
  assert.equal(result.gain,16);
});
test('right up and down respect direction', () => {
  const board = grid([2,0,0,2],[2,0,0,2],[0,0,0,0],[0,0,0,0]);
  assert.deepEqual(slide(board,'right').board.slice(0,4),[0,0,0,4]);
  assert.deepEqual(slide(board,'up').board.slice(0,4),[4,0,0,4]);
  assert.deepEqual(slide(board,'down').board.slice(12),[4,0,0,4]);
});
test('unchanged move never samples randomness or spawns', () => {
  const state={board:[2,...Array(15).fill(0)],score:0,previous:null};
  assert.equal(move(state,'left',()=>{throw Error('random called')}),state);
});
test('changed move spawns exactly one tile and undo restores board and score', () => {
  const state={board:[2,2,...Array(14).fill(0)],score:10,previous:null};
  const next=move(state,'left',()=>0);
  assert.equal(next.board.filter(Boolean).length,2);
  assert.equal(next.score,14);
  assert.deepEqual(undo(next),state);
});
test('2048 merge and blocked board detection', () => {
  assert.equal(slide([1024,1024,...Array(14).fill(0)],'left').board[0],2048);
  const full=grid([2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]);
  assert.equal(canMove(full),false);
  full[0]=4; assert.equal(canMove(full),true);
  full[0]=0; assert.equal(canMove(full),true);
});
test('new game starts with two tiles and zero score', () => {
  const state=createGame(()=>0);
  assert.equal(state.board.filter(Boolean).length,2);
  assert.equal(state.score,0);
});
