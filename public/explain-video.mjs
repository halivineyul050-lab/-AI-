import {renderAnatomyFrame,createAnatomyProjection} from './anatomy-renderer.mjs?v=20261019-video-1';
import {validateScene} from './explain-scene.mjs?v=20261019-quality-1';

export function chooseVideoFormat(supports=type=>globalThis.MediaRecorder?.isTypeSupported(type)){
 for(const mime of ['video/mp4;codecs=avc1.42001E','video/mp4','video/webm;codecs=vp8','video/webm'])if(supports(mime))return {mime,extension:mime.includes('mp4')?'mp4':'webm'};
 throw Error('当前浏览器不支持视频导出，请使用新版 Chrome、Edge 或 Safari。');
}
export function videoFilename(title,extension){return (title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,100)||'交互讲解')+'.'+extension;}
export function captionPages(text,measure=value=>Array.from(value).length*25,width=800){
 const lines=textLines({measureText:value=>({width:measure(value)})},text.replace(/\s+/gu,' '),width),pages=[];
 for(let i=0;i<lines.length;i+=3)pages.push(lines.slice(i,i+3).join('\n'));
 return pages;
}
export function videoTimeline(scene,paginate=text=>captionPages(text)){
 let start=0,values={...scene.variables};
 const steps=scene.steps.map((step,index)=>{
  const pages=paginate(step.text);
  const duration=Math.max(step.duration,pages.length*5),from={...values};Object.assign(values,step.values);
  const entry={...step,index,start,duration,animationDuration:step.duration,from,to:{...values},pages};start+=duration;return entry;
 });
 if(start>600)throw Error('讲解内容过长，视频超过十分钟，请精简讲解后再导出。');
 return {steps,duration:start};
}
export function browserVideoTimeline(scene,ctx=document.createElement('canvas').getContext('2d')){
 if(!ctx)throw Error('无法创建视频画布，请关闭其他占用资源的页面后重试。');
 ctx.font='25px sans-serif';return videoTimeline(scene,text=>captionPages(text,value=>ctx.measureText(value).width,1120));
}
export function videoState(timeline,time){
 const entry=timeline.steps.find(s=>time<s.start+s.duration)??timeline.steps.at(-1),local=Math.max(0,time-entry.start);
 const ratio=entry.index===0?1:Math.min(1,local/entry.animationDuration);
 const values=Object.fromEntries(Object.keys(entry.to).map(key=>[key,entry.from[key]+(entry.to[key]-entry.from[key])*ratio]));
 return {step:entry.index,values,title:entry.title,caption:entry.pages[Math.min(entry.pages.length-1,Math.floor(local/entry.duration*entry.pages.length))]};
}
function aborted(signal){if(signal?.aborted)throw signal.reason??new DOMException('已取消导出','AbortError');}
function svgImage(markup,signal){return new Promise((resolve,reject)=>{
 const image=new Image(),url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));
 const finish=error=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);image.onload=image.onerror=null;URL.revokeObjectURL(url);error?reject(error):resolve(image);};
 const cancel=()=>finish(signal.reason??new DOMException('已取消导出','AbortError'));
 const timer=setTimeout(()=>finish(Error('模型画面绘制超时，请重试。')),10000);
 image.onload=()=>finish();image.onerror=()=>finish(Error('模型画面无法绘制，请重新生成讲解后重试。'));signal?.addEventListener('abort',cancel,{once:true});image.src=url;if(signal?.aborted)cancel();
 });}
async function drawingStyle(signal){
 const controller=new AbortController(),forward=()=>controller.abort(signal.reason);
 signal?.addEventListener('abort',forward,{once:true});if(signal?.aborted)forward();
 const timer=setTimeout(()=>controller.abort(Error('绘图样式加载超时，请检查网络后重试。')),20000);
 try{const response=await fetch('/anatomy.css?v=20261019-quality-1',{signal:controller.signal});if(!response.ok)throw Error('绘图样式加载失败，请检查网络后重试。');return (await response.text()).replaceAll('.anatomy-figure ','');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',forward);}
}
function textLines(ctx,text,width){const lines=[''];for(const c of Array.from(text)){const i=lines.length-1;if(c==='\n'||ctx.measureText(lines[i]+c).width>width)lines.push(c==='\n'?'':c);else lines[i]+=c;}return lines;}
function oneLine(ctx,text,width){let value=text;while(value.length>1&&ctx.measureText(value).width>width)value=value.slice(0,-2)+'…';return value;}
// The source SVG uses fixed, platform-owned CSS. No HTML capture or external model assets.
export async function recordExplanation(input,{signal,onProgress=()=>{},format=chooseVideoFormat()}={}){
 const scene=validateScene(input);if(scene.version!==2)throw Error('视频下载适用于 AI 结构讲解；请先生成一份分步结构讲解。');
 aborted(signal);
 if(!globalThis.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw Error('当前浏览器不支持视频导出，请使用新版 Chrome、Edge 或 Safari。');
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('无法创建视频画布，请关闭其他占用资源的页面后重试。');
 const timeline=browserVideoTimeline(scene,ctx);
 const css=await drawingStyle(signal);aborted(signal);
 const projection=createAnatomyProjection(scene,0);let stream,recorder,started=0,bytes=0,finished=false,failure,timer,watchdog;
 const chunks=[];
 async function draw(time){
  aborted(signal);const state=videoState(timeline,time);
  const svg=renderAnatomyFrame(scene,state.values,{step:state.step,projection}).replace('<svg','<svg width="800" height="500"').replace(/(<svg[^>]*>)/,'$1<style>'+css+'</style>');
  const image=await svgImage(svg,signal);aborted(signal);
  ctx.fillStyle='#f3f5fa';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#20283e';ctx.font='bold 30px sans-serif';ctx.fillText(oneLine(ctx,scene.title,1152),64,48);
  ctx.fillStyle='#60708e';ctx.font='20px sans-serif';ctx.fillText(oneLine(ctx,`${state.step+1} / ${scene.steps.length} · ${state.title}`,1152),64,82);
  ctx.drawImage(image,240,85,800,500);
  ctx.fillStyle='#ffffff';ctx.fillRect(40,580,1200,118);ctx.fillStyle='#28334b';ctx.font='25px sans-serif';
  textLines(ctx,state.caption,1120).forEach((line,i)=>ctx.fillText(line,80,613+i*32));
  ctx.fillStyle='#7964ef';ctx.fillRect(40,698,1200*Math.min(1,time/timeline.duration),4);
 }
 try{
  await draw(0);aborted(signal);
  stream=canvas.captureStream(24);recorder=new MediaRecorder(stream,{mimeType:format.mime,videoBitsPerSecond:4000000});
  return await new Promise((resolve,reject)=>{
   const fail=error=>{if(finished)return;failure=error;finished=true;clearTimeout(timer);clearTimeout(watchdog);if(recorder.state!=='inactive')recorder.stop();reject(error);};
   const cancel=()=>fail(signal.reason??new DOMException('已取消导出','AbortError'));
   signal?.addEventListener('abort',cancel,{once:true});
   recorder.ondataavailable=event=>{if(event.data.size){bytes+=event.data.size;if(bytes>100*1024*1024){fail(Error('视频超过100MB，请精简讲解后重试。'));return;}chunks.push(event.data);}};
   recorder.onerror=()=>fail(Error('视频编码失败，请关闭其他占用资源的页面后重试。'));
   recorder.onstop=()=>{signal?.removeEventListener('abort',cancel);clearTimeout(watchdog);if(failure)return;if(!chunks.length){fail(Error('未生成有效视频，请重试或更换浏览器。'));return;}finished=true;resolve({blob:new Blob(chunks,{type:recorder.mimeType}),extension:format.extension,duration:timeline.duration});};
   recorder.start(1000);started=performance.now();onProgress({seconds:0,duration:timeline.duration,step:0});
   watchdog=setTimeout(()=>fail(Error('视频导出超时，请重试。')),(timeline.duration+30)*1000);
   async function frame(){
    if(finished)return;
    try{const elapsed=Math.min(timeline.duration,(performance.now()-started)/1000);await draw(elapsed);if(finished)return;onProgress({seconds:elapsed,duration:timeline.duration,step:videoState(timeline,elapsed).step});if(elapsed>=timeline.duration){timer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},120);return;}timer=setTimeout(frame,1000/24);}catch(error){fail(error);}
   }
   timer=setTimeout(frame,1000/24);if(signal?.aborted)cancel();
  });
 }finally{clearTimeout(timer);clearTimeout(watchdog);if(recorder?.state==='recording')recorder.stop();for(const track of stream?.getTracks()??[])track.stop();canvas.width=canvas.height=1;}
}
