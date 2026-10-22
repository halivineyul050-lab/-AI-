import {buildWatermark,watermarkPosition} from './video-watermark-core.js?v=20261021-2';
import {validateVideoFile,validateFullVideoMetadata,VIDEO_EXPORT_TIMEOUT_MS} from './video-input-limits.js';

const $=id=>document.getElementById(id),video=$('watermark-source'),canvas=$('watermark-preview'),ctx=canvas.getContext('2d');
let file=null,logo=null,logoBlob=null,sourceURL=null,resultURL=null,worker=null,exportAbort=null,busy=false,videoVersion=0,logoVersion=0,animation=0,videoLoading=null,disposed=false;
const status=(text='',error=false)=>{$('watermark-status').textContent=text;$('watermark-status').classList.toggle('error',error);};
const config=()=>({width:video.videoWidth,height:video.videoHeight,duration:video.duration,logoWidth:logo.width,logoHeight:logo.height,mode:$('watermark-mode').value,size:Number($('watermark-size').value)/100,opacity:Number($('watermark-opacity').value)/100});
function clearResult(){
  $('watermark-result').hidden=true;$('watermark-output').pause();$('watermark-output').removeAttribute('src');$('watermark-output').load();
  $('watermark-download').removeAttribute('href');if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;
}
function draw(){
  if(!file||video.readyState<2)return;
  const scale=Math.min(1,900/video.videoWidth,520/video.videoHeight);
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  if(logo){try{const plan=buildWatermark(config()),p=watermarkPosition(plan,video.currentTime);ctx.save();ctx.globalAlpha=plan.opacity;ctx.drawImage(logo,p.x*scale,p.y*scale,plan.logoWidth*scale,plan.logoHeight*scale);ctx.restore();}catch{}}
  $('watermark-time').textContent=`${video.currentTime.toFixed(1)} / ${video.duration.toFixed(1)} 秒`;$('watermark-scrub').value=String(video.currentTime);
}
function update(){
  $('watermark-size-value').value=`${$('watermark-size').value}%`;$('watermark-opacity-value').value=`${$('watermark-opacity').value}%`;
  $('watermark-export').disabled=true;
  if(file&&logo){try{const p=buildWatermark(config());$('watermark-estimate').textContent=`水印 ${p.logoWidth} × ${p.logoHeight} px · MP4 · 保留原音频（如有）`;$('watermark-export').disabled=busy;}catch(error){status(error.message,true);}}
  draw();
}
function resetVideo(){
  file=null;video.pause();video.removeAttribute('src');video.load();if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=null;
  canvas.hidden=true;$('watermark-placeholder').hidden=false;$('watermark-play').disabled=true;$('watermark-scrub').disabled=true;$('watermark-play').textContent='播放预览';
}
function loadVideo(url,signal){
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',done);video.removeEventListener('error',fail);signal.removeEventListener('abort',abort);};
    const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('无法播放此视频，请尝试 MP4/H.264。'));},abort=()=>{cleanup();reject(new DOMException('已取消','AbortError'));};
    const timer=setTimeout(()=>{cleanup();reject(new Error('视频读取超时。'));},20000);
    video.addEventListener('loadeddata',done,{once:true});video.addEventListener('error',fail,{once:true});signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}video.src=url;video.load();
  });
}
function prepareVideo(input,signal){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(result);};
    const abort=()=>finish(new DOMException('已取消','AbortError'));
    const timer=setTimeout(()=>{worker?.terminate();finish(new Error('兼容转换超时，请尝试较短或较小的视频。'));},VIDEO_EXPORT_TIMEOUT_MS);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    try{
      worker=new Worker(new URL('./video-watermark-worker.js?v=20261021-3',import.meta.url),{type:'module'});
      worker.onerror=()=>finish(new Error('视频引擎加载失败，请刷新重试。'));
      worker.onmessage=({data})=>{
        if(data.type==='loading')$('watermark-progress-label').textContent='正在加载兼容转换引擎…';
        else if(data.type==='progress'){$('watermark-progress').value=data.progress*100;$('watermark-progress-label').textContent=`正在兼容转换 ${Math.round(data.progress*100)}%`;}
        else if(data.type==='done')finish(null,data.output);
        else if(data.type==='error')finish(new Error(data.message));
      };
      worker.postMessage({type:'prepare',input},[input]);
    }catch(error){finish(error);}
  });
}
async function chooseVideo(candidate){
  if(!candidate||busy)return;let converted=false;const version=++videoVersion;videoLoading?.abort();videoLoading=new AbortController();
  resetVideo();clearResult();update();
  try{
    validateVideoFile(candidate);
    if(!candidate.type.startsWith('video/')&&!/\.(mp4|m4v|webm|mov|mkv)$/i.test(candidate.name))throw new Error('请选择视频文件，例如 MP4 或 WebM。');
    status('正在读取本地视频…');sourceURL=URL.createObjectURL(candidate);
    try{await loadVideo(sourceURL,videoLoading.signal);}catch(error){
      if(error.name==='AbortError')throw error;
      lock(true);exportAbort=new AbortController();
      $('watermark-progress-area').hidden=false;$('watermark-progress').value=0;
      status('浏览器无法直接播放此编码，正在本地转换为兼容 MP4…');
      try{
        const input=await candidate.arrayBuffer();
        const output=await prepareVideo(input,exportAbort.signal);
        if(version!==videoVersion||disposed)return;
        URL.revokeObjectURL(sourceURL);
        candidate=new File([output],candidate.name,{type:'video/mp4'});
        sourceURL=URL.createObjectURL(candidate);
        await loadVideo(sourceURL,exportAbort.signal);converted=true;
      }finally{worker?.terminate();worker=null;exportAbort=null;lock(false);$('watermark-progress-area').hidden=true;}
    }
    if(version!==videoVersion||disposed)return;
    validateFullVideoMetadata({duration:video.duration,width:video.videoWidth,height:video.videoHeight});
    file=candidate;canvas.hidden=false;$('watermark-placeholder').hidden=true;$('watermark-play').disabled=false;$('watermark-scrub').disabled=false;$('watermark-scrub').max=String(video.duration);
    $('watermark-video-label').textContent=`${candidate.name} · ${video.videoWidth} × ${video.videoHeight}`;status(converted?'兼容转换完成，可以播放预览并添加水印。':'');update();
  }catch(error){if(version===videoVersion&&!disposed){resetVideo();update();status(error.name==='AbortError'?'已取消视频读取，可重新选择视频。':error.message,error.name!=='AbortError');}}
}
async function chooseLogo(candidate){
  if(!candidate||busy)return;const version=++logoVersion;logo?.close();logo=null;logoBlob=null;clearResult();update();
  try{
    if(!candidate.size||candidate.size>10*1024*1024||!['image/png','image/jpeg','image/webp'].includes(candidate.type))throw new Error('请选择 10MB 以内的 PNG、JPG 或 WebP 图片。');
    const bitmap=await createImageBitmap(candidate);
    if(version!==logoVersion||disposed){bitmap.close();return;}
    if(bitmap.width>8192||bitmap.height>8192){bitmap.close();throw new Error('水印图片最长边不能超过 8192px。');}
    const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const context=c.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);bitmap.close();
    const pixels=context.getImageData(0,0,c.width,c.height).data;let visible=false;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]){visible=true;break;}
    if(!visible)throw new Error('这张图片完全透明，请换一张有可见内容的水印图片。');
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    if(version!==logoVersion||disposed)return;if(!blob)throw new Error('图片转换失败，请换一张图片。');
    const prepared=await createImageBitmap(blob);if(version!==logoVersion||disposed){prepared.close();return;}
    logo=prepared;logoBlob=blob;$('watermark-logo-label').textContent=`${candidate.name} · ${logo.width} × ${logo.height}`;status();update();
  }catch(error){if(version===logoVersion&&!disposed){$('watermark-logo-label').textContent='PNG / JPG / WebP · 最多 10MB';status(error.message,true);}}
}
$('watermark-video-file').addEventListener('change',e=>{void chooseVideo(e.target.files[0]);e.target.value='';});
$('watermark-logo-file').addEventListener('change',e=>{void chooseLogo(e.target.files[0]);e.target.value='';});
for(const [id,choose] of [['watermark-video-drop',chooseVideo],['watermark-logo-drop',chooseLogo]]){
  const drop=$(id);drop.addEventListener('dragover',e=>e.preventDefault());drop.addEventListener('drop',e=>{e.preventDefault();if(!busy)void choose(e.dataTransfer.files[0]);});
}
for(const id of ['watermark-mode','watermark-size','watermark-opacity'])$(id).addEventListener('input',()=>{status();clearResult();update();});
$('watermark-reset').addEventListener('click',()=>{$('watermark-mode').value='internal';$('watermark-size').value='12';$('watermark-opacity').value='40';status();clearResult();update();});
$('watermark-play').addEventListener('click',async()=>{if(video.paused){if(video.ended)video.currentTime=0;try{await video.play();}catch(error){status(error.message,true);}}else video.pause();});
$('watermark-scrub').addEventListener('input',e=>{video.pause();video.currentTime=Number(e.target.value);});
video.addEventListener('seeked',draw);video.addEventListener('loadeddata',draw);video.addEventListener('timeupdate',draw);
video.addEventListener('play',()=>{$('watermark-play').textContent='暂停预览';const tick=()=>{draw();if(!video.paused)animation=requestAnimationFrame(tick);};cancelAnimationFrame(animation);tick();});
video.addEventListener('pause',()=>{$('watermark-play').textContent='播放预览';cancelAnimationFrame(animation);draw();});
function lock(value){busy=value;$('watermark-fields').disabled=value;for(const id of ['watermark-video-file','watermark-logo-file','watermark-reset'])$(id).disabled=value;$('watermark-cancel').hidden=!value;update();}
$('watermark-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!file||!logoBlob)return;
  let settings;try{settings=config();buildWatermark(settings);}catch(error){status(error.message,true);return;}
  video.pause();clearResult();lock(true);exportAbort=new AbortController();const signal=exportAbort.signal;
  $('watermark-progress-area').hidden=false;$('watermark-progress').value=0;$('watermark-progress-label').textContent='正在读取素材…';
  try{
    const [input,logoInput]=await Promise.all([file.arrayBuffer(),logoBlob.arrayBuffer()]);
    if(signal.aborted)throw new DOMException('已取消','AbortError');
    const output=await new Promise((resolve,reject)=>{
      const finish=(error,result)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(result);};
      const abort=()=>finish(new DOMException('已取消','AbortError'));
      const timer=setTimeout(()=>{worker?.terminate();finish(new Error('处理超时，请尝试较短或较小的视频。'));},VIDEO_EXPORT_TIMEOUT_MS);
      signal.addEventListener('abort',abort,{once:true});
      try{
        worker=new Worker(new URL('./video-watermark-worker.js?v=20261021-3',import.meta.url),{type:'module'});
        worker.onerror=()=>finish(new Error('视频处理引擎加载失败，请刷新页面重试。'));
        worker.onmessage=({data})=>{
          if(data.type==='loading')$('watermark-progress-label').textContent='正在加载本地视频引擎…';
          else if(data.type==='progress'){$('watermark-progress').value=data.progress*100;$('watermark-progress-label').textContent=`正在添加水印 ${Math.round(data.progress*100)}%`;}
          else if(data.type==='done')finish(null,data.output);
          else if(data.type==='error')finish(new Error(data.message));
        };
        worker.postMessage({input,logo:logoInput,settings},[input,logoInput]);
      }catch(error){finish(error);}
    });
    if(signal.aborted)throw new DOMException('已取消','AbortError');
    const blob=new Blob([output],{type:'video/mp4'});resultURL=URL.createObjectURL(blob);$('watermark-output').src=resultURL;
    $('watermark-download').href=resultURL;$('watermark-download').download=`${file.name.replace(/\.[^.]+$/,'')}-watermark.mp4`;
    $('watermark-result-meta').textContent=`${(blob.size/1048576).toFixed(2)} MB · ${$('watermark-mode').selectedOptions[0].textContent} · 宽度 ${$('watermark-size').value}% · 不透明度 ${$('watermark-opacity').value}%`;
    $('watermark-result').hidden=false;$('watermark-progress').value=100;$('watermark-progress-label').textContent='导出完成';
    status('水印视频已生成，可以预览并下载。');$('watermark-result').scrollIntoView({behavior:'smooth',block:'start'});$('watermark-download').focus({preventScroll:true});
  }catch(error){$('watermark-progress-area').hidden=true;status(error.name==='AbortError'?'已取消导出，可以调整后重新开始。':error.message,error.name!=='AbortError');}
  finally{worker?.terminate();worker=null;exportAbort=null;lock(false);}
});
$('watermark-cancel').addEventListener('click',()=>{exportAbort?.abort();worker?.terminate();});
window.addEventListener('pagehide',()=>{disposed=true;videoVersion++;logoVersion++;videoLoading?.abort();exportAbort?.abort();worker?.terminate();video.pause();logo?.close();logo=null;logoBlob=null;file=null;if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=null;clearResult();cancelAnimationFrame(animation);});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
update();
