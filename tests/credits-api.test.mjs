import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';
import {registerUser} from '../backend/auth.mjs';
import {createImageProviderStore} from '../backend/image-provider-store.mjs';
import {createSecretBox} from '../backend/image-provider-secrets.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'credits-api-'));let mode='success',calls=0;
 const app=buildApplication({dbPath:join(dir,'test.db'),autoSeed:false,logger:false,environment:'test',adminToken:'credits-test-only',imageConfigKey:'a'.repeat(64),imageTempRoot:join(dir,'images'),imageFetch:async()=>{calls++;return mode==='failure'?new Response('bad',{status:500}):new Response(JSON.stringify({data:[{b64_json:png}]}));}});
 const user=await registerUser(app.db,{email:'credits@example.test',normalizedEmail:'credits@example.test',displayName:'测试',password:'credits-test-password',consentVersion:'2026-07'},{emailVerified:true});
 const models=createImageProviderStore(app.db);const provider=models.createProvider({name:'Test',baseUrl:'https://93.184.216.34',encryptedApiKey:createSecretBox('a'.repeat(64)).encrypt('test-key')});
 const model=models.createModel({providerId:provider.id,modelId:'test',displayName:'测试模型',supportedRatios:['1:1'],maxImages:4});
 const address=await app.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${address.port}`;
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true})});
 const member={Cookie:`nikai_auth=${user.token}`,'Content-Type':'application/json'};const admin={Authorization:'Bearer credits-test-only','Content-Type':'application/json'};
 const request=(path,method='GET',body,headers=member)=>fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const generate=(extra={},headers=member)=>request('/api/v1/image-generations','POST',{modelRecordId:model.id,prompt:'blue bird',ratio:'1:1',count:1,style:'自动',...extra},headers);
 return {app,user,model,member,admin,request,generate,setMode(value){mode=value},calls:()=>calls};
}
test('credits API protects accounts and admin actions, and redeems single-use codes',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/v1/account/credits','GET',undefined,{})).status,401);
 assert.equal((await f.request('/api/admin/v1/credits')).status,401);
 const config=(await (await f.request('/api/v1/credits/config','GET',undefined,{})).json()).data;assert.equal(config.defaultImageCredits,20);assert.deepEqual(config.payments,{wechat:false,alipay:false});
 const first=(await (await f.request('/api/v1/account/credits')).json()).data;assert.equal(first.balance,60);
 assert.equal((await (await f.request('/api/v1/account/credits')).json()).data.balance,60);
 const created=await f.request('/api/admin/v1/credits/codes','POST',{credits:600,count:1,label:'体验包'},f.admin);assert.equal(created.status,201);const code=(await created.json()).data.codes[0];
 const listed=(await (await f.request('/api/admin/v1/credits','GET',undefined,f.admin)).json()).data;assert.ok(!JSON.stringify(listed).includes(code.code));
 const redeemed=await f.request('/api/v1/account/credits/redeem','POST',{code:code.code});assert.equal(redeemed.status,200);assert.equal((await redeemed.json()).data.balance,660);
 assert.equal((await f.request('/api/v1/account/credits/redeem','POST',{code:code.code})).status,409);
 assert.equal((await f.request('/api/v1/account/credits/redeem','POST',{code:'bad'},{...f.member,Origin:'https://evil.example'})).status,403);
});
test('image credit charges, duplicate prevention, partial success and failure refunds integrate',async t=>{
 const f=await fixture(t);const initial=(await (await f.request('/api/v1/account/credits')).json()).data;
 assert.equal((await f.generate({},{})).status,401);assert.equal(f.calls(),0);
 const header={...f.member,'Idempotency-Key':'test-image-request-1'};const generated=await f.generate({},header);assert.equal(generated.status,200);assert.equal((await generated.json()).data.credits.charged,20);
 assert.equal((await f.generate({},header)).status,409);assert.equal(f.calls(),1);
 assert.equal((await (await f.request('/api/v1/account/credits')).json()).data.balance,initial.balance-20);
 f.setMode('failure');assert.equal((await f.generate()).status,502);assert.equal((await (await f.request('/api/v1/account/credits')).json()).data.balance,40);
 f.setMode('success');const partial=await f.generate({count:2});assert.equal(partial.status,200);const data=(await partial.json()).data;assert.equal(data.images.length,1);assert.equal(data.credits.charged,20);assert.equal(data.credits.refunded,20);
 assert.equal((await f.generate({count:2})).status,402);assert.equal(f.calls(),3);
});

test('admin grants locate existing accounts, enforce permissions and prevent duplicate credits',async t=>{
 const f=await fixture(t),input={userId:"pending",credits:45,reason:'测试奖励',requestId:'grant-api-1'};
 for(const headers of [{},f.member])assert.equal((await f.request('/api/admin/v1/credits/grants','POST',input,headers)).status,401);
 const found=await f.request('/api/admin/v1/credits/accounts?query=credits%40example.test','GET',undefined,f.admin);assert.equal(found.status,200);const account=(await found.json()).data;assert.equal(account.email,'credits@example.test');input.userId=account.id;
 const before=(await (await f.request('/api/v1/account/credits')).json()).data.balance;
 for(let i=0;i<2;i++){const response=await f.request('/api/admin/v1/credits/grants','POST',input,f.admin);assert.equal(response.status,200);assert.equal((await response.json()).data.balance,before+45);}
 assert.equal((await f.request('/api/admin/v1/credits/grants','POST',{...input,credits:46},f.admin)).status,409);
 const ledger=(await (await f.request('/api/v1/account/credits')).json()).data.ledger;assert.equal(ledger.filter(x=>x.kind==='admin_grant').length,1);
});

test('admin credit configuration accepts the existing NeStudio fixed model price',async t=>{const f=await fixture(t);const current=(await(await f.request('/api/admin/v1/credits','GET',undefined,f.admin)).json()).data.config;const response=await f.request('/api/admin/v1/credits','PUT',{...current,modelPrices:{...current.modelPrices,nestdutio:37}},f.admin);assert.equal(response.status,200);assert.equal((await response.json()).data.modelPrices.nestdutio,37);});
