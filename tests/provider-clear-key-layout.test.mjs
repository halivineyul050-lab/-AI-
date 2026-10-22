import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {buildApplication} from '../server.mjs';
import {registerUser} from '../backend/auth.mjs';
import {launchSandboxedBrowser} from '../backend/nestdutio/browser.mjs';

test('complete provider forms keep clear-key checkboxes compact, inline and operable on desktop and mobile',{timeout:60000},async t=>{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const base=`http://127.0.0.1:${port}`,root=mkdtempSync(join(tmpdir(),'nikai-clear-key-layout-'));
 const app=buildApplication({dbPath:join(root,'test.db'),autoSeed:false,logger:false,environment:'test',adminToken:'clear-key-test-only',publicBaseUrl:base,allowedOrigins:[base]});
 let browser,cleanup=async()=>{};
 t.after(async()=>{await browser?.close();await cleanup();await app.close();rmSync(root,{recursive:true,force:true});});
 const owner=await registerUser(app.db,{email:'layout@example.test',normalizedEmail:'layout@example.test',displayName:'布局测试',password:'test-clear-key-layout-only',consentVersion:'2026-10'});
 app.db.prepare("UPDATE users SET role='admin',is_super_admin=1 WHERE id=?").run(owner.user.id);
 await app.listen(port,'127.0.0.1');
 const executable=process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':await(await import('@sparticuz/chromium')).default.executablePath();
 ({browser,cleanup}=await launchSandboxedBrowser(executable,20000));
 const context=await browser.newContext();await context.addCookies([{name:'nikai_auth',value:owner.token,url:base}]);
 const page=await context.newPage();
 for(const width of [1440,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  for(const scope of ['assistant','explainer','nestdutio']) {
   await page.goto(base+'/admin#'+scope+'-admin',{waitUntil:'networkidle'});
   const form=page.locator('#'+scope+'-admin form');await form.waitFor({state:'visible'});
   if(scope!=='assistant')await form.locator('[name=inherit]').uncheck();
   const checkbox=form.locator('[name=clearKey]');await checkbox.waitFor({state:'visible'});
   const geometry=await checkbox.evaluate(input=>{const label=input.closest('label'),box=input.getBoundingClientRect(),outer=label.getBoundingClientRect(),style=getComputedStyle(label);return {width:box.width,height:box.height,left:box.left-outer.left,top:box.top-outer.top,display:style.display,direction:style.flexDirection,scroll:document.documentElement.scrollWidth,viewport:innerWidth};});
   assert.ok(geometry.width>=14&&geometry.width<=20&&geometry.height>=14&&geometry.height<=20,`${scope} ${width}: ${JSON.stringify(geometry)}`);
   assert.equal(geometry.display,'flex');assert.equal(geometry.direction,'row');assert.ok(geometry.left<4&&geometry.top<24);assert.ok(geometry.scroll<=geometry.viewport);
   await checkbox.locator('..').click();assert.equal(await checkbox.isChecked(),true);await checkbox.focus();await checkbox.press('Space');assert.equal(await checkbox.isChecked(),false);
   if(process.env.NIKAI_LAYOUT_SCREENSHOT_DIR && [1440,390].includes(width)){mkdirSync(process.env.NIKAI_LAYOUT_SCREENSHOT_DIR,{recursive:true});await page.locator('#'+scope+'-admin').screenshot({path:join(process.env.NIKAI_LAYOUT_SCREENSHOT_DIR,`provider-${scope}-${width}-20261020.png`)});}
  }
 }
});
