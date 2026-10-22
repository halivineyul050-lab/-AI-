import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {unzipSync,strFromU8} from 'fflate';
import {buildApplication} from '../server.mjs';import {registerUser} from '../backend/auth.mjs';
import {createCreditStore} from '../backend/credits.mjs';import {createSecretBox} from '../backend/image-provider-secrets.mjs';
import {nativeFixture} from './fixtures/nestdutio-native.mjs';
import {deleteUserAccount} from '../backend/database.mjs';

test('native API generates and exports the correct target, persists AppID and guides real WeChat handoff privately',async t=>{
 const root=mkdtempSync(join(tmpdir(),'nestdutio-native-api-')),artifact=nativeFixture();let calls=0;
 const app=buildApplication({dbPath:join(root,'db.sqlite'),logger:false,imageConfigKey:'a'.repeat(64),publicBaseUrl:'http://127.0.0.1:4400',nestdutioLookup:async()=>[{address:'8.8.8.8',family:4}],nestdutioFetch:async(_url,init)=>{
  calls++;const payload=JSON.parse(init.body),path=calls>1?JSON.parse(payload.messages[1].content).file.path:null;
  const content=path?'<<<FILE>>>'+path+'\n'+artifact.files.find(f=>f.path===path).content+'\n<<<END_FILE>>>':JSON.stringify({...artifact,files:undefined,manifest:{entry:'app.json',files:artifact.files.map(f=>({path:f.path,purpose:f.path,dependencies:[]}))}});
  return new Response(JSON.stringify({usage:{prompt_tokens:100,completion_tokens:20},choices:[{message:{content}}]}));
 }});t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
 const register=email=>registerUser(app.db,{email,normalizedEmail:email,displayName:'Native',password:'long-safe-password',consentVersion:'test'});
 const {token,user}=await register('native@example.test'),other=await register('native-other@example.test');
 const credits=createCreditStore(app.db);credits.redeem(user.id,credits.createCodes({credits:100})[0].code);
 app.db.prepare('INSERT INTO assistant_provider(id,document) VALUES(1,?)').run(JSON.stringify({enabled:true,endpoint:'https://example.com/chat/completions',model:'fixture',encryptedKey:createSecretBox('a'.repeat(64)).encrypt('test-key')}));
 app.db.prepare('INSERT INTO nestdutio_config(id,document) VALUES(1,?)').run(JSON.stringify({mode:'inherit',enabled:true,maxTokens:8000,requestTimeoutSeconds:180}));
 const address=await app.listen(0,'127.0.0.1'),base='http://127.0.0.1:'+address.port+'/api/v1/nestdutio';
 const request=(path,{method='GET',body,who=token}={})=>fetch(base+path,{method,headers:{Cookie:'nikai_auth='+who,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const project=(await(await request('/projects',{method:'POST',body:{target:'wechat'}})).json()).data;
 assert.equal(project.target,'wechat');
 const submitted=await request('/projects/'+project.id+'/tasks',{method:'POST',body:{prompt:'原生计数器',baseVersion:null,requestKey:'native-api-first'}});assert.equal(submitted.status,202);
 const task=(await submitted.json()).data;let result;
 for(let n=0;n<100;n++){result=(await(await request('/tasks/'+task.id)).json()).data;if(['ready','failed'].includes(result.state))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(result.state,'ready',JSON.stringify(result));assert.equal(result.usage.requestCount,9);assert.equal(credits.wallet(user.id).balance,80);
 const versionPath='/projects/'+project.id+'/versions/'+result.versionId;
 const version=(await(await request(versionPath)).json()).data;assert.equal(version.artifact.target,'wechat');assert.equal(version.artifact.verification.compile,'pending');
 const simulated=await request(versionPath+'/preview',{method:'POST',body:{}});assert.equal(simulated.status,200);assert.match((await simulated.json()).data.url,/index\.html$/);assert.equal((await request(versionPath+'/preview',{method:'POST',body:{},who:other.token})).status,404);
 assert.equal((await request('/projects/'+project.id+'/publish',{method:'POST',body:{}})).status,422);
 const settingsPath='/projects/'+project.id+'/wechat';assert.equal((await request(settingsPath,{who:other.token})).status,404);
 assert.equal((await request(settingsPath,{method:'PUT',body:{AppSecret:'no'}})).status,422);
 const settings=await request(settingsPath,{method:'PUT',body:{appId:'wx0123456789abcdef',version:'1.0.0',description:'首版体验'}});assert.equal(settings.status,200);
 const handoff=(await(await request(settingsPath+'/handoff',{method:'POST',body:{versionId:result.versionId}})).json()).data;assert.equal(handoff.status,'action_required');assert.ok(handoff.pending.some(x=>x.id==='deviceTest'));
 const exported=await request(versionPath+'/export');assert.equal(exported.status,200);const files=unzipSync(new Uint8Array(await exported.arrayBuffer()));
 assert.equal(JSON.parse(strFromU8(files['project.config.json'])).appid,'wx0123456789abcdef');assert.ok(files['pages/index/index.wxml']);assert.ok(files['nestdutio-wechat-devtools.mjs']);assert.match(strFromU8(files['README.md']),/扫码|二维码/);
 assert.equal((await request(versionPath+'/export',{who:other.token})).status,404);
 app.db.exec('PRAGMA foreign_keys=OFF');
 assert.equal(deleteUserAccount(app.db,user.id),true);
 for(const table of ['nestdutio_project_targets','nestdutio_wechat_settings'])assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE project_id=?').get(project.id).n,0);
});
