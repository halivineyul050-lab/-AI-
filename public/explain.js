import {mountProjectLibrary} from './explain-projects.mjs?v=20261019-projects-1';
import {recordExplanation,browserVideoTimeline,chooseVideoFormat,videoFilename} from './explain-video.mjs?v=20261019-video-1';
import {mountScene,validateScene} from './explain-ai.mjs?v=20261019-quality-1';
import {mountAnatomy} from './anatomy-renderer.mjs?v=20261019-video-1';
const $ = s => document.querySelector(s);
let generated=null,generatedScene=null,generating=false,lastQuestion='';
let projectNavigation=0;
let videoController=null,videoUrl=null,videoInput=null,videoFormat=null;
const titles = {moon:'月亮为什么有阴晴圆缺？',dice:'投得越多，骰子会更平均吗？',sort:'冒泡排序是怎样一步步完成的？'};
let demo='moon', angle=90, playing=false, raf=0, previous=0, simple=true;
let counts=[0,0,0,0,0,0], die=0, sortIndex=0;
const sortSteps=[];
{const a=[5,3,8,4,2];sortSteps.push({values:[...a],pair:[],caption:'从左向右，比较相邻的两个数字。'});for(let end=a.length-1;end>0;end--)for(let i=0;i<end;i++){const swapped=a[i]>a[i+1];if(swapped)[a[i],a[i+1]]=[a[i+1],a[i]];sortSteps.push({values:[...a],pair:[i,i+1],caption:swapped?'左边更大，交换这两个数字。':'顺序正确，保留位置，继续比较。'});}sortSteps.push({values:[...a],pair:[],caption:'排序完成！所有数字已从小到大排列。'});}
function explain(observation,reason,task,assumption=''){ $('#observation').textContent=observation;$('#reason').textContent=reason;$('#try').textContent=task;$('#assumption').textContent=assumption; }
function stop(){playing=false;cancelAnimationFrame(raf);previous=0;const b=$('#play');if(b){b.textContent='▶ 播放';b.setAttribute('aria-pressed','false');}}
function home(){projectNavigation++;cancelVideo();stop();generated?.destroy?.();generated=null;$('#landing').hidden=false;$('#workspace').hidden=true;history.replaceState(null,'',location.pathname);window.scrollTo(0,0);}
document.querySelectorAll('[data-home]').forEach(b=>b.onclick=home);
document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>openDemo(b.dataset.demo));
$('#create').onsubmit=e=>{e.preventDefault();generate($('#question').value.trim());};
async function generate(question,resumeId=null){
 if(generating)return;
 if(!question){$('#input-note').textContent='请先输入想理解的问题。';$('#question').focus();return;}
 projectNavigation++;generating=true;const button=$('#create button[type="submit"]'),edit=$('#refine');button.disabled=edit.disabled=true;edit.textContent='正在生成…';
 button.textContent='正在生成交互讲解…';$('#input-note').textContent='正在调用模型构建演示，请稍候。失败不会切换成固定示例。';
 try{
  const input={question,mode:document.getElementById('mode').value,level:$('#level').value};
  const old=pendingTask();const record=old?.question===question&&old.mode===input.mode&&old.level===input.level?old:{...input,requestKey:globalThis.crypto?.randomUUID?.()||'request-'+Date.now()+'-'+Math.random().toString(16).slice(2)};
  savePending(record);
  let task=resumeId?{id:resumeId,state:'queued'}:await taskResponse(await fetch('/api/v1/explain/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,requestKey:record.requestKey})}));
  savePending({...record,id:task.id});history.replaceState(null,'','/explain?project='+encodeURIComponent(task.id));const start=Date.now();
  while(!['ready','failed','cancelled'].includes(task.state)){
   const phase={queued:'正在等待生成',planning:'正在构思讲解',building:'正在搭建立体结构',checking:'正在检查演示',repairing:'正在修正演示'}[task.state]||'正在生成';$('#input-note').textContent=phase+'… 刷新后可恢复当前任务。';$('#refine-note').textContent=phase+'…';
   if(Date.now()-start>180000)throw Error('任务仍未结束，请稍后刷新恢复查看；请勿重复创建。');
   await new Promise(resolve=>setTimeout(resolve,1200));
   task=await taskResponse(await fetch('/api/v1/explain/tasks/'+encodeURIComponent(task.id),{cache:'no-store',signal:AbortSignal.timeout(20000)}));
  }
  savePending(null);
  if(task.state!=='ready'){const code=task.error?.code||task.errorCode||'explainer_generation_failed';await taskResponse({ok:false,status:502,json:async()=>({code,requestId:task.id})});}
  const scene=validateScene(task.scene);lastQuestion=question;showGenerated(scene);
  try{localStorage.setItem('nikai-explain-last',JSON.stringify(scene));}catch{}
  $('#input-note').textContent='';
 }catch(error){if([401,403,404,409,422,429,503].includes(error.status))savePending(null);const message=error.status===401?'请先登录，再生成交互讲解。':error.message||'连接失败，请稍后刷新恢复任务';$('#input-note').textContent=message;toast(message);if(error.status===401){$('#login-link').hidden=false;} }
 finally{generating=false;button.disabled=edit.disabled=false;button.textContent='生成交互讲解 ↗';edit.textContent=generated?'修改讲解 ↗':'预览简化讲解 ↗';if(generated)$('#refine-note').textContent='修改将创建新讲解；失败保留当前演示。';}
}
function pendingTask(){try{return JSON.parse(globalThis.sessionStorage?.getItem('nikai-explain-pending')||'null');}catch{return null;}}
function savePending(record){try{if(record)globalThis.sessionStorage?.setItem('nikai-explain-pending',JSON.stringify(record));else globalThis.sessionStorage?.removeItem('nikai-explain-pending');}catch{}}
async function taskResponse(response){
 const body=await response.json().catch(()=>({}));if(!response.ok){
   const messages={explainer_invalid_scene:'模型返回的内容未通过交互演示校验，次数已退回。请细化问题后重试。',explainer_output_truncated:'模型输出未完成，次数已退回。请缩小问题范围后重试。',explainer_provider_rejected:'模型服务拒绝了请求，次数已退回。请联系管理员检查模型配置与服务额度。',explainer_timeout:'模型生成超时，次数已退回。请稍后重试。',explainer_generation_failed:'模型服务连接或响应异常，次数已退回。请稍后重试。',explainer_unconfigured:'AI讲解暂未启用，请联系管理员配置AI助手。'};
   Object.assign(messages,{explainer_interrupted:'服务重启中断了本次生成，次数已退回。请重新提交。',explainer_running:'请等待当前讲解完成。',explainer_daily_limit:'今日讲解次数已用完，请明天再试。'});
   if(response.status>=500)Object.assign(messages,{assistant_running:'请等待当前AI对话完成后再生成讲解。',assistant_daily_limit:'今日共享AI次数已用完，请明天再试。'});
   const message=messages[body.code]||(response.status<500?body.title:null)||'生成服务暂时不可用，请稍后重试。';
   throw Object.assign(Error(message+(body.requestId?'（请求编号：'+body.requestId+'）':'')),{status:response.status});
  }
 return body.data;
}
function showGenerated(scene){projectNavigation++;
 cancelVideo();$('#download-video').hidden=scene.version!==2;stop();generated?.destroy?.();demo='ai';generatedScene=scene;$('#landing').hidden=true;$('#workspace').hidden=false;$('#demo-title').textContent=scene.title;$('.example-badge').textContent=scene.version===2?'AI 结构讲解':'AI 生成';$('#refine').textContent='修改讲解 ↗';$('#refine-note').textContent='修改将重新调用模型，成功后占用一次每日额度；失败保留当前演示。';$('#refinement').value='';
 const mount=scene.version===2?mountAnatomy:mountScene;
 generated=mount($('#stage'),$('#controls'),scene,(values,detail)=>explain(detail?.observation||scene.summary+(scene.controls.length?' 当前参数：'+scene.controls.map(c=>c.label+' '+Math.round(values[c.id]*100)/100).join('、'):''),detail?.reason||scene.reason,detail?.try||scene.try,scene.assumptions+' · AI生成示意，请核验重要结论。'));window.scrollTo(0,0);
}
function openDemo(name){projectNavigation++;cancelVideo();$('#download-video').hidden=true;stop();generated?.destroy?.();generated=null;generatedScene=null;demo=Object.hasOwn(titles,name)?name:'moon';$('#landing').hidden=true;$('#workspace').hidden=false;$('#demo-title').textContent=titles[demo];$('.example-badge').textContent='可操作示例';$('#refine').textContent='预览简化讲解 ↗';$('#refine-note').textContent='当前为示例说明切换；在创作页输入问题可使用AI自由生成。';$('#refinement').value='';if(demo==='moon')buildMoon();else if(demo==='dice')buildDice();else buildSort();window.scrollTo(0,0);}
function buildMoon(){
 $('#stage').innerHTML=`<svg viewBox="0 0 700 405" role="img" aria-label="太阳光从左侧照向地球和月球的月相示意"><defs><radialGradient id="space"><stop stop-color="#21375b"/><stop offset="1" stop-color="#0c182c"/></radialGradient><radialGradient id="earth"><stop stop-color="#69c0e2"/><stop offset=".65" stop-color="#277db1"/><stop offset="1" stop-color="#15364f"/></radialGradient><linearGradient id="ml"><stop offset="49%" stop-color="#d5d9cf"/><stop offset="50%" stop-color="#47516a"/></linearGradient></defs><rect width="700" height="405" fill="url(#space)"/><g stroke="#f6cf64" stroke-width="2" opacity=".85"><path d="M20 135h90m-90 45h90m-90 45h90m-90 45h90"/><path d="m101 130 10 5-10 5m0 35 10 5-10 5m0 35 10 5-10 5m0 35 10 5-10 5"/></g><text x="25" y="105" fill="#f6cf64" font-size="16">太阳光</text><circle cx="310" cy="202" r="135" fill="none" stroke="#bac5e1" stroke-dasharray="4 7" opacity=".55"/><g fill="url(#ml)" opacity=".5"><circle cx="445" cy="202" r="11"/><circle cx="310" cy="67" r="11"/><circle cx="175" cy="202" r="11"/><circle cx="310" cy="337" r="11"/></g><circle cx="310" cy="202" r="42" fill="url(#earth)"/><path d="m285 177 19-11 18 7 2 17-16 6-10 24-10-9-8-18z m38 32 15 3-3 17-13 8-5-13z" fill="#85a67d"/><text x="293" y="264" fill="#e4eaff" font-size="14">地球</text><g id="moon-handle" tabindex="0" role="slider" aria-label="拖动月球位置" aria-valuemin="0" aria-valuemax="359"><circle r="25" fill="#8d79ff" opacity=".25"/><circle r="17" fill="url(#ml)" stroke="#ac9bff" stroke-width="3"/><text x="-15" y="-31" fill="#e4eaff" font-size="14">月球</text></g><rect x="505" y="112" width="165" height="182" rx="14" fill="#172843" stroke="#8491ae" stroke-dasharray="4 5"/><text x="547" y="140" fill="#e4eaff" font-size="15">地球视角</text><image id="phase-image" x="535" y="151" width="106" height="106"/><text id="phase-name" x="588" y="278" text-anchor="middle" fill="#d8e0f4" font-size="14"/><text x="350" y="386" text-anchor="middle" fill="#91a1bf" font-size="11">轨道、尺寸及距离不按实际比例；观察方向按北半球示意</text></svg><div class="mobile-phase"><img id="mobile-phase-image" alt="当前地球视角的月相"><div><small>从地球看月亮</small><strong id="mobile-phase-name"></strong></div></div>`;
 $('#controls').innerHTML='<label for="angle">月球位置</label><input id="angle" type="range" min="0" max="359" step="1"><output id="angle-output" for="angle"></output><button class="primary" id="play" aria-pressed="false">▶ 播放</button><button id="reset">↺ 重置</button>';
 $('#angle').oninput=e=>{stop();angle=Number(e.target.value);renderMoon();};$('#play').onclick=togglePlay;$('#reset').onclick=()=>{stop();angle=90;renderMoon();};
 const handle=$('#moon-handle'),svg=$('#stage svg');let dragging=false;
 function move(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());angle=(Math.atan2(202-p.y,p.x-310)*180/Math.PI+360)%360;renderMoon();}
 handle.onpointerdown=e=>{e.preventDefault();stop();dragging=true;handle.setPointerCapture(e.pointerId);move(e);};handle.onpointermove=e=>{if(dragging)move(e);};handle.onpointerup=handle.onpointercancel=()=>{dragging=false;};handle.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();stop();angle=(angle+(['ArrowRight','ArrowUp'].includes(e.key)?5:355))%360;renderMoon();}};renderMoon();
}
function renderMoon(){const rad=angle*Math.PI/180,fraction=(1+Math.cos(rad))/2;const label=angle<15||angle>345?'满月':angle<75?'亏凸月':angle<105?'下弦月':angle<165?'残月':angle<195?'新月':angle<255?'娥眉月':angle<285?'上弦月':'盈凸月';$('#moon-handle').setAttribute('transform',`translate(${310+135*Math.cos(rad)} ${202-135*Math.sin(rad)})`);$('#moon-handle').setAttribute('aria-valuenow',Math.round(angle));$('#angle').value=Math.round(angle);$('#angle-output').textContent=Math.round(angle)+'°';$('#phase-name').textContent=label;const c=document.createElement('canvas');c.width=c.height=120;const ctx=c.getContext('2d'),img=ctx.createImageData(120,120);for(let py=0;py<120;py++)for(let px=0;px<120;px++){const x=(px-59.5)/56,y=(py-59.5)/56,r=x*x+y*y;if(r>1)continue;const z=Math.sqrt(1-r),light=-x*Math.sin(rad)+z*Math.cos(rad),v=light>0?150+70*Math.sqrt(light):38+15*z,i=(py*120+px)*4;img.data[i]=v;img.data[i+1]=v+3;img.data[i+2]=v+6;img.data[i+3]=255;}ctx.putImageData(img,0,0);document.getElementById("mobile-phase-image").src=c.toDataURL();document.getElementById("mobile-phase-name").textContent=label+" · 亮面 "+Math.round(fraction*100)+"%";$('#phase-image').setAttribute('href',c.toDataURL());explain(`当前接近${label}。从地球上看，月面约有 ${Math.round(fraction*100)}% 被照亮。`,simple?'月亮自己不发光。太阳一直照亮它的一半；月亮绕地球运动时，我们看到的亮面大小就会改变。':'月相取决于太阳、地球、月球的相对位置。普通月相不是地球影子造成的；本示意用圆轨道和球面光照计算可见亮面。','把位置拖到 0°、90° 和 180°，比较满月、半月和新月。','这是二维教学示意，未模拟轨道倾角、月食、天平动和真实尺度。');}
function togglePlay(){if(playing){stop();return;}playing=true;$('#play').textContent='Ⅱ 暂停';$('#play').setAttribute('aria-pressed','true');function tick(t){if(!playing||demo!=='moon')return;if(previous){angle=(angle+Math.min(t-previous,80)*.014)%360;renderMoon();}previous=t;raf=requestAnimationFrame(tick);}raf=requestAnimationFrame(tick);}
function buildDice(){ $('#stage').innerHTML='<div class="dice-stage"><div class="die" aria-hidden="true">⚄</div><div class="bars"></div><div class="dice-total"></div></div>';$('#controls').innerHTML='<button class="primary" id="roll">投 1 次</button><button id="roll100">投 100 次</button><button id="reset">↺ 清空实验</button>';$('#roll').onclick=()=>roll(1);$('#roll100').onclick=()=>roll(100);$('#reset').onclick=()=>{counts.fill(0);die=0;renderDice();};renderDice(); }
function roll(n){for(let i=0;i<n;i++){const v=new Uint32Array(1);do{crypto.getRandomValues(v);}while(v[0]>=4294967292);die=v[0]%6;counts[die]++;}renderDice();}
function renderDice(){const total=counts.reduce((a,b)=>a+b,0),max=Math.max(...counts,1);$('.die').textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][die];$('.bars').innerHTML=counts.map((n,i)=>`<div class="bar-col"><span>${n}</span><div class="bar" style="height:${n/max*125}px"></div><span>${i+1} 点</span></div>`).join('');$('.dice-total').textContent=`已投 ${total} 次 · 每个点数的理论概率为 1/6`;explain(total?`已经投掷 ${total} 次。1 点出现 ${counts[0]} 次，频率为 ${(counts[0]/total*100).toFixed(1)}%。`:'还没有开始实验。点击“投 1 次”，观察这次落在哪个点数。',simple?'每次投掷都可能出现任何一个点数。投得越多，频率通常越接近理论概率，但不会保证六种点数次数相同。':'独立均匀抽样中，每个点数的概率为 1/6。大数定律描述频率的收敛，不意味着短期结果必须平均，也不改变下一次投掷的概率。','先投 1 次，再连续点几次“投 100 次”，比较样本量和结果分布。','使用浏览器加密随机数进行等概率抽样；此处不模拟真实骰子的物理碰撞。');}
function buildSort(){$('#stage').innerHTML='<div class="sort-stage"><div class="sort-blocks"></div><p class="sort-caption" aria-live="polite"></p><p class="sort-index"></p></div>';$('#controls').innerHTML='<button id="prev">← 上一步</button><button class="primary" id="next">下一步 →</button><button id="reset">↺ 重置</button>';$('#prev').onclick=()=>{sortIndex=Math.max(0,sortIndex-1);renderSort();};$('#next').onclick=()=>{sortIndex=Math.min(sortSteps.length-1,sortIndex+1);renderSort();};$('#reset').onclick=()=>{sortIndex=0;renderSort();};renderSort();}
function renderSort(){const s=sortSteps[sortIndex];$('.sort-blocks').innerHTML=s.values.map((v,i)=>`<div class="number-block ${s.pair.includes(i)?'active':''}" style="height:${v*17+30}px">${v}</div>`).join('');$('.sort-caption').textContent=s.caption;$('.sort-index').textContent=`步骤 ${sortIndex} / ${sortSteps.length-1}`;$('#prev').disabled=sortIndex===0;$('#next').disabled=sortIndex===sortSteps.length-1;explain(s.caption,simple?'每次只比较旁边的两个数字。左边大，就交换；这样一轮下来，最大的数字会走到最右边。':'每一轮依次比较相邻元素，把较大者向右交换。一轮结束后，未排序区间的最大值固定到末尾，再缩短比较范围。','点击下一步，留意紫色高亮位置，以及每轮结束时最大的数字在哪里。','这是基础冒泡排序，未添加“无交换时提前结束”的优化。');}
let toastTimer;function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
$('#refine').onclick=()=>{if(generated){const change=$('#refinement').value.trim();if(!change){toast('请先描述想修改什么。');return;}generate(('原问题：'+(lastQuestion||generatedScene.title)+'。当前讲解：'+generatedScene.summary+'。修改要求：'+change).slice(0,1000));return;}simple=true;if(demo==='moon')renderMoon();else if(demo==='dice')renderDice();else renderSort();toast('已切换为简化说明；自由生成请在创作页输入问题。');};
function cancelVideo(){videoController?.abort(new DOMException('已取消导出','AbortError'));}
function clearVideoResult(){if(videoUrl){URL.revokeObjectURL(videoUrl);videoUrl=null;}$('#video-result').hidden=true;$('#video-result').removeAttribute('href');}
$('#download-video').onclick=()=>{
 if(videoController)return;
 clearVideoResult();$('#video-status').textContent='';$('#video-progress').hidden=true;$('#video-start').disabled=false;$('#video-start').textContent='开始导出';$('#video-close').textContent='关闭';
 try{videoInput=validateScene(generated.scene());videoFormat=chooseVideoFormat();const timeline=browserVideoTimeline(videoInput);$('#video-description').textContent=`完整步骤动画与字幕 · 720p · ${videoFormat.extension.toUpperCase()} · 无配音`;$('#video-estimate').textContent=`${timeline.steps.length} 个步骤，视频约 ${Math.ceil(timeline.duration)} 秒，导出约需相同时间。`;}
 catch(error){$('#video-status').textContent=error.message;$('#video-start').disabled=true;$('#video-estimate').textContent='';}
 $('#video-dialog').showModal();
};
$('#video-close').onclick=()=>{if(videoController)cancelVideo();else $('#video-dialog').close();};
$('#video-dialog').addEventListener('cancel',event=>{if(videoController){event.preventDefault();cancelVideo();}});
$('#video-start').onclick=async()=>{
 if(videoController||!videoInput)return;
 const controller=new AbortController();videoController=controller;clearVideoResult();$('#video-start').disabled=true;$('#video-close').textContent='取消导出';$('#video-progress').hidden=false;$('#video-progress').value=0;$('#video-status').textContent='正在准备画面…';
 try{
  const result=await recordExplanation(videoInput,{signal:controller.signal,format:videoFormat,onProgress:({seconds,duration,step})=>{const percent=Math.min(99,Math.floor(seconds/duration*100));$('#video-progress').value=percent;$('#video-status').textContent=`正在导出 ${percent}% · 第 ${step+1} / ${videoInput.steps.length} 步 · 约剩 ${Math.max(0,Math.ceil(duration-seconds))} 秒`;}});
  if(controller.signal.aborted)throw controller.signal.reason;
  videoUrl=URL.createObjectURL(result.blob);const link=$('#video-result');link.href=videoUrl;link.download=videoFilename(videoInput.title,result.extension);link.textContent=`下载 ${result.extension.toUpperCase()} 视频（${(result.blob.size/1024/1024).toFixed(1)} MB）`;link.hidden=false;$('#video-progress').value=100;$('#video-status').textContent='导出完成，已开始下载。若未自动保存，请点击下方下载链接。';link.click();
 }catch(error){$('#video-status').textContent=error.name==='AbortError'?'已取消导出，可以重新开始。':error.message||'视频导出失败，请重试。';$('#video-progress').hidden=true;}
 finally{videoController=null;$('#video-start').disabled=false;$('#video-start').textContent='重新导出';$('#video-close').textContent='关闭';}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&videoController)videoController.abort(new DOMException('页面已切换到后台，已取消导出。请保持页面在前台后重试。','Error'));});
window.addEventListener('pagehide',()=>{cancelVideo();clearVideoResult();});
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#workspace').requestFullscreen();}catch{toast('此预览环境不支持全屏，可用浏览器放大查看。');}};
$('#share').onclick=()=>{stop();const url=new URL(location.href);if(generated){const bytes=new TextEncoder().encode(JSON.stringify(generated.scene()));const encoded=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));if(encoded.length>48000){toast('此演示内容较大，暂不支持链接分享。');return;}url.hash=new URLSearchParams({scene:encoded}).toString();}else url.hash=new URLSearchParams({demo,angle:String(Math.round(angle)),step:String(sortIndex),counts:counts.join(',')}).toString();$('#share-url').value=url.href;$('#copy-status').textContent='';$('#share-dialog').showModal();};$('#close-share').onclick=()=>$('#share-dialog').close();$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#share-url').value);$('#copy-status').textContent='链接已复制。';}catch{$('#share-url').select();$('#copy-status').textContent='请按 Ctrl+C 复制选中的链接。';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
function restoreSharedState(){const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('scene')){try{const value=hash.get('scene');if(value.length>48000)throw Error();const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));showGenerated(validateScene(JSON.parse(new TextDecoder().decode(bytes))));}catch{home();toast('演示链接无效或内容不受支持。');}return;}if(Object.hasOwn(titles,hash.get('demo'))){angle=Math.max(0,Math.min(359,Number(hash.get('angle'))||0));sortIndex=Math.max(0,Math.min(sortSteps.length-1,Math.floor(Number(hash.get('step'))||0)));const c=(hash.get('counts')||'').split(',').map(Number);if(c.length===6&&c.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=100000))counts=c;openDemo(hash.get('demo'));}
}
window.addEventListener('hashchange',restoreSharedState);
restoreSharedState();
try{const draft=sessionStorage.getItem('nikai-explain-draft');if(draft&&!pendingTask()?.id)$('#question').value=draft;$('#question').addEventListener('input',()=>sessionStorage.setItem('nikai-explain-draft',$('#question').value));const saved=localStorage.getItem('nikai-explain-last');if(saved){const scene=validateScene(JSON.parse(saved));$('#restore-last').hidden=false;$('#restore-last').onclick=()=>showGenerated(scene);}}catch{}
fetch('/api/v1/explain/config').then(r=>r.json()).then(({data})=>{if(!data?.ready){$('#ai-config-note').textContent='AI暂未启用，仍可体验下方示例。请在运营中心检查交互讲解配置。';$('#create button[type="submit"]').disabled=true;}else $('#ai-config-note').textContent='已连接'+(data.mode==='inherit'?'AI助手模型，共享':'独立讲解模型，每日')+data.dailyLimit+'次额度；失败退回次数。';}).catch(()=>{$('#ai-config-note').textContent='暂时无法读取模型状态，请刷新重试。';});

async function recoverPendingTask(){
 const recovering=pendingTask();if(!recovering?.id||location.hash||new URLSearchParams(location.search).has('project'))return;
 try{
  await taskResponse(await fetch('/api/v1/explain/tasks/'+encodeURIComponent(recovering.id),{cache:'no-store'}));
  $('#question').value=recovering.question;document.getElementById('mode').value=recovering.mode;$('#level').value=recovering.level;
  await generate(recovering.question,recovering.id);
 }catch(error){if([401,403,404].includes(error.status)){savePending(null);try{if(globalThis.sessionStorage?.getItem('nikai-explain-draft')===recovering.question)globalThis.sessionStorage.removeItem('nikai-explain-draft');}catch{}}}
}
void recoverPendingTask();

function openHistoryProject(task){
 if(generating){toast('请等待当前讲解生成完成。');return;}
 lastQuestion=task.question;$('#question').value=task.question;$('#mode').value=task.mode;$('#level').value=task.level;
 if(task.state==='ready'){showGenerated(validateScene(task.scene));history.replaceState(null,'','/explain?project='+encodeURIComponent(task.id));return;}
 home();$('#question').value=task.question;$('#mode').value=task.mode;$('#level').value=task.level;
 if(task.state==='failed'){$('#input-note').textContent=({explainer_timeout:'上次生成超时',explainer_output_truncated:'上次模型输出不完整',explainer_interrupted:'上次生成因服务重启中断',explainer_invalid_scene:'上次演示未通过检查'})[task.error?.code]||'上次生成失败';$('#input-note').textContent+='，问题已恢复，可编辑后重新生成。失败记录不会自动再次调用模型。';$('#question').focus();return;}
 history.replaceState(null,'','/explain?project='+encodeURIComponent(task.id));void generate(task.question,task.id);
}
mountProjectLibrary({onOpen:openHistoryProject,canOpen:()=>!generating});
async function restoreProjectFromUrl(){const id=new URLSearchParams(location.search).get('project');if(!id||location.hash)return;const navigation=projectNavigation;try{const task=await taskResponse(await fetch('/api/v1/explain/tasks/'+encodeURIComponent(id),{cache:'no-store',signal:AbortSignal.timeout(20000)}));if(navigation!==projectNavigation||new URLSearchParams(location.search).get('project')!==id||location.hash)return;openHistoryProject(task);}catch(error){if(navigation!==projectNavigation)return;$('#input-note').textContent=error.status===401?'请先登录，打开此账号的历史项目。':error.status===404?'项目不存在，或不属于当前账号。':'项目暂时无法打开，请在项目管理中重试。';if(error.status===401)$('#login-link').hidden=false;}}
void restoreProjectFromUrl();
