import {validateFullVideoMetadata} from './video-input-limits.js';

export function route(mode) {
  if(mode==='static')return [[-.72,.72],[-.72,.72]];
  if(mode==='diagonal')return [[-.72,.72],[.72,-.72]];
  if(mode==='patrol'){
    const pts=[[-.65,-.78]];
    for(const [cx,cy,angle] of [[.65,-.65,-90],[.65,.65,0],[-.65,.65,90],[-.65,-.65,180]]){
      for(let n=0;n<=16;n++){const a=(angle+n*90/16)*Math.PI/180;pts.push([cx+.13*Math.cos(a),cy+.13*Math.sin(a)]);}
    }
    return pts.map(([x,y])=>[x,-y]);
  }
  if(mode!=='internal')throw new Error('请选择有效的水印运动路径。');
  const anchors=[[-.62,.60],[-.02,.22],[.60,-.30],[.19,-.49],[-.41,.01],[-.20,.51],[.56,.31],[.27,-.13],[-.53,-.46]];
  const padded=[anchors[0],...anchors,anchors.at(-1)],pts=[];
  for(let i=1;i<padded.length-2;i++)for(let n=0;n<25;n++){
    const u=n/25,p=padded.slice(i-1,i+3);
    pts.push([0,1].map(a=>.5*(2*p[1][a]+(-p[0][a]+p[2][a])*u+(2*p[0][a]-5*p[1][a]+4*p[2][a]-p[3][a])*u*u+(-p[0][a]+3*p[1][a]-3*p[2][a]+p[3][a])*u*u*u)));
  }
  return [...pts,anchors.at(-1)];
}

export function buildWatermark(s) {
  validateFullVideoMetadata(s);
  if(![s.logoWidth,s.logoHeight].every(n=>Number.isInteger(n)&&n>0&&n<=8192)
    ||!Number.isFinite(s.size)||s.size<.02||s.size>.4
    ||!Number.isFinite(s.opacity)||s.opacity<.01||s.opacity>1)throw new Error('请检查图片尺寸、水印大小和不透明度。');
  const logoWidth=Math.max(1,Math.round(s.width*s.size));
  const logoHeight=Math.max(1,Math.round(logoWidth*s.logoHeight/s.logoWidth));
  const maxx=.9-logoWidth/s.width,maxy=.9-logoHeight/s.height;
  if(maxx<=0||maxy<=0)throw new Error('水印图片过高，请减小水印宽度，给画面保留安全边距。');
  const points=route(s.mode).map(([x,y])=>({x:(1+x*Math.min(1,maxx/.82))*s.width/2-logoWidth/2,y:(1-y*Math.min(1,maxy/.82))*s.height/2-logoHeight/2,t:0}));
  let total=0;
  for(let i=1;i<points.length;i++){total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);points[i].t=total;}
  points.forEach((p,i)=>{p.t=s.duration*(total?p.t/total:i/(points.length-1));});
  return {...s,logoWidth,logoHeight,points};
}

export function watermarkPosition(plan,time) {
  const t=Math.max(0,Math.min(plan.duration,time)),pts=plan.points;
  const b=pts.findIndex((p,i)=>i>0&&p.t>=t);
  if(b<0)return {x:pts.at(-1).x,y:pts.at(-1).y};
  const a=pts[b-1],end=pts[b],u=end.t===a.t?0:(t-a.t)/(end.t-a.t);
  return {x:a.x+(end.x-a.x)*u,y:a.y+(end.y-a.y)*u};
}

// A sum of clamped linear segments uses the same points as the preview without deep expression nesting.
function expression(points,key){
  const num=n=>Number(n.toFixed(8)).toString();
  let out=num(points[0][key]);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],delta=b[key]-a[key];
    if(Math.abs(delta)<1e-9||b.t===a.t)continue;
    out+=`+(${num(delta)})*clip((t-${num(a.t)})/${num(b.t-a.t)},0,1)`;
  }
  return out;
}

export function createWatermarkCommand(settings){
  const p=buildWatermark(settings);
  const width=Math.floor(p.width/2)*2,height=Math.floor(p.height/2)*2;
  const graph=`[0:v:0]scale=${width}:${height},setsar=1[base];[1:v:0]scale=${p.logoWidth}:${p.logoHeight},format=rgba,colorchannelmixer=aa=${p.opacity}[logo];[base][logo]overlay=x='${expression(p.points,'x')}':y='${expression(p.points,'y')}':eval=frame:eof_action=repeat:format=auto,format=yuv420p[out]`;
  return ['-i','input.video','-i','logo.png','-filter_complex',graph,'-map','[out]','-map','0:a:0?',
    '-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k',
    '-map_metadata','-1','-movflags','+faststart','-y','output.mp4'];
}
