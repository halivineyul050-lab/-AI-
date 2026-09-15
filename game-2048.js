import {createGame,move,undo,canMove} from './game-2048-core.mjs';
const $=id=>document.getElementById(id);
let state=createGame();
let continued=false;
let best=0;
try { const stored=Number(localStorage.getItem('nike-2048-best')); if(Number.isFinite(stored)&&stored>=0) best=stored; } catch {}
const cells=Array.from({length:16},()=>{const cell=document.createElement('div');cell.className='tile';cell.setAttribute('role','gridcell');$('board').append(cell);return cell;});
function render() {
  cells.forEach((cell,i)=>{const value=state.board[i];cell.textContent=value||'';cell.dataset.level=value?Math.min(Math.log2(value),12):0;cell.setAttribute('aria-label',`第 ${Math.floor(i/4)+1} 行第 ${i%4+1} 列：${value||'空'}`);});
  if(state.score>best) {best=state.score;try {localStorage.setItem('nike-2048-best',String(best));} catch {}}
  $('score').textContent=state.score;$('best').textContent=best;
  $('undo').disabled=!state.previous;
  const won=state.board.some(value=>value>=2048)&&!continued;
  const over=!canMove(state.board);
  $('continue').hidden=!won;
  $('status').textContent=won?'太棒了，合出 2048！':over?'棋盘已满，本局结束':'下一步，会更大。';
  $('detail').textContent=won?'可以继续挑战更大的数字，或开始新的一局。':over?'撤销上一步再试试，或重新开始挑战。':'同方向滑动，相同数字相遇就合并。';
  document.querySelectorAll('[data-direction]').forEach(button=>button.disabled=won||over);
}
function play(direction) {
  if(!continued&&state.board.some(value=>value>=2048)) return;
  state=move(state,direction);render();
}
$('restart').addEventListener('click',()=>{state=createGame();continued=false;render();});
$('undo').addEventListener('click',()=>{state=undo(state);render();});
$('continue').addEventListener('click',()=>{continued=true;render();$('board').focus();});
document.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('click',()=>play(button.dataset.direction)));
const keys={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',ArrowUp:'up',w:'up',ArrowDown:'down',s:'down'};
document.addEventListener('keydown',event=>{if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;const direction=keys[event.key]||keys[event.key.toLowerCase()];if(direction){event.preventDefault();play(direction);}});
let pointer=null;
$('board').addEventListener('pointerdown',event=>{if(event.isPrimary===false)return;pointer={x:event.clientX,y:event.clientY,id:event.pointerId};$('board').setPointerCapture(event.pointerId);});
$('board').addEventListener('pointerup',event=>{if(!pointer||pointer.id!==event.pointerId)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;pointer=null;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;play(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');});
$('board').addEventListener('pointercancel',()=>{pointer=null;});
render();
