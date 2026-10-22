import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';
import {registerUser} from '../backend/auth.mjs';
import {createSecretBox} from '../backend/image-provider-secrets.mjs';
const scene={title:'测试实验',summary:'观察参数',reason:'解释原理',try:'拖动参数',assumptions:'教学示意',variables:{x:1},controls:[{id:'x',label:'参数',min:0,max:10,step:1}],elements:[{type:'circle',x:'$x',y:10,r:2}]};
test('durable explainer API authenticates, isolates ownership and reuses request key',async()=>{
 let calls=0;
 const app=buildApplication({dbPath:join(mkdtempSync(join(tmpdir(),'anatomy-api-')),'app.db'),logger:false,imageConfigKey:'a'.repeat(64),assistantLookup:async()=>[{address:'8.8.8.8',family:4}],assistantFetch:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(scene)}}]}));}});
 try{
 const address=await app.listen(0,'127.0.0.1');const base='http://127.0.0.1:'+address.port;
 const anon=await fetch(base+'/api/v1/explain/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(anon.status,401);
 const config=await fetch(base+'/api/v1/explain/config').then(r=>r.json());assert.equal(config.data.ready,false);
 app.db.prepare('INSERT INTO assistant_provider (id,document) VALUES (1,?)').run(JSON.stringify({enabled:true,endpoint:'https://provider.example/v1/chat/completions',model:'test',dailyLimit:10,encryptedKey:createSecretBox('a'.repeat(64)).encrypt('fake-secret')}));
 const member=async email=>registerUser(app.db,{email,normalizedEmail:email,displayName:'测试',password:'safe-test-password',consentVersion:'test'});
 const a=await member('anatomy-a@example.test'),b=await member('anatomy-b@example.test');
 const headers={'Content-Type':'application/json',Cookie:'nikai_auth='+a.token};
 const submit=()=>fetch(base+'/api/v1/explain/tasks',{method:'POST',headers,body:JSON.stringify({question:'什么是扭矩',requestKey:'request-api-unique-123'})});
 const first=await submit();assert.equal(first.status,202);const job=(await first.json()).data;assert.ok(job.id);assert.ok(!JSON.stringify(job).includes('fake-secret'));
 const second=await submit();assert.equal((await second.json()).data.id,job.id);
 let done;for(let i=0;i<50;i++){done=await fetch(base+'/api/v1/explain/tasks/'+job.id,{headers}).then(r=>r.json()).then(b=>b.data);if(done.state==='ready'||done.state==='failed')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(done.state,'ready');assert.equal(done.scene.title,'测试实验');assert.equal(calls,1);
 assert.equal((await fetch(base+'/api/v1/explain/tasks/'+job.id,{headers:{Cookie:'nikai_auth='+b.token}})).status,404);
 assert.equal((await fetch(base+'/api/v1/explain/tasks/'+job.id)).status,401);
 assert.equal(app.db.prepare('SELECT count FROM assistant_usage WHERE user_id=?').get(a.user.id).count,1);
 }finally{await app.close();}
});
