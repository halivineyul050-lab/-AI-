import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/admin-news-sync.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/admin-news-sync.css',import.meta.url),'utf8');
test('admin output is DOM safe and secrets are write only',()=>{assert.ok(!js.includes('innerHTML'));assert.match(js,/credentials: 'same-origin'/);assert.match(js,/hasKey/);assert.ok(!js.includes('value = data.model.apiKey'));assert.match(js,/new URL/);});
test('source policies and queue decisions are explicit',()=>{assert.match(js,/policy: 'review'/);assert.match(js,/action: 'publish'/);assert.match(js,/action: 'reject'/);assert.match(js,/revision:/);assert.match(js,/maxLength = 200/);assert.match(js,/maxLength = 1000/);});
test('polling respects visibility and authentication',()=>{assert.match(js,/document.hidden/);assert.match(js,/error.status === 401/);assert.match(js,/3000 : 15000/);assert.match(css,/min-width: 0/);assert.match(css,/overflow-wrap: anywhere/);});

import vm from 'node:vm';
function harness(response) {
  class Node {
    constructor(tag='div') { this.tagName=tag; this.children=[]; this.listeners={}; this.hidden=false; this.dataset={}; this.value=''; }
    append(...nodes) { this.children.push(...nodes); }
    addEventListener(type,fn) { this.listeners[type]=fn; }
    setAttribute() {}
    querySelectorAll() { return []; }
    querySelector() { return null; }
    replaceChildren(...nodes) { this.children=nodes; }
    contains() { return false; }
  }
  const root=new Node(), status=new Node(), timers=[], requests=[];
  const document={hidden:false,activeElement:null,querySelector:selector=>selector==='#news-sync-root'?root:status,createElement:tag=>new Node(tag),getElementById:()=>null,addEventListener(){}};
  const context={document,window:{nikaiModelPicker:({model})=>({select:model,setConfig(){}}),nikaiStorage:{session:{getItem:()=> '__session_admin__'}},addEventListener(){}},fetch:async(url,options)=>{requests.push({url,options});return response;},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},URL,crypto:{randomUUID:()=> 'new-id'}};
  vm.runInNewContext(js,context);
  return {root,status,timers,requests,document};
}
const findClass=(node,name)=>node.className===name?node:node.children.map(n=>findClass(n,name)).find(Boolean);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('unauthorized response hides admin controls and does not schedule polling',async()=>{
  const h=harness({ok:false,status:401,json:async()=>({title:'请先登录管理员'})}); await settle();
  assert.equal(h.root.children[1].hidden,true);assert.equal(h.status.textContent,'请先登录管理员');assert.equal(h.timers.length,0);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.method,'GET');assert.equal(h.requests[0].options.headers.Authorization,undefined);
});
test('authorized data renders honest zero statistics and schedules visible polling',async()=>{
  const h=harness({ok:true,json:async()=>({data:{config:{revision:1,enabled:false,intervalMinutes:15,sources:[]},model:{enabled:false,hasKey:false},status:{running:false,todayAdded:0},pending:[],runs:[]}})});await settle();
  const panel=h.root.children[1];assert.equal(panel.hidden,false);assert.equal(h.timers[0].delay,15000);
  assert.equal(panel.children[0].children[3].children[1].textContent,'0');
  assert.equal(panel.children[5].children[0].textContent,'暂无待审核内容。');
});

test('pending queue pagination requests next offset and preserves config form values',async()=>{
  const payload={config:{revision:1,enabled:false,intervalMinutes:15,sources:[]},model:{enabled:false,hasKey:false},status:{running:false,todayAdded:0},pending:[],pendingTotal:125,runs:[]};
  const h=harness({ok:true,json:async()=>({data:payload})});await settle();
  const panel=h.root.children[1];const config=panel.children[2];config.children[1].children[0].checked=true;
  const nav=panel.children[6];assert.equal(nav.children[1].textContent,'第 1 / 3 页 · 共 125 条待审核');
  nav.children[2].listeners.click();await settle();
  assert.match(h.requests.at(-1).url,/pendingOffset=50/);assert.equal(config.children[1].children[0].checked,true);
});

test('queue drafts survive navigating away and returning',async()=>{
  const first={id:'first',title:'原始标题',summary:'原始摘要',sourceUrl:'https://example.com/news',sourceName:'测试来源'};
  const payload={config:{revision:1,enabled:false,intervalMinutes:15,sources:[]},model:{enabled:false,hasKey:false},status:{running:false,todayAdded:0},pending:[first],pendingTotal:51,runs:[]};
  const h=harness({ok:true,json:async()=>({data:payload})});await settle();
  const panel=h.root.children[1], pending=panel.children[5], nav=panel.children[6];
  const box=pending.children[0];box.children[2].children[0].value='编辑后标题';box.children[3].children[0].value='编辑后摘要';box.listeners.input();
  payload.pending=[{...first,id:'second'}];nav.children[2].listeners.click();await settle();
  payload.pending=[first];nav.children[0].listeners.click();await settle();
  assert.equal(pending.children[0].children[2].children[0].value,'编辑后标题');assert.equal(pending.children[0].children[3].children[0].value,'编辑后摘要');
});


test('source settings render inline toggles, hidden immutable IDs and grouped actions',async()=>{
  const h=harness({ok:true,json:async()=>({data:{config:{revision:1,enabled:false,intervalMinutes:15,sources:[{id:'source-one',name:'来源',type:'rss',url:'https://example.com/feed',enabled:true,policy:'review'}]},model:{enabled:false,hasKey:false},status:{running:false},pending:[],runs:[]}})});await settle();
  const source=findClass(h.root,'news-sync-source');const fields=findClass(source,'news-sync-fields');
  assert.equal(fields.children[0].hidden,true);assert.equal(fields.children[0].children[0].readOnly,true);
  assert.equal(fields.children[4].children[0].type,'checkbox');assert.equal(source.children[3].children.length,2);assert.match(source.children[2].textContent,/最近成功：暂无.*连续失败：0/);
});


test('polling updates source health without overwriting source edits and logs use Chinese labels',async()=>{
  const source={id:'health-source',name:'原始名称',type:'rss',url:'https://example.com/feed',enabled:true,policy:'review',failures:0};
  const payload={config:{revision:1,enabled:false,intervalMinutes:15,sources:[source]},model:{enabled:false,hasKey:false},status:{running:false},pending:[],runs:[{startedAt:'2026-10-12T00:00:00Z',status:'partial',errors:[{sourceName:'来源',code:'NEWS_NETWORK_ERROR'}]}]};
  const h=harness({ok:true,json:async()=>({data:payload})});await settle();
  const panel=h.root.children[1], row=findClass(h.root,'news-sync-source');const fields=findClass(row,'news-sync-fields');
  fields.children[1].children[0].value='未保存名称';source.failures=2;source.retryAt='2026-10-12T01:00:00Z';
  h.timers[0].fn();await settle();
  assert.equal(fields.children[1].children[0].value,'未保存名称');assert.match(row.children[2].textContent,/连续失败：2.*下次重试/);
  const log=panel.children[8].children[0];assert.match(log.children[0].textContent,/部分完成/);assert.match(log.children[2].textContent,/网络连接失败（NEWS_NETWORK_ERROR）/);
});
