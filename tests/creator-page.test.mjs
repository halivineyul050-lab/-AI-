import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplication } from '../server.mjs';
import { createCreatorStore } from '../backend/creator-page.mjs';
import { registerUser } from '../backend/auth.mjs';
async function setup(t) {
 const root=mkdtempSync(join(tmpdir(),'nikai-creator-'));
 const app=buildApplication({dbPath:join(root,'test.db'),logger:false,environment:'test',autoSeed:false,adminToken:'creator-test-only'});
 const address=await app.listen(0,'127.0.0.1');
 t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
 return {app,store:createCreatorStore(app.db),get:(p,o={})=>fetch(`http://127.0.0.1:${address.port}${p}`,o)};
}
const account={id:'account-one',platform:'测试平台',nickname:'我的昵称',url:'https://example.com/me',image:'',visible:true};
const content={id:'content-one',kind:'article',title:'我的文章',summary:'简介',body:'完整正文',url:'',image:'',visible:true};
test('creator starts empty, persists updates, hides drafts and rejects stale saves',async t=>{
 const {store}=await setup(t); const initial=store.read(); assert.equal(initial.accounts.length,0);assert.equal(initial.contents.length,0);
 const saved=store.save({...initial,accounts:[account,{...account,id:'hidden-account',visible:false}],contents:[content,{...content,id:'hidden-content',visible:false}]});
 assert.equal(saved.revision,1);assert.equal(store.read().accounts.length,2);assert.equal(store.read(true).accounts.length,1);assert.equal(store.read(true).contents.length,1);
 assert.throws(()=>store.save(initial),{status:409});
 const deleted=store.save({...saved,accounts:[],contents:[]});assert.equal(deleted.revision,2);assert.equal(store.read(true).contents.length,0);
});
test('creator rejects executable destinations, unsafe fields and oversized input',async t=>{
 const {store}=await setup(t);const initial=store.read();
 for(const url of ['javascript:alert(1)','//evil.example','data:text/html,test','https://user:pass@example.com']) assert.throws(()=>store.save({...initial,accounts:[{...account,url}]}),{status:422});
 assert.throws(()=>store.save({...initial,accounts:[{...account,nickname:'<script>alert(1)</script>'}]}),{status:422});
 assert.throws(()=>store.save({...initial,contents:[{...content,kind:'unknown'}]}),{status:422});
 assert.throws(()=>store.save({...initial,accounts:Array(101).fill(account)}),{status:422});
});
test('creator page is public while reads and writes in management require administrator',async t=>{
 const {app,get}=await setup(t);assert.equal((await get('/creator')).status,200);
 assert.equal((await get('/api/v1/creator')).status,200);assert.equal((await get('/api/admin/v1/creator')).status,401);
 const member=await registerUser(app.db,{displayName:'普通用户',email:'creator@example.test',normalizedEmail:'creator@example.test',password:'creator-password-test',consentVersion:'2026-07'});
 const headers={Cookie:`nikai_auth=${member.token}`,'Content-Type':'application/json'};
 assert.equal((await get('/api/admin/v1/creator',{headers})).status,401);
 assert.equal((await get('/api/admin/v1/creator',{method:'PUT',headers,body:'{}'})).status,401);
 app.db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(member.user.id);
 const initial=(await (await get('/api/admin/v1/creator',{headers})).json()).data;
 const save=await get('/api/admin/v1/creator',{method:'PUT',headers,body:JSON.stringify({...initial,accounts:[account],contents:[content,{...content,id:'draft',visible:false}]})});assert.equal(save.status,200);
 const published=(await(await get('/api/v1/creator')).json()).data;assert.equal(published.accounts[0].nickname,'我的昵称');assert.equal(published.contents.length,1);
});

test('about-page copy persists and older clients preserve new introduction fields', async t=>{
 const {store}=await setup(t);const initial=store.read();
 const saved=store.save({...initial,headline:'我的探索',aboutText:'个人介绍',siteText:'建站初衷',accounts:[account],contents:[content]});
 assert.equal(store.read(true).aboutText,'个人介绍');assert.equal(store.read(true).siteText,'建站初衷');
 const {headline,aboutText,siteText,...legacy}=saved;store.save({...legacy,bio:'新版简介'});
 assert.equal(store.read().headline,'我的探索');assert.equal(store.read().accounts.length,1);assert.equal(store.read().contents.length,1);
 assert.throws(()=>store.save({...store.read(),aboutText:'x'.repeat(3001)}),{status:422});
});
