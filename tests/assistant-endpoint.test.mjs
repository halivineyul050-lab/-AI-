import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../backend/database.mjs';
import {createSecretBox} from '../backend/image-provider-secrets.mjs';
import {createAssistantStore,createAssistantRunner} from '../backend/assistant.mjs';
const lookup=async()=>[{address:'93.184.216.34',family:4}];
test('prefixed provider URLs retain their full path when saved and used for chat',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'assistant-url-'));const db=openDatabase(join(dir,'test.db'));t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 db.prepare("INSERT INTO users (id,email,normalized_email,display_name,password_hash,password_salt,consent_version) VALUES ('u','u@test','u@test','u','x','x','v')").run();
 const store=createAssistantStore(db,createSecretBox('a'.repeat(64)));const target='https://api.stepfun.com/step_plan/v1/chat/completions';
 for(const endpoint of [target,target+'/', 'https://api.stepfun.com/step_plan/v1','https://api.stepfun.com/step_plan/v1/']){
  await store.configure({endpoint,model:'provider-model',apiKey:'test-secret',enabled:true,dailyLimit:10,welcome:'你好'},{lookup});assert.equal(store.config().endpoint,target);
 }
 let called;
 await createAssistantRunner(store,{lookup,fetchImpl:async(url)=>{called=url;return new Response(JSON.stringify({choices:[{message:{content:'你好'}}]}));}}).run('u',{messages:[{role:'user',content:'你好'}]});assert.equal(called,target);
 for(const endpoint of ['https://api.stepfun.com/custom','https://api.stepfun.com/step_plan/v1/messages','https://api.stepfun.com/step_plan/v1?key=secret','http://api.stepfun.com/step_plan/v1','https://user:secret@api.stepfun.com/step_plan/v1'])await assert.rejects(()=>store.configure({endpoint,model:'m',enabled:false,dailyLimit:10,welcome:'你好'},{lookup}),{status:422});
 await assert.rejects(()=>store.configure({endpoint:'https://127.0.0.1/step_plan/v1',model:'m',enabled:false,dailyLimit:10,welcome:'你好'},{lookup}),{status:422});
});
