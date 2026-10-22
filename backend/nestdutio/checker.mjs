import {existsSync} from 'node:fs';import {launchSandboxedBrowser} from './browser.mjs';
import {checkBusinessQuality} from './business-quality.mjs';
async function executable(){const candidates=[process.env.NIKAI_CHROME_PATH,process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/chromium','/usr/bin/google-chrome'];const native=candidates.find(x=>x&&existsSync(x));if(native)return native;if(process.platform==='linux'){const m=await import('@sparticuz/chromium');return m.default.executablePath();}return undefined;}
// Numeric expectations compare complete numbers, allowing display grouping without substring false positives.
export function acceptanceTextMatches({text,selector,value}){text??=document.querySelector(selector)?.textContent??'';if(/^-?\d+(?:\.\d+)?$/.test(value))return [...text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].some(match=>Number(match[0].replace(/,/g,''))===Number(value));return text.includes(value);}
export async function checkArtifact(artifact,{preview,deadline=Date.now()+30000,executablePath,onProgress,quality}={}){
 executablePath??=await executable();
 if(!executablePath)throw Object.assign(Error('浏览器检查环境尚未就绪'),{code:'nestdutio_checker_unavailable'});
 const issues=[],checks=[],businessChecks=[],link=preview.put(artifact),origin=new URL(link.url).origin;
 let browser,cleanup=async()=>{};const remaining=()=>Math.max(1,Math.min(10000,deadline-Date.now()));
 try{({browser,cleanup}=await launchSandboxedBrowser(executablePath,remaining()));const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:false});context.setDefaultTimeout(3000);
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin){issues.push({code:'network_blocked',path:'resources'});return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',()=>issues.push({code:'runtime_error',path:'scripts'}));page.on('response',r=>{if(r.status()>=400)issues.push({code:'missing_resource',path:'resources'});});page.on('dialog',d=>d.dismiss());page.on('popup',p=>{issues.push({code:'popup_blocked',path:'scripts'});p.close();});
  const initialStorage=await context.storageState();if(initialStorage.origins.some(entry=>entry.localStorage.length))issues.push({code:'storage_leak',path:'storage'});
  const response=await page.goto(link.url,{waitUntil:'load',timeout:remaining()});if(!response?.ok())issues.push({code:'entry_failed',path:'entry'});
  for(const [i,a]of artifact.acceptance.entries()){
   await onProgress?.({code:'check_started',index:i+1,total:artifact.acceptance.length});
   const receiptBefore=a.kind==='submitForm'?preview.count?.(link.id,a.formId):null;let phase='target';
   try{if(Date.now()>deadline)throw Error('Timeout');
    if(a.kind==='visible')await page.locator(a.target).first().waitFor({state:'visible',timeout:remaining()});
    else if(a.kind==='fill')await page.locator(a.target).first().fill(a.input,{timeout:remaining()});
    else{const before=a.kind==='submitForm'?preview.count?.(link.id,a.formId):null;if(['clickText','submitForm'].includes(a.kind))await page.locator(a.target).first().click({timeout:remaining()});else await page.locator(a.target).first().fill(a.input,{timeout:remaining()});phase='result';await page.waitForFunction(acceptanceTextMatches,{selector:a.output,value:a.value},{timeout:remaining()});if(a.kind==='submitForm'&&!(typeof before==='number'&&preview.count?.(link.id,a.formId)>before)){issues.push({code:'form_not_received',path:`acceptance[${i}]`});throw Error('No server receipt');}}
    checks.push({index:i,ok:true});await onProgress?.({code:'check_passed',index:i+1,total:artifact.acceptance.length});
   }catch{if(a.kind==='submitForm')issues.push({code:typeof receiptBefore==='number'&&preview.count?.(link.id,a.formId)>receiptBefore?'form_result_mismatch':'form_not_received',path:`acceptance[${i}]`});issues.push({code:'interaction_failed',path:`acceptance[${i}]`,phase});checks.push({index:i,ok:false});}
  }
  if(quality){const result=await checkBusinessQuality(page,quality,{timeout:Math.min(3000,remaining())});issues.push(...result.issues);businessChecks.push(...result.checks);}
  for(const width of [1440,390]){await page.setViewportSize({width,height:844});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);if(overflow)issues.push({code:'horizontal_overflow',path:`viewport[${width}]`});}
  if(artifact.capabilities.includes('localStorage')){const stored=await page.evaluate(()=>localStorage.length);if(!stored)issues.push({code:'storage_not_used',path:'localStorage'});else{await page.reload({waitUntil:'load',timeout:remaining()});if(await page.evaluate(()=>localStorage.length)!==stored)issues.push({code:'storage_not_persistent',path:'localStorage'});}}
  if(new URL(page.url()).origin!==origin)issues.push({code:'navigation_blocked',path:'navigation'});
  return {ok:issues.length===0,issues:issues.slice(0,20),checks,businessChecks};
 }catch{return {ok:false,issues:[{code:'browser_check_failed',path:'runtime'}],checks};}finally{await browser?.close();await cleanup();preview.revoke(link.id);}
}
