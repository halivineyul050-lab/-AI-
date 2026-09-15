export function boundedSize(width,height) {
 if (![width,height].every(n=>Number.isFinite(n)&&n>0)) throw new Error('图片尺寸无效');
 const scale=Math.min(1,4096/width,4096/height,Math.sqrt(16777216/(width*height)));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
export function checkedSize(width,height) {
 if (![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=4096)||width*height>16777216) throw new Error('尺寸须为 1–4096 的整数，最多 1600 万像素');
 return {width,height};
}
export function resizeSize(width,height,value,axis,locked) {
 const w=axis==='width'?value:locked?Math.max(1,Math.round(value*width/height)):width;
 const h=axis==='height'?value:locked?Math.max(1,Math.round(value*height/width)):height;
 return checkedSize(w,h);
}
export function cropRect(rect,width,height) {
 if (![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0) throw new Error('裁剪宽高必须大于 0');
 const x=Math.max(0,Math.min(width-1,Math.round(rect.x))),y=Math.max(0,Math.min(height-1,Math.round(rect.y)));
 return {x,y,width:Math.max(1,Math.min(width-x,Math.round(rect.width))),height:Math.max(1,Math.min(height-y,Math.round(rect.height)))};
}
export function sniffImage(b) {
 if ([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)) return 'image/png';
 if(b[0]===255&&b[1]===216&&b[2]===255) return 'image/jpeg';
 if(b[0]===66&&b[1]===77) return 'image/bmp';
 const s=String.fromCharCode(...b.slice(0,12));
 return s.startsWith('RIFF')&&s.slice(8)==='WEBP'?'image/webp':null;
}
// Fit the entire selection, moving it back inside the image instead of
// truncating one edge (which would break the selected aspect ratio).
export function fitCrop(rect,width,height,ratio=0) {
 if (![rect.x,rect.y,rect.width,rect.height,ratio].every(Number.isFinite)||rect.width<=0||rect.height<=0||ratio<0) throw new Error('请填写有效的裁剪坐标和宽高');
 let w=rect.width,h=ratio?rect.width/ratio:rect.height;
 const scale=Math.min(1,width/w,height/h);w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
 return {x:Math.max(0,Math.min(width-w,Math.round(rect.x))),y:Math.max(0,Math.min(height-h,Math.round(rect.y))),width:w,height:h};
}
