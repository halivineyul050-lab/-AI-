import { createGame, tick, turn, DIRECTIONS } from '/snake-core.mjs';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
let game = createGame(), mode = 'ready', accumulator = 0, previous = 0, best = 0;
try { const value = Number(localStorage.getItem('nike-snake-best')); if (Number.isFinite(value) && value >= 0) best = value; } catch {}
$('best').textContent = best;
function draw() {
  const cell = canvas.width / game.size;
  ctx.fillStyle = '#10271f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ffffff06'; ctx.lineWidth = 1;
  for (let i = 1; i < game.size; i++) { ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke(); }
  if (game.food) {
    ctx.fillStyle = '#ff94ab'; ctx.shadowColor = '#ff94ab'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc((game.food.x + .5) * cell, (game.food.y + .5) * cell, cell * .29, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  game.snake.forEach((part, index) => {
    ctx.fillStyle = index === 0 ? '#c7ff8c' : `hsl(139 46% ${Math.max(32, 65 - index * .7)}%)`;
    ctx.beginPath(); ctx.roundRect(part.x * cell + 2, part.y * cell + 2, cell - 4, cell - 4, index === 0 ? 8 : 5); ctx.fill();
  });
  const head = game.snake[0], [dx, dy] = DIRECTIONS[game.direction];
  ctx.fillStyle = '#153321';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc((head.x + .5 + dx * .19 - dy * side * .18) * cell, (head.y + .5 + dy * .19 + dx * side * .18) * cell, 2.3, 0, Math.PI * 2); ctx.fill(); }
}
function overlay(title, message, button) {
  $('title').textContent = title; $('message').textContent = message; $('start').textContent = button; $('overlay').hidden = false;
}
function start() {
  if (mode !== 'paused') { game = createGame(); $('score').textContent = 0; }
  mode = 'running'; accumulator = 0; previous = performance.now(); $('overlay').hidden = true;
  $('pause').disabled = false; $('restart').disabled = false; $('pause').textContent = '暂停'; canvas.focus({preventScroll:true}); draw();
}
function pause() {
  if (mode === 'paused') return start();
  if (mode !== 'running') return;
  mode = 'paused'; accumulator = 0; $('pause').textContent = '继续'; overlay('歇一会儿', '路线还在，准备好就继续。', '继续游戏 →');
}
function frame(time) {
  if (mode === 'running') {
    accumulator += Math.min(time - previous, 300);
    while (accumulator >= 140 && mode === 'running') {
      accumulator -= 140; tick(game); $('score').textContent = game.score;
      if (game.score > best) { best = game.score; $('best').textContent = best; try { localStorage.setItem('nike-snake-best', String(best)); } catch {} }
      if (game.status !== 'running') { mode = 'ended'; $('pause').disabled = true; overlay(game.status === 'won' ? '你填满了整片绿地！' : '差一点，就再多一口。', `本局 ${game.score} 分 · 历史最佳 ${best} 分`, '再来一局 →'); }
    }
    draw();
  }
  previous = time; requestAnimationFrame(frame);
}
$('start').addEventListener('click', start);
$('pause').addEventListener('click', pause);
$('restart').addEventListener('click', () => { mode = 'ready'; start(); });
const keys = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',a:'left',s:'down',d:'right'};
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (keys[key] && mode === 'running') { event.preventDefault(); turn(game, keys[key]); }
  if ((key === ' ' || key === 'p') && !event.repeat && !/BUTTON|A/.test(event.target.tagName)) { event.preventDefault(); if (mode === 'ready' || mode === 'ended') start(); else pause(); }
});
document.querySelectorAll('[data-dir]').forEach(button => button.addEventListener('click', () => { if (mode === 'running') turn(game, button.dataset.dir); }));
let touch = null;
canvas.addEventListener('pointerdown', event => { touch = {x:event.clientX,y:event.clientY,id:event.pointerId}; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => {
  if (!touch || mode !== 'running') return;
  const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  turn(game, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); touch = null;
});
canvas.addEventListener('pointerup', () => { touch = null; }); canvas.addEventListener('pointercancel', () => { touch = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'running') pause(); });
draw(); requestAnimationFrame(frame);

