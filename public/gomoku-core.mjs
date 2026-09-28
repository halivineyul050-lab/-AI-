export const SIZE = 15;
export const createBoard = () => Array(SIZE * SIZE).fill(0);
const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
const inside = (r, c) => r >= 0 && c >= 0 && r < SIZE && c < SIZE;
export function isWin(board, index, player) {
  if (!player || board[index] !== player) return false;
  const r = Math.floor(index / SIZE), c = index % SIZE;
  return directions.some(([dr, dc]) => {
    let count = 1;
    for (const sign of [-1, 1]) {
      let y = r + dr * sign, x = c + dc * sign;
      while (inside(y, x) && board[y * SIZE + x] === player) { count++; y += dr * sign; x += dc * sign; }
    }
    return count >= 5;
  });
}
export function playMove(board, index, player) {
  if (!Number.isInteger(index) || index < 0 || index >= board.length || board[index] || ![1, 2].includes(player)) return false;
  board[index] = player;
  return true;
}
export const isDraw = board => board.every(Boolean);
export function chooseMove(board, player = 2) {
  const empty = board.map((v, i) => v ? -1 : i).filter(i => i >= 0);
  if (!empty.length) return null;
  if (empty.length === SIZE * SIZE) return 112;
  for (const side of [player, 3 - player]) {
    for (const i of empty) {
      board[i] = side;
      const wins = isWin(board, i, side);
      board[i] = 0;
      if (wins) return i;
    }
  }
  function score(i, side) {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    let total = 0;
    for (const [dr, dc] of directions) {
      let count = 1, open = 0;
      for (const sign of [-1, 1]) {
        let y = r + dr * sign, x = c + dc * sign;
        while (inside(y, x) && board[y * SIZE + x] === side) { count++; y += dr * sign; x += dc * sign; }
        if (inside(y, x) && !board[y * SIZE + x]) open++;
      }
      total += open ? Math.pow(8, count) * open : 0;
    }
    return total;
  }
  return empty.reduce((best, i) => {
    const value = score(i, player) + score(i, 3 - player) * 0.95 - Math.hypot(Math.floor(i / SIZE) - 7, i % SIZE - 7);
    return value > best.value ? { i, value } : best;
  }, { i: empty[0], value: -Infinity }).i;
}
