import { fitCrop, moveCrop, resizeCrop, resizeCropByKey, setCropSize } from './video-crop-core.js?v=20260915-limit-1';
import { validateMask, effectParameters } from './video-mask-core.js?v=20260915-limit-1';
import { VIDEO_EXPORT_TIMEOUT_MS, validateFullVideoMetadata, validateVideoFile } from './video-input-limits.js';

const $=id=>document.getElementById(id);
const video=$('mask-video'), stage=$('mask-stage'), box=$('mask-box'), input=$('mask-file');
const preview=$('mask-preview'), context=preview.getContext('2d');
const effectCanvas=document.createElement('canvas'),effectContext=effectCanvas.getContext('2d');
let file=null, crop=null, width=0, height=0, sourceURL=null, outputURL=null;
let busy=false, worker=null, task=null, loading=null, drag=null, animation=0;
const size=n=>n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
const time=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const cancelled=()=>new DOMException('已取消','AbortError');
const ratio=()=>null;
function status(text='',error=false){$('mask-status').textContent=text;$('mask-status').classList.toggle('error',error);}

function settings(){
  const seconds=id=>$(id).value.trim()===''?NaN:Number($(id).value);
  return validateMask({width,height,duration:video.duration,region:{...crop},
    mode:$('effect-mode').value,strength:Number($('strength').value),start:seconds('mask-start'),end:seconds('mask-end')});
}
function resetSettings(){
  let selected=fitCrop(width,height);
  selected=setCropSize(selected,'width',Math.max(2,width/2),width,height);
  selected=setCropSize(selected,'height',Math.max(2,height/2),width,height);
  crop=moveCrop(selected,(width-selected.width)/2,(height-selected.height)/2,width,height);
  $('effect-mode').value='mosaic';$('strength').value='6';
  $('mask-start').value='0';$('mask-end').value=String(video.duration);
  $('mask-start').max=String(video.duration);$('mask-end').max=String(video.duration);
  render();status();
}

function drawPreview(){
  if(!crop||video.readyState<2||!context)return;
  const scale=Math.min(1,640/width,360/height);
  const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  if(preview.width!==w||preview.height!==h){preview.width=w;preview.height=h;}
  context.imageSmoothingEnabled=true;context.drawImage(video,0,0,w,h);
  let config;
  try{config=settings();}catch{$('active-label').textContent='请检查时间设置';$('active-label').classList.remove('active');return;}
  const active=video.currentTime>=config.start&&video.currentTime<config.end;
  $('active-label').textContent=active?'当前时间：效果生效中':'当前时间：未生效';$('active-label').classList.toggle('active',active);
  if(!active||!effectContext)return;
  const params=effectParameters(config),r=config.region;
  // Browser video dimensions can include an odd pixel; source coords follow the displayed even-sized frame.
  const sx=video.videoWidth/width,sy=video.videoHeight/height;
  if(config.mode==='mosaic'){
    effectCanvas.width=params.gridWidth;effectCanvas.height=params.gridHeight;
    effectContext.imageSmoothingEnabled=true;effectContext.drawImage(video,r.x*sx,r.y*sy,r.width*sx,r.height*sy,0,0,params.gridWidth,params.gridHeight);
    context.imageSmoothingEnabled=false;context.drawImage(effectCanvas,r.x*scale,r.y*scale,r.width*scale,r.height*scale);context.imageSmoothingEnabled=true;
  }else{
    if(!('filter' in effectContext)){$('active-label').textContent='此浏览器不支持模糊预览';return;}
    const ew=Math.max(1,Math.round(r.width*scale)),eh=Math.max(1,Math.round(r.height*scale));
    const padding=Math.ceil(params.radius*scale*3);
    effectCanvas.width=ew+padding*2;effectCanvas.height=eh+padding*2;
    // Extend edge pixels before blurring so original detail does not leak through transparent borders.
    effectContext.filter='none';
    effectContext.drawImage(video,r.x*sx,r.y*sy,r.width*sx,r.height*sy,padding,padding,ew,eh);
    effectContext.drawImage(effectCanvas,padding,padding,1,eh,0,padding,padding,eh);
    effectContext.drawImage(effectCanvas,padding+ew-1,padding,1,eh,padding+ew,padding,padding,eh);
    effectContext.drawImage(effectCanvas,0,padding,effectCanvas.width,1,0,0,effectCanvas.width,padding);
    effectContext.drawImage(effectCanvas,0,padding+eh-1,effectCanvas.width,1,0,padding+eh,effectCanvas.width,padding);
    context.save();context.beginPath();context.rect(r.x*scale,r.y*scale,r.width*scale,r.height*scale);context.clip();
    context.filter=`blur(${Math.max(.5,params.radius*scale)}px)`;
    context.drawImage(effectCanvas,r.x*scale-padding,r.y*scale-padding);context.restore();
  }
}
function render(keepInput=null){
  if(!crop)return;
  box.style.left=`${crop.x/width*100}%`;box.style.top=`${crop.y/height*100}%`;
  box.style.width=`${crop.width/width*100}%`;box.style.height=`${crop.height/height*100}%`;
  for(const key of ['width','height','x','y'])if(keepInput!=='mask-'+key)$('mask-'+key).value=String(crop[key]);
  $('mask-width').max=String(width);$('mask-height').max=String(height);
  $('mask-x').max=String(width-crop.width);$('mask-y').max=String(height-crop.height);
  $('box-size').textContent=`${crop.width} × ${crop.height}`;
  $('strength-value').textContent=`${$('strength').value} / 10`;
  try{
    const s=settings();$('mask-estimate').textContent=`输出 ${width} × ${height} px · ${s.start.toFixed(2)}–${s.end.toFixed(2)} 秒内遮挡 · 保留音频`;
    $('export').disabled=busy;
  }catch(error){$('mask-estimate').textContent=error.message;$('export').disabled=true;}
  box.setAttribute('aria-label',`遮挡区域，${crop.width}乘${crop.height}像素，左${crop.x}上${crop.y}，方向键移动`);
  drawPreview();
}
function clearOutput(){
  $('mask-result').hidden=true;$('output-video').pause();$('output-video').removeAttribute('src');$('output-video').load();
  $('mask-download').removeAttribute('href');if(outputURL)URL.revokeObjectURL(outputURL);outputURL=null;
}
function loadVideo(url,signal){
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',done);video.removeEventListener('error',error);signal.removeEventListener('abort',abort);};
    const done=()=>{cleanup();resolve();};
    const error=()=>{cleanup();reject(new Error('无法读取这个视频，请尝试 MP4（H.264）或 WebM 格式。'));};
    const abort=()=>{cleanup();reject(cancelled());};
    const timer=setTimeout(()=>{cleanup();reject(new Error('读取视频超时，请尝试较小的视频。'));},20000);
    video.addEventListener('loadeddata',done,{once:true});video.addEventListener('error',error,{once:true});signal.addEventListener('abort',abort,{once:true});
    video.src=url;video.load();
  });
}
async function choose(candidate){
  if(!candidate||busy)return;
  loading?.abort();loading=new AbortController();const signal=loading.signal;
  video.pause();drag=null;file=null;crop=null;clearOutput();status();
  $('editor').hidden=true;$('mask-drop').hidden=false;$('mask-fields').disabled=true;$('export').disabled=true;$('reset-mask').disabled=true;
  $('mask-progress-area').hidden=true;preview.style.display='none';$('preview-placeholder').hidden=false;
  $('active-label').textContent='等待选择视频';$('active-label').classList.remove('active');
    $('mask-estimate').textContent='完整画面 · 完整时长 · 保留音频（如有）';
  video.removeAttribute('src');video.load();if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=null;
  try{validateVideoFile(candidate);}catch(error){status(error.message,true);return;}
  if(!candidate.type.startsWith('video/')&&!/\.(mp4|m4v|webm|mov|mkv)$/i.test(candidate.name)){status('请选择视频文件，例如 MP4 或 WebM。',true);return;}
  sourceURL=URL.createObjectURL(candidate);status('正在读取本地视频…');
  try{
    await loadVideo(sourceURL,signal);if(signal.aborted)return;
    validateFullVideoMetadata({duration:video.duration,width:video.videoWidth,height:video.videoHeight});
    width=Math.floor(video.videoWidth/2)*2;height=Math.floor(video.videoHeight/2)*2;
    fitCrop(width,height);file=candidate;resetSettings();
    $('mask-file-name').textContent=file.name;$('mask-file-meta').textContent=`${size(file.size)} · ${width} × ${height} · ${video.duration.toFixed(2)} 秒`;
    stage.style.maxWidth=`${width/height*480}px`;stage.style.marginInline='auto';
    $('scrub').max=String(video.duration);$('scrub').value='0';$('time-label').textContent=`0:00 / ${time(video.duration)}`;
    $('editor').hidden=false;$('mask-drop').hidden=true;$('mask-fields').disabled=false;$('reset-mask').disabled=false;$('export').disabled=false;
    preview.style.display='block';$('preview-placeholder').hidden=true;render();status();
  }catch(error){
    if(signal.aborted)return;
    file=null;crop=null;video.removeAttribute('src');video.load();if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=null;status(error.message,true);
  }
}
function sourcePoint(event){const r=stage.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width*width,y:(event.clientY-r.top)/r.height*height};}
box.addEventListener('pointerdown',event=>{
  if(busy||!crop||event.button!==0)return;
  event.preventDefault();video.pause();const p=sourcePoint(event);
  drag={id:event.pointerId,point:p,crop:{...crop},corner:event.target.closest('[data-corner]')?.dataset.corner||null};
  box.setPointerCapture(event.pointerId);box.focus({preventScroll:true});
});
box.addEventListener('pointermove',event=>{
  if(!drag||busy||event.pointerId!==drag.id)return;
  const p=sourcePoint(event);
  crop=drag.corner?resizeCrop(drag.crop,drag.corner,p.x,p.y,width,height,ratio()):moveCrop(drag.crop,p.x-drag.point.x,p.y-drag.point.y,width,height);
  render();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])box.addEventListener(name,()=>{drag=null;});
box.addEventListener('keydown',event=>{
  if(busy||!crop||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const step=event.shiftKey?10:2;
  const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
  const corner=event.target.dataset.corner;
  crop=corner?resizeCropByKey(crop,corner,dx,dy,width,height,ratio()):moveCrop(crop,dx,dy,width,height);render();
});

$('reset-mask').addEventListener('click',resetSettings);
for(const id of ['effect-mode','strength','mask-start','mask-end'])$(id).addEventListener('input',()=>{render();status();});
$('effect-mode').addEventListener('change',()=>{render();status();});
$('full-duration').addEventListener('click',()=>{$('mask-start').value='0';$('mask-end').value=String(video.duration);render();status();});
$('preview-effect').addEventListener('click',async()=>{
  try{const config=settings();video.currentTime=config.start;await video.play();}
  catch(error){status(error.message||'无法预览视频。',true);}
});
for(const axis of ['width','height'])$('mask-'+axis).addEventListener('change',()=>{
  try{crop=setCropSize(crop,axis,Number($('mask-'+axis).value),width,height,ratio());render();status();}catch(error){render();status(error.message,true);}
});
for(const axis of ['width','height'])$('mask-'+axis).addEventListener('input',()=>{
  const value=Number($('mask-'+axis).value);
  if(!Number.isFinite(value)||value<2)return;
  crop=setCropSize(crop,axis,value,width,height,ratio());render('mask-'+axis);status();
});
for(const axis of ['x','y'])$('mask-'+axis).addEventListener('input',()=>{
  const value=Number($('mask-'+axis).value);
  if(!Number.isFinite(value)||$('mask-'+axis).value==='')return;
  crop=moveCrop(crop,axis==='x'?value-crop.x:0,axis==='y'?value-crop.y:0,width,height);render('mask-'+axis);status();
});
for(const axis of ['x','y'])$('mask-'+axis).addEventListener('change',()=>{
  const value=Number($('mask-'+axis).value);
  if(!Number.isFinite(value)||$('mask-'+axis).value===''){render();status('请输入有效的边距。',true);return;}
  crop=moveCrop(crop,axis==='x'?value-crop.x:0,axis==='y'?value-crop.y:0,width,height);render();status();
});
function tick(){drawPreview();if(!video.paused)animation=requestAnimationFrame(tick);}
video.addEventListener('play',()=>{$('play').textContent='暂停预览';cancelAnimationFrame(animation);tick();});
video.addEventListener('pause',()=>{$('play').textContent='播放预览';cancelAnimationFrame(animation);});
video.addEventListener('timeupdate',()=>{$('scrub').value=String(video.currentTime);$('time-label').textContent=`${time(video.currentTime)} / ${time(video.duration)}`;});
video.addEventListener('seeked',drawPreview);
$('play').addEventListener('click',async()=>{try{if(video.paused)await video.play();else video.pause();}catch{status('无法播放该视频。',true);}});
$('scrub').addEventListener('input',()=>{video.currentTime=Number($('scrub').value);});
input.addEventListener('change',()=>{const f=input.files[0];input.value='';void choose(f);});
$('replace').addEventListener('click',()=>input.click());
for(const name of ['dragover','dragenter'])$('mask-drop').addEventListener(name,event=>{event.preventDefault();$('mask-drop').classList.add('dragging');});
for(const name of ['drop','dragleave'])$('mask-drop').addEventListener(name,event=>{event.preventDefault();$('mask-drop').classList.remove('dragging');});
$('mask-drop').addEventListener('drop',event=>{if(event.dataTransfer.files.length!==1){status('每次请选择一个视频。',true);return;}void choose(event.dataTransfer.files[0]);});
for(const name of ['dragover','drop'])document.addEventListener(name,event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});

function lock(value){
  busy=value;drag=null;$('mask-fields').disabled=value;
  for(const id of ['export','mask-file','reset-mask','replace','play','scrub'])$(id).disabled=value;
  box.setAttribute('aria-disabled',String(value));$('cancel-export').hidden=!value;
}
function encode(buffer,selected,signal){
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(cancelled());return;}
    worker=new Worker('/video-mask-worker.js?v=20260908-2',{type:'module'});
    const clean=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);};
    const fail=error=>{clean();reject(error);};
    const abort=()=>fail(cancelled());
    const timeout=setTimeout(()=>fail(new Error('导出超过 30 分钟，请缩小视频后重试。')),VIDEO_EXPORT_TIMEOUT_MS);
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>fail(new Error('处理资源加载或运行失败，请刷新重试，或使用较小的视频。'));
    worker.onmessage=({data})=>{
      if(data.type==='loading'){$('mask-progress-label').textContent='正在加载本地处理资源…';return;}
      if(data.type==='progress'){
        const percent=Math.max(Number($('mask-progress').value),Math.round(data.progress*100));
        $('mask-progress').value=percent;$('mask-progress-percent').textContent=`${percent}%`;$('mask-progress-label').textContent='正在遮挡并保留音频…';
      }else if(data.type==='done'){clean();resolve(data.output);}
      else if(data.type==='error')fail(new Error(data.message));
    };
    worker.postMessage({input:buffer,settings:selected},[buffer]);
  });
}
$('mask-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!file||!crop)return;
  let selected;try{selected=settings();}catch(error){status(error.message,true);return;}video.pause();clearOutput();task=new AbortController();const signal=task.signal;
  lock(true);status('正在本地处理，视频不会上传。');$('mask-progress-area').hidden=false;
  $('mask-progress').value=0;$('mask-progress-percent').textContent='0%';$('mask-progress-label').textContent='正在读取视频…';
  try{
    const buffer=await file.arrayBuffer();if(signal.aborted)throw cancelled();
    const output=await encode(buffer,selected,signal);if(signal.aborted)throw cancelled();
    const blob=new Blob([output],{type:'video/mp4'});outputURL=URL.createObjectURL(blob);
    $('output-video').src=outputURL;$('mask-download').href=outputURL;$('mask-download').download=`${file.name.replace(/\.[^.]+$/,'')}-masked.mp4`;
    $('output-meta').textContent=`${width} × ${height} px · ${size(blob.size)}`;
    $('result-settings').textContent=`${selected.mode==='mosaic'?'马赛克':'模糊'} · 强度 ${selected.strength}/10 · ${selected.start.toFixed(2)}–${selected.end.toFixed(2)} 秒 · 固定区域`;
    $('mask-result').hidden=false;$('mask-progress').value=100;$('mask-progress-percent').textContent='100%';$('mask-progress-label').textContent='导出完成';
    status('遮挡完成，可以预览并下载 MP4。');$('mask-download').focus({preventScroll:true});
    $('mask-result').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  }catch(error){$('mask-progress-area').hidden=true;status(error.name==='AbortError'?'已取消导出，你可以调整后重新开始。':error.message,error.name!=='AbortError');}
  finally{worker?.terminate();worker=null;task=null;lock(false);}
});
$('cancel-export').addEventListener('click',()=>{task?.abort();worker?.terminate();});
window.addEventListener('pagehide',()=>{loading?.abort();task?.abort();worker?.terminate();video.pause();cancelAnimationFrame(animation);if(sourceURL)URL.revokeObjectURL(sourceURL);clearOutput();});
window.addEventListener('pageshow',event=>{if(event.persisted&&file)void choose(file);});
