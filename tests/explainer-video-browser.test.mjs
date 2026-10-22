import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,chownSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';
import {launchSandboxedBrowser} from '../backend/nestdutio/browser.mjs';
const fixture={version:2,title:'双齿轮如何传递运动',summary:'一个轮带动另一个轮反向转动。',reason:'相互啮合的齿轮在接触处沿同一方向运动，因此两轮转向相反；半径比决定转速比。',try:'播放或拖动转角，观察两个轮上的方向线。点击部件可查看作用。',assumptions:'教学示意，省略齿形精度、轴承和摩擦；不是加工图。',variables:{angle:0},controls:[{id:'angle',label:'驱动转角',min:0,max:360,step:1}],parts:[{id:'base',name:'支撑底座',description:'固定两根轴的位置',type:'box',position:[0,0,-12],size:[145,80,10],tone:'lo',rotation:0,explode:[0,0,-30]},{id:'drive',name:'主动齿轮',description:'接受动力并带动从动齿轮',type:'gear',position:[-30,0,0],size:[60,60,9],tone:'lit',rotation:'$angle',explode:[0,0,20]},{id:'driven',name:'从动齿轮',description:'与主动轮反向转动',type:'gear',position:[30,0,0],size:[60,60,9],tone:'hi',rotation:['mul','$angle',-1],explode:[0,0,40]},{id:'shaft',name:'传动轴',description:'将从动齿轮的转动传出',type:'pipe',position:[30,0,9],size:[9,9,25],tone:'mid',rotation:0,explode:[0,0,50]}],steps:[{title:'认识传动结构',text:'底座固定两轮的中心，主动轮接受动力。',parts:['base','drive'],values:{angle:0},duration:1},{title:'观察反向转动',text:'主动轮顺时针转动时，从动轮反向转动。',parts:['drive','driven'],values:{angle:120},duration:2},{title:'动力沿轴传出',text:'两轮半径相同，转过的角度大小也相同。',parts:['driven','shaft'],values:{angle:240},duration:2}]};
test('video download encodes moving frames, plays at 720p, and supports cancellation and retry',{timeout:65000},async t=>{
 const output=mkdtempSync(join(tmpdir(),'nikai-video-browser-'));
 const app=buildApplication({dbPath:join(output,'test.db'),logger:false});let browser,cleanup=async()=>{};
 t.after(async()=>{await browser?.close();await cleanup();await app.close();});
 const address=await app.listen(0,'127.0.0.1'),origin='http://127.0.0.1:'+address.port;
 const executable=process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':await(await import('@sparticuz/chromium')).default.executablePath();
 ({browser,cleanup}=await launchSandboxedBrowser(executable,20000));const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Release preflight runs Node as root and the sandboxed browser as nobody.
 // Give that browser a dedicated, owned download directory; never weaken the sandbox.
 let nativeDownload=null;
 if(process.platform==='linux'&&process.getuid?.()===0){
  const directory=mkdtempSync(join(tmpdir(),'nikai-video-download-'));chownSync(directory,65534,65534);t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const cdp=await page.context().newCDPSession(page),{targetInfo}=await cdp.send('Target.getTargetInfo');
  await cdp.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:directory,browserContextId:targetInfo.browserContextId,eventsEnabled:true});
  nativeDownload=new Promise((resolve,reject)=>{let guid;cdp.on('Browser.downloadWillBegin',event=>{guid=event.guid;});cdp.on('Browser.downloadProgress',event=>{if(event.guid!==guid)return;if(event.state==='completed')resolve(join(directory,guid));else if(event.state==='canceled')reject(Error('Sandboxed browser canceled the download'));});});
 }
 await page.goto(origin+'/explain#scene='+encodeURIComponent(Buffer.from(JSON.stringify(fixture)).toString('base64')));await page.locator('#download-video:not([hidden])').waitFor();
 await page.getByRole('button',{name:'下一步',exact:true}).click();const before=await page.locator('#stage svg').innerHTML();
 await page.locator('#download-video').click();assert.match(await page.locator('#video-description').innerText(),/无配音/);assert.match(await page.locator('#video-estimate').innerText(),/15 秒/);
 await page.locator('#video-start').click();await page.waitForFunction(()=>!document.getElementById('video-progress').hidden&&document.getElementById('video-status').textContent.includes('正在导出'));
 assert.equal(await page.locator('#video-start').isDisabled(),true);await page.locator('#video-close').click();await page.waitForFunction(()=>document.getElementById('video-status').textContent.includes('已取消'));
 assert.equal(await page.locator('#video-start').isEnabled(),true);
 await page.route('**/anatomy.css?v=20261019-quality-1',route=>route.fulfill({status:503,body:'unavailable'}));await page.locator('#video-start').click();await page.waitForFunction(()=>document.getElementById('video-status').textContent.includes('样式加载失败'));assert.equal(await page.locator('#video-start').isEnabled(),true);await page.unroute('**/anatomy.css?v=20261019-quality-1');
 const downloadPromise=page.waitForEvent('download',{timeout:35000});await page.locator('#video-start').click();const download=await downloadPromise;
 const file=join(output,download.suggestedFilename());if(nativeDownload)copyFileSync(await nativeDownload,file);else await download.saveAs(file);const bytes=readFileSync(file);assert.ok(bytes.length>10000,'must contain encoded frames, not an empty video');
 assert.equal(await page.locator('#stage svg').innerHTML(),before,'export cannot change current diagram or step');assert.equal(await page.locator('#video-progress').evaluate(el=>el.value),100);
 const decoded=await page.evaluate(async base64=>{
  const video=document.createElement('video');video.muted=true;video.preload='auto';video.src=URL.createObjectURL(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:document.getElementById('video-description').textContent.includes('MP4')?'video/mp4':'video/webm'}));document.body.append(video);
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('download cannot decode'));setTimeout(()=>reject(Error('decode timeout')),10000);});
  if(!Number.isFinite(video.duration)){video.currentTime=1e10;await new Promise(resolve=>video.onseeked=resolve);}
  const duration=video.duration,canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
  // A seeked event and animation frames can still expose the previous decoded frame.
  // Play until the requested media timestamp is actually presented before sampling pixels.
  const sampledTimes=[];
  const frame=async time=>{
   const presented=new Promise((resolve,reject)=>{
    let callback;const timer=setTimeout(()=>{video.cancelVideoFrameCallback(callback);reject(Error('requested video frame was not presented: '+time));},5000);
    const inspect=(_,metadata)=>{if(Math.abs(metadata.mediaTime-time)<.25){sampledTimes.push(metadata.mediaTime);clearTimeout(timer);resolve();}else callback=video.requestVideoFrameCallback(inspect);};
    callback=video.requestVideoFrameCallback(inspect);
   });
   const seeked=new Promise(resolve=>video.onseeked=resolve);video.currentTime=time;await seeked;
   await Promise.all([video.play(),presented]);video.pause();ctx.drawImage(video,0,0);
   return Array.from(ctx.getImageData(240,85,800,490).data);
  };
  const first=await frame(.3),middle=await frame(6),last=await frame(11);let changed=0,colored=0;for(let i=0;i<first.length;i+=4){if(Math.abs(first[i]-middle[i])+Math.abs(first[i+1]-middle[i+1])+Math.abs(first[i+2]-middle[i+2])>40)changed++;if(first[i+2]-first[i]>15)colored++;}
  const result={width:video.videoWidth,height:video.videoHeight,duration,sampledTimes,changed,colored,endDiff:last.some((v,i)=>Math.abs(v-middle[i])>50)};URL.revokeObjectURL(video.src);video.remove();return result;
 },bytes.toString('base64'));
 assert.equal(decoded.width,1280);assert.equal(decoded.height,720);assert.ok(decoded.duration>=14&&decoded.duration<18,JSON.stringify(decoded));assert.ok(decoded.changed>500,JSON.stringify(decoded));assert.ok(decoded.colored>300,JSON.stringify(decoded));assert.equal(decoded.endDiff,true);console.log('Downloaded video verified',download.suggestedFilename(),bytes.length,JSON.stringify(decoded));
 if(process.env.EXPLAINER_VIDEO_EVIDENCE_DIR){mkdirSync(process.env.EXPLAINER_VIDEO_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.EXPLAINER_VIDEO_EVIDENCE_DIR,'video-complete-desktop.png'),fullPage:true});copyFileSync(file,join(process.env.EXPLAINER_VIDEO_EVIDENCE_DIR,download.suggestedFilename()));}
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('#video-start').isVisible(),true);
 if(process.env.EXPLAINER_VIDEO_EVIDENCE_DIR)await page.screenshot({path:join(process.env.EXPLAINER_VIDEO_EVIDENCE_DIR,'video-complete-mobile.png'),fullPage:true});await page.locator('#video-close').click();
 const fallback=await page.evaluate(async scene=>{
  const {recordExplanation}=await import('/explain-video.mjs?v=20261019-video-1');
  const format={mime:'video/webm;codecs=vp8',extension:'webm'};if(!MediaRecorder.isTypeSupported(format.mime))return null;
  const result=await recordExplanation({...scene,steps:scene.steps.slice(0,1)},{format});
  const video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(result.blob);document.body.append(video);await video.play();await new Promise(resolve=>video.onended=resolve);
  const decoded={type:result.blob.type,size:result.blob.size,width:video.videoWidth,played:video.currentTime};URL.revokeObjectURL(video.src);video.remove();return decoded;
 },fixture);
 if(fallback){assert.match(fallback.type,/webm/);assert.equal(fallback.width,1280);assert.ok(fallback.played>4.5);assert.ok(fallback.size>10000);console.log('WebM fallback played to end',JSON.stringify(fallback));}
 assert.deepEqual(errors,[]);
});
