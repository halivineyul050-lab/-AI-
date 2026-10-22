import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';
import {createSecretBox} from '../backend/image-provider-secrets.mjs';
test('all admin scopes discover models without saving credentials or exposing them',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'model-discovery-'));let calls=0;
 const app=buildApplication({dbPath:join(dir,'test.db'),logger:false,environment:'test',autoSeed:false,adminToken:'test-admin',imageConfigKey:'a'.repeat(64),modelDiscoveryLookup:async()=>[{address:'93.184.216.34',family:4}],modelDiscoveryFetch:async()=>{calls++;return Response.json({data:[{id:'model-a'}]});}});
 const address=await app.listen(0,'127.0.0.1');t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const request=(body,auth=true)=>fetch(`http://127.0.0.1:${address.port}/api/admin/v1/model-discovery`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test-admin'}:{})},body:JSON.stringify(body)});
 const body={scope:'assistant',endpoint:'https://example.com',apiKey:'test-secret'};
 assert.equal((await fetch(`http://127.0.0.1:${address.port}/admin-model-picker.js`)).status,200);
 assert.equal((await request(body,false)).status,401);assert.equal(calls,0);
 for(const scope of ['assistant','explainer','nestdutio','skills','news-sync','image']){const response=await request({...body,scope});assert.equal(response.status,200);assert.deepEqual((await response.json()).data,{items:[{id:'model-a'}]});}
 assert.equal((await request({...body,scope:'invalid'})).status,422);
 assert.equal((await request({...body,apiKey:''})).status,422);
 assert.equal(app.db.prepare('SELECT document FROM assistant_provider').get(),undefined);
 const encryptedKey=createSecretBox('a'.repeat(64)).encrypt('saved-test-key');
 for(const [scope,table] of [['assistant','assistant_provider'],['explainer','explainer_provider'],['nestdutio','nestdutio_config'],['skills','skills_provider']]){
  app.db.prepare(`INSERT INTO ${table}(id,document) VALUES(1,?)`).run(JSON.stringify({mode:'independent',enabled:false,endpoint:'https://example.com/v1/chat/completions',model:'saved',encryptedKey}));
  assert.equal((await request({...body,scope,apiKey:''})).status,200);
  assert.equal((await request({...body,scope,apiKey:'',endpoint:'https://other.example'})).status,422);
 }
});
