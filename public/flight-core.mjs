export const WIDTH=960, HEIGHT=540;
export function createFlight(){return {player:{x:150,y:270,r:17},hp:3,score:0,time:0,level:1,cooldown:0,spawn:.8,items:[],dead:false};}
export function stepFlight(s,dt,input={},random=Math.random){
 if(s.dead)return;
 dt=Math.max(0,Math.min(.05,dt));s.time+=dt;s.score+=dt*10;s.level=1+Math.floor(s.time/15);s.cooldown=Math.max(0,s.cooldown-dt);
 let x=input.x||0,y=input.y||0;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
 s.player.x=Math.max(22,Math.min(WIDTH-22,s.player.x+x*310*dt));s.player.y=Math.max(22,Math.min(HEIGHT-22,s.player.y+y*310*dt));
 s.spawn-=dt;if(s.spawn<=0){const energy=random()<.3;s.items.push({type:energy?'energy':'rock',x:WIDTH+40,y:35+random()*(HEIGHT-70),r:energy?12:20+random()*18,angle:random()*6});s.spawn=Math.max(.24,.7-s.level*.035);}
 const speed=190+Math.min(250,s.level*22);
 s.items=s.items.filter(item=>{item.x-=speed*dt;item.angle=(item.angle||0)+dt*.6;if(Math.hypot(item.x-s.player.x,item.y-s.player.y)<item.r+s.player.r){if(item.type==='energy')s.score+=100;else if(s.cooldown<=0){s.hp--;s.cooldown=1.4;if(s.hp<=0)s.dead=true;}return false;}return item.x>-60;});
}
