export function createGame(){return {player:{x:480,y:470,hp:100},enemies:[],bullets:[],time:0,score:0,wave:1,kills:0,spawn:0,fire:0,hurt:0,over:false};}
export function step(g,dt,input={},random=Math.random){
 if(g.over)return;dt=Math.min(.05,Math.max(0,dt));g.time+=dt;g.wave=1+Math.floor(g.time/18);g.hurt=Math.max(0,g.hurt-dt);
 let dx=input.x||0,dy=input.y||0;const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
 g.player.x=Math.max(20,Math.min(940,g.player.x+dx*260*dt));g.player.y=Math.max(20,Math.min(580,g.player.y+dy*260*dt));
 g.spawn-=dt;if(g.spawn<=0&&g.enemies.length<65){const side=Math.floor(random()*4),v=random();g.enemies.push({x:side===0?-15:side===1?975:v*960,y:side===2?-15:side===3?615:v*600,hp:Math.min(4,1+Math.floor(g.wave/4)),r:12+Math.min(g.wave,8),speed:55+Math.min(g.wave*8,110)});g.spawn=Math.max(.24,1.1-g.wave*.075);}
 g.fire-=dt;if(g.fire<=0&&g.enemies.length){const e=g.enemies.reduce((a,b)=>Math.hypot(a.x-g.player.x,a.y-g.player.y)<Math.hypot(b.x-g.player.x,b.y-g.player.y)?a:b);const a=Math.atan2(e.y-g.player.y,e.x-g.player.x);g.bullets.push({x:g.player.x,y:g.player.y,vx:Math.cos(a)*680,vy:Math.sin(a)*680,life:1.6});g.fire=Math.max(.09,.22-g.wave*.008);}
 for(const b of g.bullets){const ox=b.x,oy=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;for(const e of g.enemies){if(e.hp<=0)continue;const vx=b.x-ox,vy=b.y-oy,t=Math.max(0,Math.min(1,((e.x-ox)*vx+(e.y-oy)*vy)/(vx*vx+vy*vy||1)));if(Math.hypot(e.x-ox-vx*t,e.y-oy-vy*t)<e.r+4){e.hp--;b.life=0;if(e.hp<=0){g.kills++;g.score+=100;if(g.kills%12===0)g.player.hp=Math.min(100,g.player.hp+12);}break;}}}
 g.bullets=g.bullets.filter(b=>b.life>0);g.enemies=g.enemies.filter(e=>e.hp>0);
 for(const e of g.enemies){const a=Math.atan2(g.player.y-e.y,g.player.x-e.x);e.x+=Math.cos(a)*e.speed*dt;e.y+=Math.sin(a)*e.speed*dt;if(Math.hypot(e.x-g.player.x,e.y-g.player.y)<e.r+13&&g.hurt<=0){g.player.hp=Math.max(0,g.player.hp-15);g.hurt=.7;}}
 if(g.player.hp<=0)g.over=true;
}
