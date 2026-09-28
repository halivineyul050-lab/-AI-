import { fitCrop, moveCrop, resizeCrop, resizeCropByKey, setCropSize } from './video-crop-core.js?v=20260915-limit-1';
import { VIDEO_EXPORT_TIMEOUT_MS, validateFullVideoMetadata, validateVideoFile } from './video-input-limits.js';

const $=id=>document.getElementById(id);
const video=$('crop-video'), stage=$('crop-stage'), box=$('crop-box'), input=$('crop-file');
const preview=$('crop-preview'), context=preview.getContext('2d');
let file=null, crop=null, width=0, height=0, sourceURL=null, outputURL=null;
let busy=false, worker=null, task=null, loading=null, drag=null, animation=0;
const size=n=>n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
const time=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const cancelled=()=>new DOMException('已取消','AbortError');
const ratio=()=> $('ratio').value==='free'?null:$('ratio').value==='original'?width/height:Number($('ratio').value);
function status(text='',error=false){$('crop-status').textContent=text;$('crop-status').classList.toggle('error',error);}

function drawPreview(){
  if(!crop||video.readyState<2||!context)return;
  const scale=Math.min(1,420/crop.width,300/crop.height);
  const w=Math.max(1,Math.round(crop.width*scale)),h=Math.max(1,Math.round(crop.height*scale));
  if(preview.width!==w||preview.height!==h){preview.width=w;preview.height=h;}
  context.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,w,h);
}
function render(keepInput=null){
  if(!crop)return;
  box.style.left=`${crop.x/width*100}%`;box.style.top=`${crop.y/height*100}%`;
  box.style.width=`${crop.width/width*100}%`;box.style.height=`${crop.height/height*100}%`;
  for(const key of ['width','height','x','y'])if(keepInput!=='crop-'+key)$('crop-'+key).value=String(crop[key]);
  $('crop-width').max=String(width);$('crop-height').max=String(height);
  $('crop-x').max=String(width-crop.width);$('crop-y').max=String(height-crop.height);
  $('box-size').textContent=`${crop.width} × ${crop.height}`;
  $('crop-estimate').textContent=`${crop.width} × ${crop.height} px · ${video.duration.toFixed(2)} 秒 · MP4 · 保留音频（如有）`;
  box.setAttribute('aria-label',`裁剪区域，${crop.width}乘${crop.height}像素，左${crop.x}上${crop.y}，方向键移动`);
  drawPreview();
}
function clearOutput(){
  $('crop-result').hidden=true;$('output-video').pause();$('output-video').removeAttribute('src');$('output-video').load();
  $('crop-download').removeAttribute('href');if(outputURL)URL.revokeObjectURL(outputURL);outputURL=null;
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
  $('editor').hidden=true;$('crop-drop').hidden=false;$('crop-fields').disabled=true;$('export').disabled=true;$('reset-crop').disabled=true;
  $('crop-progress-area').hidden=true;preview.style.display='none';$('preview-placeholder').hidden=false;
  $('crop-estimate').textContent='MP4 视频 · 保留原音频（如有）';
  video.removeAttribute('src');video.load();if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=null;
  try{validateVideoFile(candidate);}catch(error){status(error.message,true);return;}
  if(!candidate.type.startsWith('video/')&&!/\.(mp4|m4v|webm|mov|mkv)$/i.test(candidate.name)){status('请选择视频文件，例如 MP4 或 WebM。',true);return;}
  sourceURL=URL.createObjectURL(candidate);status('正在读取本地视频…');
  try{
    await loadVideo(sourceURL,signal);if(signal.aborted)return;
    width=video.videoWidth;height=video.videoHeight;
    validateFullVideoMetadata({duration:video.duration,width,height});
    crop=fitCrop(width,height);file=candidate;$('ratio').value='free';
    $('crop-file-name').textContent=file.name;$('crop-file-meta').textContent=`${size(file.size)} · ${width} × ${height} · ${video.duration.toFixed(2)} 秒`;
    stage.style.maxWidth=`${width/height*480}px`;stage.style.marginInline='auto';
    $('scrub').max=String(video.duration);$('scrub').value='0';$('time-label').textContent=`0:00 / ${time(video.duration)}`;
    $('editor').hidden=false;$('crop-drop').hidden=true;$('crop-fields').disabled=false;$('reset-crop').disabled=false;$('export').disabled=false;
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
$('ratio').addEventListener('change',()=>{crop=fitCrop(width,height,ratio());render();status();});
$('reset-crop').addEventListener('click',()=>{$('ratio').value='free';crop=fitCrop(width,height);render();status();});
for(const axis of ['width','height'])$('crop-'+axis).addEventListener('change',()=>{
  try{crop=setCropSize(crop,axis,Number($('crop-'+axis).value),width,height,ratio());render();status();}catch(error){render();status(error.message,true);}
});
for(const axis of ['width','height'])$('crop-'+axis).addEventListener('input',()=>{
  const value=Number($('crop-'+axis).value);
  if(!Number.isFinite(value)||value<2)return;
  crop=setCropSize(crop,axis,value,width,height,ratio());render('crop-'+axis);status();
});
for(const axis of ['x','y'])$('crop-'+axis).addEventListener('input',()=>{
  const value=Number($('crop-'+axis).value);
  if(!Number.isFinite(value)||$('crop-'+axis).value==='')return;
  crop=moveCrop(crop,axis==='x'?value-crop.x:0,axis==='y'?value-crop.y:0,width,height);render('crop-'+axis);status();
});
for(const axis of ['x','y'])$('crop-'+axis).addEventListener('change',()=>{
  const value=Number($('crop-'+axis).value);
  if(!Number.isFinite(value)||$('crop-'+axis).value===''){render();status('请输入有效的边距。',true);return;}
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
for(const name of ['dragover','dragenter'])$('crop-drop').addEventListener(name,event=>{event.preventDefault();$('crop-drop').classList.add('dragging');});
for(const name of ['drop','dragleave'])$('crop-drop').addEventListener(name,event=>{event.preventDefault();$('crop-drop').classList.remove('dragging');});
$('crop-drop').addEventListener('drop',event=>{if(event.dataTransfer.files.length!==1){status('每次请选择一个视频。',true);return;}void choose(event.dataTransfer.files[0]);});
for(const name of ['dragover','drop'])document.addEventListener(name,event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});

function lock(value){
  busy=value;drag=null;$('crop-fields').disabled=value;
  for(const id of ['export','crop-file','reset-crop','replace','play','scrub'])$(id).disabled=value;
  box.setAttribute('aria-disabled',String(value));$('cancel-export').hidden=!value;
}
function encode(buffer,selected,signal){
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(cancelled());return;}
    worker=new Worker('/video-crop-worker.js',{type:'module'});
    const clean=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);};
    const fail=error=>{clean();reject(error);};
    const abort=()=>fail(cancelled());
    const timeout=setTimeout(()=>fail(new Error('导出超过 30 分钟，请缩小视频后重试。')),VIDEO_EXPORT_TIMEOUT_MS);
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>fail(new Error('处理资源加载或运行失败，请刷新重试，或使用较小的视频。'));
    worker.onmessage=({data})=>{
      if(data.type==='loading'){$('crop-progress-label').textContent='正在加载本地处理资源…';return;}
      if(data.type==='progress'){
        const percent=Math.max(Number($('crop-progress').value),Math.round(data.progress*100));
        $('crop-progress').value=percent;$('crop-progress-percent').textContent=`${percent}%`;$('crop-progress-label').textContent='正在裁剪并保留音频…';
      }else if(data.type==='done'){clean();resolve(data.output);}
      else if(data.type==='error')fail(new Error(data.message));
    };
    worker.postMessage({input:buffer,crop:selected,width,height},[buffer]);
  });
}
$('crop-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!file||!crop)return;
  const selected={...crop};video.pause();clearOutput();task=new AbortController();const signal=task.signal;
  lock(true);status('正在本地处理，视频不会上传。');$('crop-progress-area').hidden=false;
  $('crop-progress').value=0;$('crop-progress-percent').textContent='0%';$('crop-progress-label').textContent='正在读取视频…';
  try{
    const buffer=await file.arrayBuffer();if(signal.aborted)throw cancelled();
    const output=await encode(buffer,selected,signal);if(signal.aborted)throw cancelled();
    const blob=new Blob([output],{type:'video/mp4'});outputURL=URL.createObjectURL(blob);
    $('output-video').src=outputURL;$('crop-download').href=outputURL;$('crop-download').download=`${file.name.replace(/\.[^.]+$/,'')}-cropped.mp4`;
    $('output-meta').textContent=`${selected.width} × ${selected.height} px · ${size(blob.size)}`;
    $('crop-result').hidden=false;$('crop-progress').value=100;$('crop-progress-percent').textContent='100%';$('crop-progress-label').textContent='导出完成';
    status('裁剪完成，可以预览并下载 MP4。');$('crop-download').focus({preventScroll:true});
    $('crop-result').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  }catch(error){$('crop-progress-area').hidden=true;status(error.name==='AbortError'?'已取消导出，你可以调整后重新开始。':error.message,error.name!=='AbortError');}
  finally{worker?.terminate();worker=null;task=null;lock(false);}
});
$('cancel-export').addEventListener('click',()=>{task?.abort();worker?.terminate();});
window.addEventListener('pagehide',()=>{loading?.abort();task?.abort();worker?.terminate();video.pause();cancelAnimationFrame(animation);if(sourceURL)URL.revokeObjectURL(sourceURL);clearOutput();});
window.addEventListener('pageshow',event=>{if(event.persisted&&file)void choose(file);});
