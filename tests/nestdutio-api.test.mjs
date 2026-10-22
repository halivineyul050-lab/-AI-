import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {buildApplication} from '../server.mjs';import {registerUser} from '../backend/auth.mjs';import {createCreditStore} from '../backend/credits.mjs';import {createSecretBox} from '../backend/image-provider-secrets.mjs';
test('API auth, project ownership, generation, preview and matching ZIP export',async t=>{
 const artifact={schemaVersion:1,name:'计算器',entry:'index.html',files:[{path:'index.html',content:'<!doctype html><h1>计算器</h1>'}],capabilities:[],acceptance:[{kind:'visible',target:'h1'}]};let calls=0;
 const key='a'.repeat(64),app=buildApplication({dbPath:join(mkdtempSync(join(tmpdir(),'nestdutio-api-')),'app.db'),logger:false,imageConfigKey:key,publicBaseUrl:'http://127.0.0.1:4400',nestdutioPublishOrigin:'http://{slug}.apps.localhost',nestdutioHealth:async(_url,version)=>version,nestdutioChecker:{check:async()=>({ok:true,issues:[]})},nestdutioLookup:async()=>[{address:'8.8.8.8',family:4}],nestdutioFetch:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(calls===1?{name:artifact.name,capabilities:[],acceptance:artifact.acceptance}:artifact)}}]}));}});t.after(()=>app.close());
 const {token,user}=await registerUser(app.db,{email:'studio@example.test',normalizedEmail:'studio@example.test',displayName:'测试',password:'long-safe-password',consentVersion:'test'});const other=await registerUser(app.db,{email:'other@example.test',normalizedEmail:'other@example.test',displayName:'其他',password:'long-safe-password',consentVersion:'test'});
 const billing=createCreditStore(app.db);billing.redeem(user.id,billing.createCodes({credits:100})[0].code);app.db.prepare('INSERT INTO assistant_provider(id,document) VALUES(1,?)').run(JSON.stringify({enabled:true,endpoint:'https://example.com/v1/chat/completions',model:'test',encryptedKey:createSecretBox(key).encrypt('private-key')}));app.db.prepare('INSERT INTO nestdutio_config(id,document) VALUES(1,?)').run(JSON.stringify({mode:'inherit',enabled:true,maxTokens:12000,requestTimeoutSeconds:180}));
 const a=await app.listen(0,'127.0.0.1'),base='http://127.0.0.1:'+a.port;const call=(path,{who=token,method='GET',body}={})=>fetch(base+'/api/v1/nestdutio'+path,{method,headers:{...(who?{Cookie:'nikai_auth='+who}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 assert.equal((await call('/projects',{who:''})).status,401);let r=await call('/projects',{method:'POST',body:{name:'A'}});assert.equal(r.status,201);const p=(await r.json()).data;assert.equal((await call('/projects/'+p.id,{who:other.token})).status,404);
 r=await call('/projects/'+p.id+'/tasks',{method:'POST',body:{prompt:'生成计算器',baseVersion:null,requestKey:'request-key'}});assert.equal(r.status,202);const task=(await r.json()).data;let result;for(let i=0;i<30;i++){result=(await (await call('/tasks/'+task.id)).json()).data;if(['ready','failed'].includes(result.state))break;await new Promise(r=>setTimeout(r,10));}assert.equal(result.state,'ready');
 const preview=await (await call('/projects/'+p.id+'/versions/'+result.versionId+'/preview',{method:'POST',body:{}})).json();assert.ok(preview.data.url.includes('.localhost:'));assert.ok(!JSON.stringify(preview).includes('private-key'));
 r=await call('/projects/'+p.id+'/versions/'+result.versionId+'/export');assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/zip');assert.equal(Buffer.from(await r.arrayBuffer()).readUInt32LE(0),0x04034b50);assert.equal(billing.wallet(user.id).balance,80);
 assert.equal((await call('/projects/'+p.id+'/versions/'+result.versionId+'/export',{who:other.token})).status,404);
 assert.equal((await call('/projects/'+p.id+'/publish',{who:other.token,method:'POST',body:{versionId:result.versionId,slug:'api-test'}})).status,404);
 r=await call('/projects/'+p.id+'/publish',{method:'POST',body:{versionId:result.versionId,slug:'api-test'}});assert.equal(r.status,200);assert.equal((await r.json()).data.state,'live');
 r=await call('/projects/'+p.id+'/publication');assert.equal((await r.json()).data.liveVersion,result.versionId);
 r=await call('/projects/'+p.id+'/unpublish',{method:'POST',body:{}});assert.equal((await r.json()).data.liveVersion,null);

 // Project history is durable server data and checks ownership, independently of an open browser.
 r=await call('/library');assert.equal((await r.json()).data.items.length,1);
 assert.equal((await call('/projects/'+p.id+'/history',{who:other.token})).status,404);
 let historyData=(await(await call('/projects/'+p.id+'/history')).json()).data;
 assert.equal(historyData.items.length,1);assert.equal(historyData.items[0].prompt,'生成计算器');assert.equal(historyData.items[0].state,'ready');
 r=await call('/projects/'+p.id+'/tasks',{method:'POST',body:{prompt:'生成计算器',baseVersion:null,requestKey:'request-key'}});assert.equal(r.status,202);
 assert.equal((await(await call('/projects/'+p.id+'/history')).json()).data.items.length,1);
 assert.equal((await call('/projects/'+p.id,{who:other.token,method:'PATCH',body:{archived:true}})).status,404);
 r=await call('/projects/'+p.id,{method:'PATCH',body:{name:'重命名作品',archived:true}});assert.equal(r.status,200);
 assert.equal((await(await call('/library')).json()).data.items.length,0);
 assert.equal((await(await call('/library?archived=true')).json()).data.items[0].name,'重命名作品');
 assert.equal((await(await call('/projects/'+p.id+'/history')).json()).data.items.length,1);
 await call('/projects/'+p.id,{method:'PATCH',body:{archived:false}});
 assert.equal((await(await call('/library?q='+encodeURIComponent('重命名'))).json()).data.items.length,1);

});
