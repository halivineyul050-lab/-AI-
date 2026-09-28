export const WIDTH=960, HEIGHT=540;
export function createGame(){
  const bricks=[];for(let row=0;row<5;row++)for(let col=0;col<10;col++)bricks.push({x:45+col*88,y:68+row*34,w:78,h:23,row,alive:true});
  return {paddle:{x:480,y:484,w:132,h:13},ball:{x:480,y:473,r:8,vx:0,vy:0},bricks,score:0,lives:3,status:'ready'};
}
export function launch(g){if(g.status==='ready'){g.status='playing';g.ball.vx=145;g.ball.vy=-335;}}
export function movePaddle(g,x){g.paddle.x=Math.max(g.paddle.w/2,Math.min(WIDTH-g.paddle.w/2,x));if(g.status==='ready')g.ball.x=g.paddle.x;}
export function step(g,dt){
  if(g.status!=='playing')return;
  let remaining=Math.min(Math.max(dt,0),.1);
  while(remaining>0&&g.status==='playing'){
    const b=g.ball,p=g.paddle,h=Math.min(remaining,1/240,3/Math.max(1,Math.hypot(b.vx,b.vy)));remaining-=h;
    const ox=b.x,oy=b.y;b.x+=b.vx*h;b.y+=b.vy*h;
    if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx);}if(b.x>WIDTH-b.r){b.x=WIDTH-b.r;b.vx=-Math.abs(b.vx);}if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy);}
    if(b.vy>0&&oy+b.r<=p.y&&b.y+b.r>=p.y&&b.x+b.r>=p.x-p.w/2&&b.x-b.r<=p.x+p.w/2){
      b.y=p.y-b.r;const angle=Math.max(-1,Math.min(1,(b.x-p.x)/(p.w/2)))*1.05,speed=Math.min(610,Math.hypot(b.vx,b.vy)+5);b.vx=Math.sin(angle)*speed;b.vy=-Math.cos(angle)*speed;
    }
    for(const brick of g.bricks){
      if(!brick.alive||b.x+b.r<brick.x||b.x-b.r>brick.x+brick.w||b.y+b.r<brick.y||b.y-b.r>brick.y+brick.h)continue;
      brick.alive=false;g.score+=100;
      if(oy+b.r<=brick.y){b.y=brick.y-b.r;b.vy=-Math.abs(b.vy);}else if(oy-b.r>=brick.y+brick.h){b.y=brick.y+brick.h+b.r;b.vy=Math.abs(b.vy);}else if(ox<brick.x){b.x=brick.x-b.r;b.vx=-Math.abs(b.vx);}else{b.x=brick.x+brick.w+b.r;b.vx=Math.abs(b.vx);}break;
    }
    if(g.bricks.every(v=>!v.alive)){g.status='won';return;}
    if(b.y-b.r>HEIGHT){g.lives--;g.status=g.lives?'ready':'over';Object.assign(b,{x:p.x,y:p.y-b.r-3,vx:0,vy:0});}
  }
}
