import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';
import {registerUser} from '../backend/auth.mjs';
import {createCreditStore} from '../backend/credits.mjs';
import {createSecretBox} from '../backend/image-provider-secrets.mjs';
import {launchSandboxedBrowser} from '../backend/nestdutio/browser.mjs';

test('persisted file recovery completes a real checked website without regenerating saved HTML or charging failed execution',{timeout:60000},async t=>{
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const origin='http://127.0.0.1:'+port,key='d'.repeat(64),requests=[];
 const acceptance=[{kind:'clickText',target:'#add',output:'#count',value:'1'}];
 const manifest={entry:'index.html',files:[{path:'index.html',purpose:'页面结构',dependencies:['app.js']},{path:'app.js',purpose:'计数交互',dependencies:[]}]};
 const contents={'index.html':'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>恢复测试</title><h1>恢复测试</h1><button id="add">加一</button><output id="count">0</output><script src="app.js" defer></script></html>','app.js':'let count=0;document.getElementById("add").onclick=()=>{document.getElementById("count").textContent=String(++count)};'};
 const app=buildApplication({dbPath:join(mkdtempSync(join(tmpdir(),'nikai-resilient-integration-')),'app.db'),logger:false,publicBaseUrl:origin,allowedOrigins:origin,imageConfigKey:key,nestdutioLookup:async()=>[{address:'8.8.8.8',family:4}],nestdutioFetch:async(_url,init)=>{
  const body=JSON.parse(init.body),input=JSON.parse(body.messages.at(-1).content);requests.push(input);
  const file=input.file?.path;let content,reason='stop';
  if(!file)content=JSON.stringify({name:'恢复测试',capabilities:[],forms:[],acceptance,manifest});
  else if(file==='app.js'&&requests.filter(x=>x.file?.path==='app.js').length<=2){content='{"path":"app.js","content":"partial';reason='length';}
  else content=JSON.stringify({path:file,content:contents[file]});
  return new Response(JSON.stringify({usage:{prompt_tokens:120,completion_tokens:180},choices:[{message:{content},finish_reason:reason}]}));
 }});
 let browser,cleanup=async()=>{};t.after(async()=>{await browser?.close();await cleanup();await app.close();});
 const member=await registerUser(app.db,{email:'resilient-integration@example.test',normalizedEmail:'resilient-integration@example.test',displayName:'恢复测试',password:'safe-long-password',consentVersion:'test'});
 const billing=createCreditStore(app.db);billing.redeem(member.user.id,billing.createCodes({credits:100})[0].code);
 app.db.prepare('INSERT INTO assistant_provider(id,document) VALUES(1,?)').run(JSON.stringify({enabled:true,endpoint:'https://example.com/v1/chat/completions',model:'test',encryptedKey:createSecretBox(key).encrypt('fixture-resilient-key')}));
 app.db.prepare('INSERT INTO nestdutio_config(id,document) VALUES(1,?)').run(JSON.stringify({mode:'inherit',enabled:true,maxTokens:12000,requestTimeoutSeconds:60}));
 await app.listen(port,'127.0.0.1');
 const api=async(path,body)=>{const response=await fetch(origin+'/api/v1/nestdutio'+path,{method:body?'POST':'GET',headers:{cookie:'nikai_auth='+member.token,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result.data;};
 const project=await api('/projects',{name:'恢复测试'}),config=await api('/config');
 const task=await api('/projects/'+project.id+'/tasks',{prompt:'做一个点击加一的计数器',baseVersion:null,requestKey:'resilient-integration-original',billingRevision:config.billingRevision});
 let failed;for(let i=0;i<100;i++){failed=await api('/tasks/'+task.id);if(failed.state==='failed')break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(failed.state,'failed');assert.equal(failed.error.code,'nestdutio_output_limit');assert.equal(failed.generation.canResume,true);assert.equal(failed.generation.completedFiles,1);assert.equal(billing.wallet(member.user.id).balance,100);
 const executable=process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':await(await import('@sparticuz/chromium')).default.executablePath();({browser,cleanup}=await launchSandboxedBrowser(executable,20000));
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'nikai_auth',value:member.token,url:origin}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let confirmation='';page.on('dialog',async d=>{confirmation=d.message();await d.accept();});
 await page.goto(origin+'/nestdutio?project='+project.id);await page.locator('.task-progress-continue').waitFor();
 assert.match(await page.locator('.task-progress').innerText(),/1\s*\/\s*2|已完成.*1.*2/);
 const evidence=process.env.NIKAI_RESILIENT_EVIDENCE;if(evidence){mkdirSync(evidence,{recursive:true});await page.locator('.conversation').screenshot({path:join(evidence,'recoverable-desktop.png')});}
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(evidence)await page.locator('.conversation').screenshot({path:join(evidence,'recoverable-mobile.png')});
 await page.locator('.task-progress-continue').click();await page.waitForFunction(()=>[...document.querySelectorAll('.task-progress-title')].some(n=>n.textContent.includes('保存为新版本')),{timeout:30000}).catch(error=>{console.log('DIAGNOSTIC',JSON.stringify({confirmation,requests,tasks:app.db.prepare('SELECT id,state,error_code,progress_json FROM nestdutio_tasks WHERE project_id=?').all(project.id)}));throw error;});
 assert.match(confirmation,/预留|积分|预算/);
 const rows=app.db.prepare('SELECT * FROM nestdutio_tasks WHERE project_id=? ORDER BY created_at').all(project.id);assert.equal(rows.length,2);assert.equal(rows[0].state,'failed');assert.equal(rows[1].state,'ready');
 assert.equal(requests.filter(x=>x.file?.path==='index.html').length,1);assert.equal(requests.filter(x=>x.file?.path==='app.js').length,3);
 const price=config.unitCredits;assert.equal(billing.wallet(member.user.id).balance,100-price);assert.equal(billing.wallet(member.user.id).frozen,0);
 await page.locator('#preview-tab').click();await page.frameLocator('#preview').locator('#add').click();assert.equal(await page.frameLocator('#preview').locator('#count').innerText(),'1');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({savedHtmlRequests:1,failedFileRequests:3,executions:2,failedRefunded:true,realChecker:true,mobileOverflow:false}));
});
