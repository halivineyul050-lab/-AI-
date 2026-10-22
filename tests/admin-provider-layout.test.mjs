import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
test('provider settings share layout, compact switches and responsive cards in both modes',async()=>{
 const css=['design-system.css','admin.css','admin-creator.css','admin-news-sync.css','credits.css','admin-recharge.css','admin-provider.css'].map(read).join('\n');
 const sp=process.platform==='linux'?(await import('@sparticuz/chromium')).default:null;
 const executable=sp?await sp.executablePath():'C:/Program Files/Google/Chrome/Application/chrome.exe';
 assert.ok(existsSync(executable),'A browser is required for provider form layout verification');
 const browser=await chromium.launch({headless:true,executablePath:executable,args:sp?sp.args:[]});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.setContent(read('admin.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
 await page.addStyleTag({content:css});
 await page.evaluate(()=>{window.fetch=async()=>({ok:true,json:async()=>({data:{mode:'inherit',enabled:true,ready:true,dailyLimit:10,requestTimeoutSeconds:120,maxTokens:12000}})});});
 await page.addScriptTag({content:read('admin-explainer.js')});
 await page.locator('#explainer-provider-form:not([hidden])').waitFor();
 const metrics=()=>page.locator('#explainer-admin').evaluate(panel=>{
  const toggle=panel.querySelector('[name=inherit]'),button=panel.querySelector('[type=submit]'),card=panel.querySelector('.assistant-settings-card');
  return {padding:parseFloat(getComputedStyle(panel).paddingLeft),toggleWidth:toggle.getBoundingClientRect().width,toggleHeight:toggle.getBoundingClientRect().height,buttonWidth:button.getBoundingClientRect().width,cardRadius:parseFloat(getComputedStyle(card).borderRadius),overflow:panel.scrollWidth>panel.clientWidth};
 });
 let m=await metrics();assert.ok(m.padding>=20);assert.equal(m.toggleWidth,40);assert.equal(m.toggleHeight,24);assert.ok(m.buttonWidth<320);assert.ok(m.cardRadius>=12);assert.equal(m.overflow,false);
 assert.equal(await page.locator('#explainer-independent').isVisible(),false);
 await page.locator('[name=inherit]').uncheck();assert.equal(await page.locator('#explainer-independent').isVisible(),true);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});m=await metrics();assert.equal(m.overflow,false);assert.equal(m.toggleWidth,40);assert.equal(m.toggleHeight,24);assert.ok(m.buttonWidth<320);}
 await page.locator('[name=inherit]').check();assert.equal(await page.locator('#explainer-independent').isVisible(),false);
 assert.equal(await page.locator('#assistant-admin').evaluate(n=>n.classList.contains('provider-settings-panel')),true);
 await page.locator('#assistant-provider-form').evaluate(n=>n.hidden=false);
 const assistantSwitch=await page.locator('#assistant-admin .assistant-enable input').evaluate(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}));
 assert.deepEqual(assistantSwitch,{width:40,height:24});
 assert.equal(await page.locator('.assistant-provider-form').evaluateAll(forms=>forms.every(f=>f.closest('.provider-settings-panel'))),true);
 }finally{await browser.close();}
});
