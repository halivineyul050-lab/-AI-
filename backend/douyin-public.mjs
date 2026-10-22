import {setTimeout as delay} from 'node:timers/promises';
import {parseShare,douyinDesktopTarget,normalizeDouyin} from './link-extract-core.mjs';
import {allowedDouyinPage,createDouyinProxy} from './douyin-proxy.mjs';
export {allowedDouyinPage} from './douyin-proxy.mjs';
// Fresh anonymous context per work. No saved account, cookies, remote debugging or shared profile.
export async function extractPublicDouyin(share,externalSignal){
 if(share.platform!=='douyin')throw new Error('在线原型暂时只支持抖音单条公开视频。');
 const signal=AbortSignal.any([externalSignal,AbortSignal.timeout(45000)]);
 signal.throwIfAborted();
 let browser,context,proxy;
 const stop=()=>{if(context)context.close().catch(()=>{});};
 signal.addEventListener('abort',stop,{once:true});
 try{
  const [{chromium},{default:runtime}]=await Promise.all([import('playwright-core'),import('@sparticuz/chromium')]);
  proxy=await createDouyinProxy();
  // Keep Chromium's sandbox and web/site isolation enabled. Serverless defaults disable them.
  browser=await chromium.launch({executablePath:await runtime.executablePath(),chromiumSandbox:true,headless:true,timeout:15000,proxy:{server:`http://127.0.0.1:${proxy.port}`},args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-quic','--proxy-bypass-list=<-loopback>','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
  signal.throwIfAborted();
  context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   try{
    const request=route.request(),url=request.url();if(!allowedDouyinPage(url)||signal.aborted||['image','media','font'].includes(request.resourceType()))return await route.abort();
    await route.continue();
   }catch{await route.abort().catch(()=>{});}
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage();context.on('page',popup=>{if(popup!==page)popup.close().catch(()=>{});});
  let workId=share.id,result;
  page.on('response',async response=>{
   try{
    const u=new URL(response.url());
    if(u.hostname!=='www.douyin.com'||u.pathname!=='/aweme/v1/web/aweme/detail/'||response.status()!==200)return;
    if(Number(response.headers()['content-length'])>4000000)return;
    const body=await response.body();if(body.length>4000000)return;
    const item=JSON.parse(body.toString()).aweme_detail;
    const normalized=normalizeDouyin(item,workId);
    if(normalized?.video)result={...normalized,source:`https://www.douyin.com/video/${workId}`};
   }catch{}
  });
  let target=douyinDesktopTarget(share);
  if(!target){
   await page.goto(share.url,{waitUntil:'domcontentloaded',timeout:20000});
   for(let i=0;i<30&&!target;i++){
    signal.throwIfAborted();target=douyinDesktopTarget(share,page.url());
    if(!target)await delay(100,undefined,{signal});
   }
   if(!target)throw new Error('未识别到抖音视频，请重新复制原作品分享链接。');
  }
  workId=parseShare(target).id;
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:20000});
  while(!result){signal.throwIfAborted();await delay(150,undefined,{signal});}
  signal.throwIfAborted();return result;
 }catch(error){
  if(externalSignal.aborted)throw new Error('已取消解析。');
  if(signal.aborted||error.name==='TimeoutError')throw new Error('解析超时。请确认作品可公开播放；需要登录或验证的作品暂不支持。');
  if(/未识别/.test(error.message))throw error;
  throw new Error('暂时无法读取公开视频，请稍后重试或检查原作品。');
 }finally{
  signal.removeEventListener('abort',stop);
  await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await proxy?.close().catch(()=>{});
 }
}
