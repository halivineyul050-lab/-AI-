import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {launchSandboxedBrowser} from '../backend/nestdutio/browser.mjs';
test('real admin forms discover, select, preserve saved models and reject stale responses',{timeout:60000},async t=>{
 const allowed=['admin-model-picker.js','admin-assistant.js','admin-explainer.js','admin-nestdutio.js','admin-news-sync.js','admin-skills.js'];
 const html=readFileSync('public/admin.html','utf8').replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,(tag,src)=>allowed.includes(src.replace(/^\//,'').split('?')[0])?tag:'');
 const server=createServer((q,r)=>{const path=new URL(q.url,'http://local').pathname;try{r.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html; charset=utf-8');r.end(path==='/'?html:readFileSync(new URL('../public'+path,import.meta.url)));}catch{r.statusCode=404;r.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,cleanup=async()=>{};
 t.after(async()=>{await browser?.close();await cleanup();await new Promise(resolve=>server.close(resolve));});
 const executable=process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':await(await import('@sparticuz/chromium')).default.executablePath();
 ({browser,cleanup}=await launchSandboxedBrowser(executable,20000));
 const page=await browser.newPage();await page.addInitScript(()=>{window.nikaiStorage={session:{getItem:()=>null}};});page.setDefaultTimeout(6000);const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 const config={mode:'independent',enabled:false,endpoint:'https://example.com/v1/chat/completions',model:'saved-model',hasKey:true,dailyLimit:10,welcome:'你好',ready:false,previewReady:true,unitCredits:20,maxTokens:12000,requestTimeoutSeconds:120};
 let fail=false;
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());let data=config;
  if(url.pathname.endsWith('/model-discovery')){const body=req.postDataJSON();requests.push(body);if(fail){await route.fulfill({status:502,json:{title:'鉴权失败，请检查 API Key'}});return;}if(body.endpoint.includes('slow'))await new Promise(resolve=>setTimeout(resolve,1000));try{await route.fulfill({json:{data:{items:[{id:body.endpoint.includes('slow')?'old-model':'model-a'},{id:'model-b'}]}}});}catch{}return;}
  if(url.pathname.endsWith('/news-sync'))data={model:config,config:{revision:1,enabled:false,intervalMinutes:5,sources:[],model:config},status:{running:false},pending:[],runs:[]};
  else if(url.pathname.endsWith('/skills'))data={revision:1,items:[]};
  else if(url.pathname.endsWith('/skills/provider')&&req.method()==='GET')data={...config,endpoint:'',model:'',hasKey:false};
  else if(req.method()==='PUT')data={...config,...req.postDataJSON()};
  await route.fulfill({json:{data}});
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 for(const selector of ['#assistant-provider-form','#explainer-provider-form','#nestdutio-admin form','#skills-provider-form','.news-sync-model']){
  const form=page.locator(selector);const model=form.locator('select[name=model],select[aria-label="选择模型"]');
  if(selector==='#skills-provider-form'){await form.locator('[name=endpoint]').fill('https://example.com');await form.locator('[name=apiKey]').fill('fresh-test-key');}
  await model.locator('option[value="model-a"]').waitFor({state:'attached'});
  assert.equal(await model.inputValue(),selector==='#skills-provider-form'?'':'saved-model');
  await model.selectOption('model-b');assert.equal(await model.inputValue(),'model-b');
  if(selector==='#skills-provider-form'){
   await form.getByRole('button',{name:'保存模型配置'}).click();await page.waitForFunction(()=>document.querySelector('#skills-provider-form [name=apiKey]').value==='');
   const refreshed=page.waitForRequest(r=>r.url().endsWith('/model-discovery')&&r.postDataJSON().scope==='skills'&&!r.postDataJSON().apiKey);
   await form.getByRole('button',{name:'刷新模型'}).click();await refreshed;
  }
 }
 assert.deepEqual(new Set(requests.map(x=>x.scope)),new Set(['assistant','explainer','nestdutio','skills','news-sync']));
 const form=page.locator('#assistant-provider-form'),model=form.locator('select[name=model]');
 fail=true;await form.getByRole('button',{name:'刷新模型'}).click();await form.locator('.model-picker-controls').getByText('鉴权失败，请检查 API Key').waitFor();assert.equal(await model.inputValue(),'model-b');
 fail=false;await form.locator('[name=endpoint]').fill('https://slow.example/v1');await page.waitForRequest(r=>r.url().endsWith('/model-discovery')&&r.postDataJSON().endpoint.includes('slow'));
 await form.locator('[name=endpoint]').fill('https://fast.example/v1');await model.locator('option[value="model-a"]').waitFor({state:'attached'});await page.waitForTimeout(1100);assert.equal(await model.locator('option[value="old-model"]').count(),0);
 await model.selectOption('model-a');await form.getByRole('button',{name:'保存小助手配置'}).click();await form.locator('#assistant-save-status').getByText(/已保存/).waitFor();assert.equal(await model.inputValue(),'model-a');
 assert.deepEqual(errors,[]);
 // Image editor reopening must restore its model even after form.reset().
 await page.evaluate(()=>{
  const form=document.querySelector('#image-model-form'),endpoint=document.createElement('input');endpoint.value='https://example.com';
  const picker=window.nikaiModelPicker({form,scope:'image',endpoint,model:form.elements.modelId,providerId:()=> 'provider-one'});
  picker.setConfig({endpoint:endpoint.value,model:'image-model',hasKey:true},true);form.reset();picker.setConfig({endpoint:endpoint.value,model:'image-model',hasKey:true},true);
 });
 assert.equal(await page.locator('#image-model-form select[name=modelId]').inputValue(),'image-model');
});
