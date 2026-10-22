import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {buildApplication} from '../server.mjs';
import {registerUser} from '../backend/auth.mjs';
import {launchSandboxedBrowser} from '../backend/nestdutio/browser.mjs';

test('analytics explains sources and devices with readable ratios on desktop and mobile',{timeout:60000},async t=>{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const base=`http://127.0.0.1:${port}`,root=mkdtempSync(join(tmpdir(),'nikai-analytics-layout-'));
 const app=buildApplication({dbPath:join(root,'test.db'),autoSeed:false,logger:false,environment:'test',adminToken:'analytics-test-only',publicBaseUrl:base,allowedOrigins:[base]});
 let browser,cleanup=async()=>{};
 t.after(async()=>{await browser?.close();await cleanup();await app.close();rmSync(root,{recursive:true,force:true});});
 const owner=await registerUser(app.db,{email:'analytics@example.test',normalizedEmail:'analytics@example.test',displayName:'统计测试',password:'test-analytics-layout-only',consentVersion:'2026-10'});
 app.db.prepare("UPDATE users SET role='admin',is_super_admin=1 WHERE id=?").run(owner.user.id);
 const time=new Date(Date.now()-60000).toISOString();
 const insert=app.db.prepare("INSERT INTO analytics_events(event_id,event_name,visitor_id,session_id,page_type,path,properties_json,client_time,received_at,ip_hash) VALUES (?,'page_view',?,?,'news','/news',?,?,?,'test')");
 for(const [id,device] of [['first','desktop'],['second','mobile']])insert.run(id,id,id,JSON.stringify({source_type:'direct',device_type:device}),time,time);
 await app.listen(port,'127.0.0.1');
 const executable=process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':await(await import('@sparticuz/chromium')).default.executablePath();
 ({browser,cleanup}=await launchSandboxedBrowser(executable,20000));
 const context=await browser.newContext();await context.addCookies([{name:'nikai_auth',value:owner.token,url:base}]);const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:1000});await page.goto(base+'/admin#content',{waitUntil:'networkidle'});
  await page.locator('#content-tab-sources').click();
  await page.locator('#source-stats-list .analytics-breakdown-row').waitFor();
  assert.match(await page.locator('#page-performance-body').innerText(),/上期无浏览/);
  const sources=await page.locator('#content-panel-sources').innerText();assert.match(sources,/直接访问 \/ 未提供来源/);assert.match(sources,/2 次浏览 · 2 个访客 · 占全部浏览 100%/);assert.match(sources,/历史缺失/);
  await page.locator('#content-tab-devices').click();
  const devices=await page.locator('#content-panel-devices').innerText();assert.match(devices,/电脑/);assert.match(devices,/手机/);assert.match(devices,/50%/);assert.doesNotMatch(devices,/"desktop"|"mobile"/);
  // Monitoring replaces rows every five seconds: measure one consistent DOM snapshot.
  const geometry=await page.locator('#device-stats-list').evaluate(list=>Array.from(list.querySelectorAll('.analytics-breakdown-row'),row=>{
   const box=row.getBoundingClientRect(),track=row.querySelector('.analytics-share-track').getBoundingClientRect(),fill=row.querySelector('.analytics-share-track > div').getBoundingClientRect();
   return {x:box.x,width:box.width,ratio:fill.width/track.width};
  }));
  assert.equal(geometry.length,2);
  for(const b of geometry){assert.ok(b.width>0&&b.x>=0&&b.x+b.width<=width+1,`row fits ${width}`);assert.ok(Math.abs(b.ratio-.5)<.02);}
  if(process.env.NIKAI_LAYOUT_SCREENSHOT_DIR){mkdirSync(process.env.NIKAI_LAYOUT_SCREENSHOT_DIR,{recursive:true});await page.locator('#content-panel-devices').screenshot({path:join(process.env.NIKAI_LAYOUT_SCREENSHOT_DIR,`analytics-devices-${width}-20261020.png`)});await page.locator('#content-tab-sources').click();await page.locator('#content-panel-sources').screenshot({path:join(process.env.NIKAI_LAYOUT_SCREENSHOT_DIR,`analytics-sources-${width}-20261020.png`)});}
 }
 assert.deepEqual(errors,[]);
});
