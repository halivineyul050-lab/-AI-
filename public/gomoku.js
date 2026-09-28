import {SIZE, createBoard, playMove, isWin, isDraw, chooseMove} from '/gomoku-core.mjs';
const $ = id => document.getElementById(id);
let board = createBoard(), turn = 1, history = [], outcome = null, timer = null, generation = 0;
const cells = board.map((_, i) => {
  const cell = document.createElement('button');
  cell.type = 'button'; cell.className = 'gomoku-cell';
  if ([48,56,112,168,176].includes(i)) cell.classList.add('star');
  cell.addEventListener('click', () => { if (!outcome && !($('mode').value === 'ai' && turn === 2)) move(i); });
  cell.addEventListener('keydown', e => {
    const delta = {ArrowUp:-SIZE,ArrowDown:SIZE,ArrowLeft:-1,ArrowRight:1}[e.key];
    if (delta !== undefined) {e.preventDefault(); cells[Math.max(0, Math.min(224, i + delta))].focus();}
  });
  $('board').append(cell); return cell;
});
function render() {
  const ai = $('mode').value === 'ai';
  cells.forEach((cell, i) => {
    cell.innerHTML = board[i] ? `<span class="stone ${board[i] === 1 ? 'black' : 'white'}"></span>` : '';
    cell.classList.toggle('last', history.at(-1) === i);
    cell.setAttribute('aria-label', `${Math.floor(i / SIZE) + 1}行${i % SIZE + 1}列，${board[i] === 1 ? '黑棋' : board[i] === 2 ? '白棋' : '空位'}`);
    cell.setAttribute('aria-disabled', String(Boolean(board[i] || outcome || (ai && turn === 2))));
  });
  $('black-label').textContent = ai ? '你' : '玩家一'; $('white-label').textContent = ai ? '电脑' : '玩家二';
  $('move-count').textContent = `第 ${history.length} 手`;
  $('undo').disabled = !history.length;
  $('status').textContent = outcome === 'draw' ? '这局是和棋' : outcome ? `${outcome === 1 ? '黑棋' : '白棋'}获胜！` : ai ? (turn === 1 ? '轮到你了' : '电脑思考中…') : `轮到${turn === 1 ? '黑棋' : '白棋'}了`;
  $('status-detail').textContent = outcome ? '可以悔棋继续琢磨，或重新开始一局。' : ai && turn === 2 ? '正在寻找下一步好棋。' : '点击空白交叉点落子。';
}
function move(index) {
  if (outcome || !playMove(board, index, turn)) return;
  history.push(index);
  if (isWin(board, index, turn)) outcome = turn;
  else if (isDraw(board)) outcome = 'draw';
  turn = 3 - turn; render();
  if (!outcome && turn === 2 && $('mode').value === 'ai') {
    const token = generation;
    timer = setTimeout(() => { timer = null; if (token !== generation) return; const next = chooseMove(board); if (next !== null) move(next); }, 380);
  }
}
function cancel() { clearTimeout(timer); timer = null; generation++; }
function reset() {cancel(); board = createBoard(); history = []; outcome = null; turn = 1; render();}
$('restart').addEventListener('click', reset);
$('mode').addEventListener('change', reset);
$('undo').addEventListener('click', () => {
  cancel();
  if (!history.length) return;
  const remove = $('mode').value === 'ai' && history.length % 2 === 0 ? 2 : 1;
  for (let i = 0; i < remove; i++) board[history.pop()] = 0;
  outcome = null; turn = history.length % 2 + 1; render();
});
render();
