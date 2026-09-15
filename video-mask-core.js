export function validateMask(settings) {
  const { width, height, duration, region, mode, strength, start, end } = settings;
  if (![width,height].every(n=>Number.isInteger(n)&&n>=2&&n<=1920&&n%2===0)
      || !Number.isFinite(duration)||duration<=0||duration>120) throw new Error('请选择 2 分钟以内、最长边不超过 1920px 的视频。');
  if (!region || ![region.x,region.y,region.width,region.height].every(n=>Number.isInteger(n)&&n%2===0)
      || region.x<0||region.y<0||region.width<2||region.height<2
      || region.x+region.width>width||region.y+region.height>height) throw new Error('请将遮挡区域保持在视频画面内。');
  if (!['mosaic','blur'].includes(mode)||!Number.isInteger(strength)||strength<1||strength>10) throw new Error('请选择马赛克或模糊，并设置 1–10 的强度。');
  if (![start,end].every(Number.isFinite)||start<0||end<=start||end>duration) throw new Error('生效结束时间需晚于开始时间，且不能超过视频时长。');
  return settings;
}

export function effectParameters(settings) {
  validateMask(settings);
  const {region,strength}=settings;
  const block=4+strength*4;
  return {
    gridWidth:Math.max(1,Math.floor(region.width/block)),
    gridHeight:Math.max(1,Math.floor(region.height/block)),
    radius:Math.min(strength*2,Math.floor(Math.min(region.width,region.height)/2)),
    chromaRadius:Math.min(strength*2,Math.floor(Math.min(region.width,region.height)/4))
  };
}

export function createMaskCommand(settings) {
  validateMask(settings);
  const {width,height,region:r,mode,start,end}=settings;
  const {gridWidth,gridHeight,radius,chromaRadius}=effectParameters(settings);
  const effect=mode==='mosaic'
    ?`scale=${gridWidth}:${gridHeight}:flags=area,scale=${r.width}:${r.height}:flags=neighbor`
    :`boxblur=luma_radius=${radius}:luma_power=2:chroma_radius=${chromaRadius}:chroma_power=2`;
  const graph=`[0:v:0]scale=${width}:${height},setsar=1,split[base][region];`
    +`[region]crop=${r.width}:${r.height}:${r.x}:${r.y},${effect}[masked];`
    +`[base][masked]overlay=${r.x}:${r.y}:enable='gte(t,${start})*lt(t,${end})'[out]`;
  return ['-i','input.video','-filter_complex',graph,'-map','[out]','-map','0:a:0?',
    '-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k','-map_metadata','-1','-movflags','+faststart','-y','output.mp4'];
}
