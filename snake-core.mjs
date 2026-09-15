export const DIRECTIONS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const same = (a, b) => a.x === b.x && a.y === b.y;
export function placeFood(snake, size, random = Math.random) {
  const free = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!snake.some(segment => same(segment, { x, y }))) free.push({ x, y });
  }
  return free.length ? free[Math.min(free.length - 1, Math.max(0, Math.floor(random() * free.length)))] : null;
}
export function createGame(size = 20, random = Math.random) {
  const middle = Math.floor(size / 2);
  const snake = [{ x: middle, y: middle }, { x: middle - 1, y: middle }, { x: middle - 2, y: middle }];
  return { size, snake, direction: 'right', queued: null, food: placeFood(snake, size, random), score: 0, status: 'running' };
}
export function turn(game, direction) {
  if (game.status !== 'running' || game.queued || !DIRECTIONS[direction]) return false;
  const current = DIRECTIONS[game.direction], next = DIRECTIONS[direction];
  if (direction === game.direction || (current[0] + next[0] === 0 && current[1] + next[1] === 0)) return false;
  game.queued = direction;
  return true;
}
export function tick(game, random = Math.random) {
  if (game.status !== 'running') return game;
  game.direction = game.queued || game.direction;
  game.queued = null;
  const [dx, dy] = DIRECTIONS[game.direction];
  const head = { x: game.snake[0].x + dx, y: game.snake[0].y + dy };
  const eating = game.food && same(head, game.food);
  const body = eating ? game.snake : game.snake.slice(0, -1);
  if (head.x < 0 || head.y < 0 || head.x >= game.size || head.y >= game.size || body.some(segment => same(head, segment))) {
    game.status = 'dead';
    return game;
  }
  game.snake.unshift(head);
  if (eating) {
    game.score += 10;
    game.food = placeFood(game.snake, game.size, random);
    if (!game.food) game.status = 'won';
  } else game.snake.pop();
  return game;
}
