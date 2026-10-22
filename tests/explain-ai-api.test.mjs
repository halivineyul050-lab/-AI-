import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';
import {registerUser} from '../backend/auth.mjs';
import {createSecretBox} from '../backend/image-provider-secrets.mjs';
const scene={title:'弹簧与力',summary:'改变伸长量',reason:'在弹性限度内力与伸长量成正比',try:'拖动滑块',assumptions:'理想弹簧',variables:{x:30},controls:[{id:'x',label:'伸长',min:0,max:100,step:1}],elements:[{type:'circle',x:['add',100,'$x'],y:100,r:20,fill:'#6558f5'}]};
test('signed-in generation uses existing provider, retains failures as errors and refunds daily usage',async()=>{
 const key='a'.repeat(64);let fail=false;
 const app=buildApplication({dbPath:join(mkdtempSync(join(tmpdir(),'nikai-explain-api-')),'app.db'),logger:false,imageConfigKey:key,assistantLookup:async()=>[{address:'8.8.8.8',family:4}],assistantFetch:async()=>new Response(JSON.stringify({choices:[{message:{content:fail?'not a scene':JSON.stringify(scene)}}]}))});
 try{
 const secret=createSecretBox(key).encrypt('fake-provider-key');
 app.db.prepare('INSERT INTO assistant_provider (id,document) VALUES (1,?)').run(JSON.stringify({enabled:true,endpoint:'https://provider.example/v1/chat/completions',model:'demo-model',dailyLimit:10,encryptedKey:secret}));
 const {token}=await registerUser(app.db,{email:'explainer-api@example.test',normalizedEmail:'explainer-api@example.test',displayName:'测试',password:'a-safe-test-password',consentVersion:'test'});
 const address=await app.listen(0,'127.0.0.1');const url='http://127.0.0.1:'+address.port+'/api/v1/explain/generate';
 const call=()=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:'nikai_auth='+token},body:JSON.stringify({question:'解释弹簧与力的关系'})});
 let response=await call();assert.equal(response.status,200);const data=await response.json();assert.equal(data.data.title,'弹簧与力');assert.ok(!JSON.stringify(data).includes('fake-provider-key'));
 fail=true;response=await call();assert.equal(response.status,502);const problem=await response.json();assert.equal(problem.code,'explainer_invalid_scene');assert.ok(problem.requestId);assert.ok(!JSON.stringify(problem).includes('fake-provider-key'));assert.equal(app.db.prepare('SELECT count FROM assistant_usage').get().count,1);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
