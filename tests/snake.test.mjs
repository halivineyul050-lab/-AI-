import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, placeFood, tick, turn } from '../snake-core.mjs';
test('food selects free cells and full boards have no food', () => {
  assert.deepEqual(placeFood([{x:0,y:0},{x:1,y:0},{x:0,y:1}], 2, () => 0), {x:1,y:1});
  assert.equal(placeFood([{x:0,y:0}], 1), null);
});
test('rejects reversal and multiple rapid turns in one tick', () => {
  const g = createGame();
  assert.equal(turn(g, 'left'), false);
  assert.equal(turn(g, 'up'), true);
  assert.equal(turn(g, 'left'), false);
  tick(g);
  assert.deepEqual(g.snake[0], {x:10,y:9});
  assert.equal(turn(g, 'left'), true);
});
test('grows and scores when eating, placing food outside body', () => {
  const g = createGame(); g.food = {x:11,y:10}; tick(g, () => 0);
  assert.equal(g.snake.length, 4); assert.equal(g.score, 10);
  assert.ok(!g.snake.some(s => s.x === g.food.x && s.y === g.food.y));
});
test('wall collision ends game and later ticks do not move', () => {
  const g = createGame(); g.snake[0] = {x:19,y:10}; tick(g);
  assert.equal(g.status, 'dead'); const body = JSON.stringify(g.snake); tick(g);
  assert.equal(JSON.stringify(g.snake), body);
});
test('self collision kills, but entering departing tail is legal', () => {
  const g = createGame(); g.direction = 'up';
  g.snake = [{x:2,y:2},{x:3,y:2},{x:3,y:1},{x:2,y:1},{x:1,y:1}];
  tick(g); assert.equal(g.status, 'dead');
  const h = createGame(); h.direction = 'up'; h.snake = g.snake.slice(0,4);
  tick(h); assert.equal(h.status, 'running'); assert.deepEqual(h.snake[0], {x:2,y:1});
});
test('filling last cell wins', () => {
  const g = {size:2,snake:[{x:0,y:0},{x:0,y:1},{x:1,y:1}],direction:'right',queued:null,food:{x:1,y:0},score:0,status:'running'};
  tick(g); assert.equal(g.status, 'won'); assert.equal(g.food, null);
});
