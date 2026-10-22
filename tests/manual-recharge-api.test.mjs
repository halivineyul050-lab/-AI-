import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';
import {registerUser} from '../backend/auth.mjs';
const image={mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
async function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'manual-recharge-api-'));const app=buildApplication({dbPath:join(dir,'test.db'),environment:'test',logger:false,autoSeed:false,adminToken:'manual-recharge-test-only',imageConfigKey:'a'.repeat(64)});const a=await app.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${a.port}`;
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const users=[];for(const name of ['owner','other'])users.push(await registerUser(app.db,{email:name+'@example.test',normalizedEmail:name+'@example.test',displayName:name,password:'manual-recharge-password',consentVersion:'2026-07'}));
 const owner={Cookie:`nikai_auth=${users[0].token}`},other={Cookie:`nikai_auth=${users[1].token}`},admin={Authorization:'Bearer manual-recharge-test-only'};
 const request=(path,method='GET',body,headers=owner)=>fetch(base+path,{method,headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 async function configure(){const upload=await request('/api/admin/v1/recharge/channels/alipay/qr','POST',{image},admin);assert.equal(upload.status,200);const config=(await(await request('/api/admin/v1/recharge/config','GET',undefined,admin)).json()).data;config.channels.find(c=>c.id==='alipay').enabled=true;config.channels.find(c=>c.id==='alipay').receiverName='测试收款人';const saved=await request('/api/admin/v1/recharge/config','PUT',config,admin);assert.equal(saved.status,200);}
 return {request,configure,owner,other,admin};
}
test('manual recharge is closed until configured and protects order/proof ownership and administration',async t=>{
 const f=await fixture(t);const config=await f.request('/api/v1/recharge/config','GET',undefined,{});assert.equal(config.status,200);assert.equal((await config.json()).data.channels.every(c=>!c.ready),true);
 assert.equal((await f.request('/api/v1/account/recharges','GET',undefined,{})).status,401);
 assert.equal((await f.request('/api/admin/v1/recharges')).status,401);
 assert.equal((await f.request('/api/v1/account/recharges','POST',{packageId:'starter',channel:'alipay',delivery:'direct'})).status,422);
 await f.configure();
 const created=await f.request('/api/v1/account/recharges','POST',{packageId:'starter',channel:'alipay',delivery:'direct',priceCents:1,credits:999999});assert.equal(created.status,201);const order=(await created.json()).data;assert.equal(order.priceCents,600);assert.equal(order.credits,600);assert.equal(order.status,'created');
 assert.equal((await f.request(`/api/v1/account/recharges/${order.id}`,'GET',undefined,f.other)).status,404);
 assert.equal((await f.request(`/api/v1/account/recharges/${order.id}/proof`,'POST',{image},f.other)).status,404);
 assert.equal((await f.request(`/api/v1/account/recharges/${order.id}/proof`,'POST',{image},{...f.owner,Origin:'https://evil.example'})).status,403);
 const submitted=await f.request(`/api/v1/account/recharges/${order.id}/proof`,'POST',{image,note:'已支付'});assert.equal(submitted.status,200);const pending=(await submitted.json()).data;assert.equal(pending.status,'pending');
 const proof=`/api/v1/recharge/assets/${pending.proofAssetId}`;assert.equal((await f.request(proof,'GET',undefined,f.other)).status,404);assert.equal((await f.request(proof,'GET',undefined,{})).status,404);assert.equal((await f.request(proof,'GET',undefined,f.admin)).status,200);const ownProof=await f.request(proof);assert.equal(ownProof.status,200);assert.match(ownProof.headers.get('cache-control'),/private/);
 assert.equal((await f.request(`/api/admin/v1/recharges/${order.id}/review`,'POST',{decision:'approve'},f.admin)).status,200);
 assert.equal((await f.request(`/api/admin/v1/recharges/${order.id}/review`,'POST',{decision:'approve'},f.admin)).status,409);
 const wallet=(await(await f.request('/api/v1/account/credits')).json()).data;assert.equal(wallet.balance,600);assert.equal(wallet.ledger.filter(r=>r.kind==='manual_recharge').length,1);
});
test('approved code delivery creates a single private redeemable code, rejection grants nothing',async t=>{
 const f=await fixture(t);await f.configure();
 const order=(await(await f.request('/api/v1/account/recharges','POST',{packageId:'starter',channel:'alipay',delivery:'code'})).json()).data;
 await f.request(`/api/v1/account/recharges/${order.id}/proof`,'POST',{image});await f.request(`/api/admin/v1/recharges/${order.id}/review`,'POST',{decision:'approve'},f.admin);
 const approved=(await(await f.request(`/api/v1/account/recharges/${order.id}`)).json()).data;assert.ok(approved.code);const listed=await(await f.request('/api/admin/v1/recharges?status=approved','GET',undefined,f.admin)).text();assert.ok(!listed.includes(approved.code));assert.equal((await(await f.request('/api/v1/account/credits')).json()).data.balance,0);
 assert.equal((await f.request('/api/v1/account/credits/redeem','POST',{code:approved.code})).status,200);assert.equal((await f.request('/api/v1/account/credits/redeem','POST',{code:approved.code})).status,409);
 const second=(await(await f.request('/api/v1/account/recharges','POST',{packageId:'starter',channel:'alipay',delivery:'direct'})).json()).data;await f.request(`/api/v1/account/recharges/${second.id}/proof`,'POST',{image});const reject=await f.request(`/api/admin/v1/recharges/${second.id}/review`,'POST',{decision:'reject',reason:'未查到收款'},f.admin);assert.equal(reject.status,200);const detail=(await(await f.request(`/api/v1/account/recharges/${second.id}`)).json()).data;assert.equal(detail.reason,'未查到收款');assert.equal((await(await f.request('/api/v1/account/credits')).json()).data.balance,600);
});
