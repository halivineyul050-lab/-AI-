import { createGame, flipCard, settleMismatch } from './memory-game-core.mjs';

const $ = id => document.getElementById(`memory-${id}`);
const symbols = ['✿', '☀', '☾', '★', '♥', '◆', '♣', '♫'];
const names = ['花朵', '太阳', '月亮', '星星', '爱心', '菱形', '三叶草', '音符'];
const colors = ['#c671aa', '#c68f32', '#7e75c5', '#c58d50', '#cc7290', '#6696c1', '#669f8a', '#a477c7'];
let state, buttons, elapsed = 0, started = false, manualPause = false, lastTick = performance.now(), mismatchLeft = 0;
let best = null;
try { const value = Number(localStorage.getItem('nike-memory-best')); if (Number.isInteger(value) && value >= 8) best = value; } catch {}

function render() {
  buttons.forEach((button, i) => {
    const card = state.cards[i];
    const shown = !state.paused && (card.matched || state.selected.includes(i));
    button.textContent = shown ? symbols[card.value] : '✦';
    button.className = `memory-card${shown ? ' revealed' : ''}${card.matched && !state.paused ? ' matched' : ''}`;
    button.style.removeProperty('--symbol-color');
    if (shown) button.style.setProperty('--symbol-color', colors[card.value]);
    button.setAttribute('aria-label', `第 ${i + 1} 张，${shown ? names[card.value] + (card.matched ? '，已配对' : '，已翻开') : '未翻开'}`);
    button.disabled = state.paused || state.won || state.locked || card.matched || state.selected.includes(i);
  });
  $('moves').textContent = state.moves;
  $('pairs').textContent = `${state.matched} / 8`;
  $('pause').textContent = manualPause ? '继续游戏' : '暂停';
  $('pause').disabled = state.won;
  $('best').textContent = best === null ? '最佳纪录：等待你的第一次完成' : `最佳纪录：${best} 步 · 保存在当前浏览器`;
  $('status').textContent = state.won ? '全部找到，默契满分！' : state.paused ? '休息一下，稍后继续' : state.locked ? '再记住它们一会儿' : state.selected.length ? '再翻一张，试试默契' : started ? '下一对，会在哪里？' : '准备好，翻开第一张';
  $('detail').textContent = state.won ? `你用 ${state.moves} 步、${formatTime(elapsed)} 找到了全部 8 对。再来一局，挑战自己的纪录吧。` : state.paused ? '卡片已盖好，用时已暂停。回来后接着找。' : '每次翻开两张卡片，找到全部 8 对即可完成。';
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function tick() {
  const now = performance.now(), delta = now - lastTick;
  lastTick = now;
  if (started && !state.paused && !state.won) {
    elapsed += delta;
    if (state.locked) {
      mismatchLeft -= delta;
      if (mismatchLeft <= 0) { settleMismatch(state); render(); }
    }
  }
  $('time').textContent = formatTime(elapsed);
}

function choose(i) {
  tick();
  const result = flipCard(state, i);
  if (result === 'ignored') return;
  started = true;
  if (result === 'mismatch') mismatchLeft = 1000;
  if (state.won && (best === null || state.moves < best)) {
    best = state.moves;
    try { localStorage.setItem('nike-memory-best', String(best)); } catch {}
  }
  render();
}

function reset() {
  state = createGame();
  elapsed = 0; started = false; manualPause = false; mismatchLeft = 0;
  lastTick = performance.now();
  state.paused = document.hidden;
  buttons = state.cards.map((_, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.addEventListener('click', () => choose(i));
    return button;
  });
  $('board').replaceChildren(...buttons);
  $('time').textContent = '00:00';
  render();
}

$('pause').addEventListener('click', () => {
  tick(); manualPause = !manualPause;
  state.paused = manualPause || document.hidden;
  render();
});
$('reset').addEventListener('click', reset);
document.addEventListener('visibilitychange', () => {
  tick(); state.paused = manualPause || document.hidden; render();
});
reset();
setInterval(tick, 100);
