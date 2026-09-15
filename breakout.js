import {createGame,launch,movePaddle,step} from './breakout-core.mjs';
const $=id=>document.getElementById(id),canvas=$('breakout'),ctx=canvas.getContext('2d');
let game=createGame(),paused=false,best=0,last=0,previous='';const keys=new Set();
try{const n=Number(localStorage.getItem('nike-breakout-best'));if(Number.isFinite(n)&&n>=0)best=n;}catch{}
function sync(){
  if(game.score>best){best=game.score;try{localStorage.setItem('nike-breakout-best',String(best));}catch{}}
  $('score').textContent=game.score;$('lives').textContent=game.lives;$('remaining').textContent=game.bricks.filter(b=>b.alive).length;$('best').textContent=best;
  $('pause').disabled=game.status!=='playing';$('pause').textContent=paused?'继续':'暂停';
  const mode=paused?'paused':game.status;$('overlay').hidden=mode==='playing';
  if(mode===previous)return;previous=mode;
  const text={ready:[game.lives===3?'打破一点，快乐一点。':'再来一次，稳稳接住。','接住弹球，清空全部砖块即可获胜。每块砖 +100 分。',game.lives===3?'开始游戏 ↗':'再次发球 ↗'],paused:['休息一下，节奏还在。','游戏已暂停，准备好后继续。','继续游戏 ↗'],won:['全部击碎，漂亮！',`50 块霓虹全部清空，本局 ${game.score} 分。`,'再玩一局 ↗'],over:['差一点，下次更好。',`本局得分 ${game.score}，最高纪录 ${best}。`,'再玩一局 ↗']}[mode];
  if(text){$('title').textContent=text[0];$('message').textContent=text[1];$('start').textContent=text[2];$('status').textContent=text[0];}
}
function begin(){if(paused)paused=false;else{if(['won','over'].includes(game.status))game=createGame();launch(game);}last=performance.now();sync();canvas.focus({preventScroll:true});}
function pause(){if(game.status==='playing'){paused=!paused;keys.clear();sync();}}
$('start').onclick=begin;$('pause').onclick=pause;$('restart').onclick=()=>{game=createGame();paused=false;keys.clear();previous='';sync();};
window.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||/BUTTON|A|INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(['ArrowLeft','ArrowRight','a','A','d','D',' ','p','P'].includes(e.key)){e.preventDefault();if(e.repeat&&(e.key===' '||e.key.toLowerCase()==='p'))return;if(e.key===' ')begin();else if(e.key.toLowerCase()==='p')pause();else keys.add(e.key.toLowerCase());}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
function autoPause(){keys.clear();if(game.status==='playing'&&!paused){paused=true;sync();}}
window.addEventListener('blur',autoPause);document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});
function pointer(e){if(paused||!['ready','playing'].includes(game.status))return;const r=canvas.getBoundingClientRect();movePaddle(game,(e.clientX-r.left)*960/r.width);}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointer(e);});canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||canvas.hasPointerCapture(e.pointerId))pointer(e);});
for(const [id,key] of [['left','arrowleft'],['right','arrowright']]){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);keys.add(key);});for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,()=>keys.delete(key));}
function draw(){ctx.fillStyle='#100f1e';ctx.fillRect(0,0,960,540);ctx.strokeStyle='#231e37';ctx.lineWidth=1;for(let x=0;x<960;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,540);ctx.stroke();}for(let y=0;y<540;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(960,y);ctx.stroke();}
  const colors=['#ab7ef4','#9568e6','#795fde','#5692d5','#56cfce'];for(const b of game.bricks){if(!b.alive)continue;ctx.fillStyle=colors[b.row];ctx.shadowBlur=10;ctx.shadowColor=colors[b.row];ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,5);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#ffffff24';ctx.fillRect(b.x+8,b.y+4,b.w-16,2);}
  const p=game.paddle;ctx.fillStyle='#cdb5ff';ctx.shadowBlur=20;ctx.shadowColor='#a875ff';ctx.beginPath();ctx.roundRect(p.x-p.w/2,p.y,p.w,p.h,7);ctx.fill();ctx.fillStyle='#d0fff7';ctx.shadowColor='#75ffee';ctx.beginPath();ctx.arc(game.ball.x,game.ball.y,game.ball.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
}
function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;if(!paused){if(keys.has('arrowleft')||keys.has('a'))movePaddle(game,game.paddle.x-650*dt);if(keys.has('arrowright')||keys.has('d'))movePaddle(game,game.paddle.x+650*dt);step(game,dt);}sync();draw();requestAnimationFrame(frame);}sync();requestAnimationFrame(frame);
