const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
function dimensions(width, height) {
  if (![width,height].every(Number.isFinite) || width<2 || height<2 || width>1920 || height>1920) throw new Error('视频显示尺寸需在 2–1920px 之间，请先压缩较大的视频。');
}

function fitSize(width, height, maxWidth, maxHeight, ratio) {
  if (ratio !== null && (!Number.isFinite(ratio) || ratio<=0)) throw new Error('裁剪比例无效。');
  let w=Math.min(width,maxWidth), h=Math.min(height,maxHeight);
  if(ratio) { w=Math.min(w,h*ratio); h=w/ratio; }
  return {width:even(w),height:even(h)};
}

export function fitCrop(width,height,ratio=null) {
  dimensions(width,height);
  const size=fitSize(width,height,width,height,ratio);
  return {x:Math.floor((width-size.width)/4)*2,y:Math.floor((height-size.height)/4)*2,...size};
}

export function moveCrop(crop,dx,dy,width,height) {
  return {...crop,x:Math.floor(clamp(crop.x+dx,0,width-crop.width)/2)*2,y:Math.floor(clamp(crop.y+dy,0,height-crop.height)/2)*2};
}

export function resizeCrop(crop,corner,px,py,width,height,ratio=null) {
  const left=corner.includes('w'), top=corner.includes('n');
  const ax=left?crop.x+crop.width:crop.x, ay=top?crop.y+crop.height:crop.y;
  const maxW=left?ax:width-ax, maxH=top?ay:height-ay;
  const w=clamp(left?ax-px:px-ax,2,maxW), h=clamp(top?ay-py:py-ay,2,maxH);
  const size=fitSize(w,h,maxW,maxH,ratio);
  return {x:left?ax-size.width:ax,y:top?ay-size.height:ay,...size};
}

export function setCropSize(crop,axis,value,width,height,ratio=null) {
  if (!Number.isFinite(value) || value<2) throw new Error('宽高至少为 2px，请输入有效数字。');
  let w=axis==='width'?value:crop.width, h=axis==='height'?value:crop.height;
  if(ratio) { if(axis==='width') h=w/ratio; else w=h*ratio; }
  const size=fitSize(w,h,width,height,ratio);
  return moveCrop({...crop,...size},0,0,width,height);
}

export function resizeCropByKey(crop,corner,dx,dy,width,height,ratio=null) {
  const sx=corner.includes('w')?-1:1,sy=corner.includes('n')?-1:1;
  if(ratio) { if(dx)dy=sy*sx*dx/ratio;else dx=sx*sy*dy*ratio; }
  return resizeCrop(crop,corner,(sx<0?crop.x:crop.x+crop.width)+dx,(sy<0?crop.y:crop.y+crop.height)+dy,width,height,ratio);
}

export function createCropCommand(crop,width,height) {
  dimensions(width,height);
  const {x,y,width:w,height:h}=crop;
  if (![x,y,w,h].every(n=>Number.isInteger(n) && n%2===0) || x<0 || y<0 || w<2 || h<2 || x+w>width || y+h>height) throw new Error('裁剪框超出画面或尺寸无效。');
  return ['-i','input.video','-map','0:v:0','-map','0:a:0?',
    '-vf',`scale=${width}:${height},setsar=1,crop=${w}:${h}:${x}:${y}`,
    '-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k','-map_metadata','-1','-movflags','+faststart','-y','output.mp4'];
}
