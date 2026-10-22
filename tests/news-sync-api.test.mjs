import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerUser } from '../backend/auth.mjs';
import { buildApplication } from '../server.mjs';
test('news sync management is admin-only and publication reaches bounded public pages',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nikai-news-api-'));const now=Date.parse('2026-10-10T08:00:00Z');const fixture=JSON.stringify({items:[{id:'test',title:'官方模型更新',summary:'这是一条来自已验证来源的模型更新摘要。',url:'https://example.com/announcement',publishedAt:'2026-10-10T04:00:00Z'}]});
 const app=buildApplication({dbPath:join(dir,'test.db'),environment:'test',logger:false,adminToken:'news-test-admin',analyticsSalt:'test',newsSync:{defaults:[],now:()=>now,feedFetcher:async()=>({text:fixture,etag:'v1'})}});const addr=await app.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${addr.port}`;
 async function req(path,{admin=false,cookie,body,method='GET'}={}){const response=await fetch(base+path,{method,headers:{Accept:'application/json',...(admin?{Authorization:'Bearer news-test-admin'}:{}),...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {response,body:await response.json()};}
 try{
  for(const [path,method,body] of [['','GET'],['/config','PUT',{}],['/model','PUT',{}],['/test','POST',{}],['/sync','POST',{}],['/items/'+ 'a'.repeat(64),'POST',{}]])assert.ok([401,429].includes((await req('/api/admin/v1/news-sync'+path,{method,body})).response.status));
  const registered=await registerUser(app.db,{displayName:'普通访客',email:'member@example.com',normalizedEmail:'member@example.com',password:'correct-horse-battery',consentVersion:'2026-07'});const cookie=`nikai_auth=${registered.token}`;assert.ok([401,403,429].includes((await req('/api/admin/v1/news-sync',{cookie})).response.status));
  const config=(await req('/api/admin/v1/news-sync',{admin:true})).body.data.config;const source={id:'test',name:'已验证来源',type:'json',url:'https://example.com/feed',enabled:true,policy:'review'};assert.equal((await req('/api/admin/v1/news-sync/config',{admin:true,method:'PUT',body:{revision:config.revision,enabled:true,intervalMinutes:5,sources:[source]}})).response.status,200);
  assert.equal((await req('/api/admin/v1/news-sync/test',{admin:true,method:'POST',body:{source}})).body.data.count,1);
  assert.equal((await req('/api/admin/v1/news-sync/sync',{admin:true,method:'POST',body:{}})).response.status,202);
  let state;for(let i=0;i<30;i++){state=(await req('/api/admin/v1/news-sync',{admin:true})).body.data;if(!state.status.running)break;await new Promise(r=>setTimeout(r,10));}assert.equal(state.pending.length,1);const initialRevision=(await req('/api/v1/content/version')).body.data.revision;
  assert.equal((await req('/api/admin/v1/news-sync/items/'+state.pending[0].id,{admin:true,method:'POST',body:{action:'publish'}})).response.status,200);
  assert.ok((await req('/api/v1/content/version')).body.data.revision>initialRevision);const page=await req('/api/v1/news?limit=1&offset=0');assert.equal(page.body.data.length,1);assert.equal(page.body.data[0].title,'官方模型更新');assert.equal(Object.hasOwn(page.body.data[0],'body'),false);assert.ok(page.body.meta.total>=8);
  const detail=await req('/api/v1/articles/'+page.body.data[0].id);assert.match(detail.body.data.body,/来源摘要/);assert.equal((await req('/api/v1/news?limit=61')).response.status,422);assert.equal((await req('/api/admin/v1/news-sync?pendingOffset=-1',{admin:true})).response.status,422);const publicStatus=(await req('/api/v1/news/status')).body.data;assert.equal(Object.hasOwn(publicStatus,'sources'),false);assert.equal(Object.hasOwn(publicStatus,'model'),false);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
