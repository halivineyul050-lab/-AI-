const $=id=>document.getElementById(id);
let result=null,parseAbort=null,audioAbort=null,audioUrl=null;
async function json(response){const data=await response.json();if(!response.ok)throw new Error(data.title||'请求失败，请重试。');return data.data;}
function clearAudio(){audioAbort?.abort();audioAbort=null;if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=null;$('audio-preview').pause();$('audio-preview').removeAttribute('src');$('audio-preview').load();$('audio-preview').hidden=true;$('download-audio').hidden=true;$('audio-status').textContent='';$('cancel-audio').hidden=true;}
function show(data){
 result=data;clearAudio();$('results').hidden=false;$('empty-state').hidden=true;
 $('source-platform').textContent=data.platform==='douyin'?'抖音 · 提取结果':'小红书 · 提取结果';$('result-title').textContent=data.title;
 $('result-meta').textContent=[data.author,data.duration?`${Math.floor(data.duration/60)} 分 ${Math.round(data.duration%60)} 秒`:''].filter(Boolean).join(' · ');
 $('source-link').href=data.source;$('result-text').value=data.text||'';$('copy-text').disabled=!data.text;$('copy-status').textContent=data.text?'':'未获取到文案。';
 $('source-video').hidden=!data.video;$('video-missing').hidden=Boolean(data.video);$('download-video').hidden=!data.video;
 if(data.video){$('source-video').src=data.video;$('source-video').poster=data.cover||'';$('download-video').href=data.video+'?download=1';}else{$('source-video').removeAttribute('src');$('source-video').load();}
 $('video-note').textContent=data.watermark==='source-marked'?'来源标记：含水印。下载保留源视频。':data.watermark==='source-unmarked'?'来源标记：无平台水印。画面内原有文字仍会保留。':'水印状态未确认，请以实际画面为准。';
 $('extract-audio').disabled=!data.audio;$('extract-audio').textContent='提取音频 →';if(!data.audio)$('audio-status').textContent='未获取到视频，无法提取音频。';
 $('cover-image').hidden=!data.cover;$('cover-missing').hidden=Boolean(data.cover);$('download-cover').hidden=!data.cover;
 if(data.cover){$('cover-image').src=data.cover;$('download-cover').href=data.cover+'?download=1';}else $('cover-image').removeAttribute('src');
}
$('extract-form').addEventListener('submit',async event=>{
 event.preventDefault();if(parseAbort)return;clearAudio();$('source-video').pause();$('results').hidden=true;result=null;
 const controller=new AbortController();parseAbort=controller;$('extract-button').disabled=true;$('share-text').disabled=true;$('cancel-parse').hidden=false;$('extract-status').textContent='正在读取作品，请稍候…';
 try{const data=await json(await fetch('/api/utilities/link-extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:$('share-text').value}),signal:controller.signal}));show(data);$('extract-status').textContent='解析完成。请选择要保存的素材。';}
 catch(error){$('extract-status').textContent=controller.signal.aborted?'已取消解析。':error.message;$('empty-state').hidden=false;}
 finally{parseAbort=null;$('extract-button').disabled=false;$('share-text').disabled=false;$('cancel-parse').hidden=true;}
});
$('cancel-parse').addEventListener('click',()=>parseAbort?.abort());
$('extract-audio').addEventListener('click',async()=>{
 if(!result?.audio||audioAbort)return;const controller=new AbortController();audioAbort=controller;const current=result;
 $('extract-audio').disabled=true;$('cancel-audio').hidden=false;$('audio-status').textContent='正在读取源音轨并提取音频。长视频可能需要几分钟，请保持页面打开。';
 try{const response=await fetch(current.audio,{signal:controller.signal});if(!response.ok)await json(response);const blob=await response.blob();if(result!==current)return;
  if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);$('audio-preview').src=audioUrl;$('audio-preview').hidden=false;$('download-audio').href=audioUrl;$('download-audio').download=`${current.platform}-${current.id}.mp3`;$('download-audio').hidden=false;$('audio-status').textContent='音频已提取，可试听或下载。';
 }catch(error){if(result===current)$('audio-status').textContent=controller.signal.aborted?'已取消音频提取。':error.message;}
 finally{if(audioAbort===controller){audioAbort=null;$('extract-audio').disabled=false;$('cancel-audio').hidden=true;}}
});
$('cancel-audio').addEventListener('click',()=>audioAbort?.abort());
$('copy-text').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('result-text').value);$('copy-status').textContent='文案已复制。';}catch{$('result-text').focus();$('result-text').select();$('copy-status').textContent='请按 Ctrl+C，或长按复制已选中的文案。';}});
$('source-video').addEventListener('error',()=>{$('video-note').textContent='视频预览暂不可用，请尝试下载；若下载失败，请重新解析。';});
$('cover-image').addEventListener('error',()=>{$('cover-missing').hidden=false;$('cover-missing').textContent='封面加载失败，请重新解析。';$('cover-image').hidden=true;});
window.addEventListener('pagehide',()=>{parseAbort?.abort();clearAudio();});
try{const status=await json(await fetch('/api/utilities/link-extract/status'));$('extract-button').disabled=!status.enabled;$('extract-status').textContent=status.enabled?'解析服务已就绪。':'本机解析尚未启用，请配置解析浏览器后使用。';}catch(error){$('extract-status').textContent=error.message;}
