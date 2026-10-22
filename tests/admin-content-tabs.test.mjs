import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
test('content performance tabs switch one panel and support keyboard navigation',()=>{
 const keys=['sources','devices','funnel'];const tabs=keys.map(k=>({dataset:{contentTab:k},events:{},attributes:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v},addEventListener(k,fn){this.events[k]=fn},focus(){this.focused=true}}));const panels=keys.map(k=>({dataset:{contentPanel:k},hidden:false}));
 const context={document:{querySelectorAll(s){return s==='[data-content-tab]'?tabs:panels}}};
 const start=source.indexOf('  function setupContentTabs()');assert.ok(start>=0);const end=source.indexOf('  function setupNavigationObserver()',start);vm.runInNewContext(source.slice(start,end)+';setupContentTabs();',context);
 assert.deepEqual(panels.map(p=>p.hidden),[false,true,true]);tabs[2].events.click();assert.deepEqual(panels.map(p=>p.hidden),[true,true,false]);assert.equal(tabs[2].attributes['aria-selected'],'true');tabs[2].events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(tabs[0].focused,true);assert.deepEqual(panels.map(p=>p.hidden),[false,true,true]);
});
