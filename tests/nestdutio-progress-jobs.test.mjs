import {createGenerator} from '../backend/nestdutio/generator.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createProjects} from '../backend/nestdutio/projects.mjs';
import {createJobs} from '../backend/nestdutio/jobs.mjs';
import {createCreditStore} from '../backend/credits.mjs';
import {appendProgress,readProgress} from '../backend/nestdutio/progress.mjs';
function fixture(t){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE user_email_verifications(user_id TEXT PRIMARY KEY,verified_at TEXT);INSERT INTO users VALUES('a'),('b');");
 for(const name of ['027_credits','033_nestdutio','039_nestdutio_history','040_nestdutio_progress'])db.exec(readFileSync(new URL('../backend/migrations/'+name+'.sql',import.meta.url),'utf8'));
 t.after(()=>db.close());const billing=createCreditStore(db);billing.redeem('a',billing.createCodes({credits:100})[0].code);
 const projects=createProjects(db),project=projects.create('a',{name:'任务'});
 return {db,billing,projects,project};
}
test('in-flight progress is owned, persists in history after failure and refunds once',async t=>{
 const f=fixture(t);let release,entered;
 const waiting=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const jobs=createJobs(f.db,f.projects,{async run(_input,callbacks){
  callbacks.onPhase('planning');callbacks.onProgress({phase:'planning',code:'model_waiting',secret:'private-value'});entered();await waiting;
  callbacks.onPhase('checking');callbacks.onProgress({phase:'checking',code:'check_issue',issue:'interaction_failed',index:2,step:'result',raw:'private-value'});
  throw Object.assign(Error('private-value'),{code:'nestdutio_check_failed'});
 }},f.billing);
 const task=jobs.submit('a',f.project.id,{prompt:'测试',baseVersion:null},'progress-owned-1');await started;
 assert.equal(jobs.get('a',task.id).state,'planning');
 assert.ok(jobs.get('a',task.id).progress.some(e=>e.code==='model_waiting'));
 assert.throws(()=>jobs.get('b',task.id),{status:404});
 assert.throws(()=>f.projects.history('b',f.project.id),{status:404});
 release();await jobs.shutdown();
 const failed=jobs.get('a',task.id);assert.equal(failed.state,'failed');
 assert.equal(failed.progress.at(-1).phase,'checking');assert.equal(failed.progress.at(-1).code,'failed');
 assert.ok(failed.progress.some(e=>e.issue==='interaction_failed'&&e.index===2&&e.step==='result'));
 assert.ok(!JSON.stringify(failed).includes('private-value'));
 assert.equal(f.billing.wallet('a').balance,100);assert.equal(f.billing.wallet('a').frozen,0);
 assert.deepEqual(f.projects.history('a',f.project.id).items[0].progress,failed.progress);
 const recovered=createJobs(f.db,f.projects,{run(){throw Error('must not replay')}},f.billing);
 assert.deepEqual(recovered.get('a',task.id).progress,failed.progress);
 await recovered.shutdown();assert.equal(f.billing.wallet('a').balance,100);
});
test('progress is bounded and only explicitly safe fields/codes survive',t=>{
 const f=fixture(t),id='fixture-task';
 f.db.prepare("INSERT INTO nestdutio_tasks(id,user_id,project_id,request_key,prompt,state,created_at,updated_at) VALUES(?,?,?,?,?,'planning',?,?)").run(id,'a',f.project.id,'bounded-progress','test',new Date().toISOString(),new Date().toISOString());
 for(let i=0;i<522;i++)appendProgress(f.db,id,{phase:'planning',code:'model_waiting',raw:'secret',status:999});
 appendProgress(f.db,id,{phase:'private-phase',code:'model_waiting'});
 appendProgress(f.db,id,{phase:'planning',code:'secret'});
 const events=readProgress(f.db.prepare('SELECT progress_json FROM nestdutio_tasks WHERE id=?').get(id).progress_json);
 assert.equal(events.length,512);assert.ok(!JSON.stringify(events).includes('secret'));assert.ok(events.every(e=>!Object.hasOwn(e,'status')));
 assert.deepEqual(readProgress('not-json'),[]);assert.deepEqual(readProgress('{"bad":true}'),[]);
});

test('48 acceptance checks across two repairs retain planning and every prior failure in durable history',async t=>{
 const f=fixture(t),acceptance=Array.from({length:48},()=>({kind:'visible',target:'h1'})),artifact={schemaVersion:1,name:'大验收',entry:'index.html',files:[{path:'index.html',content:'<h1>测试</h1>'}],capabilities:[],acceptance};
 let requests=0,rounds=0;
 const generator=createGenerator({config:()=>({ready:true,endpoint:'https://example.com/v1/chat/completions',model:'test',maxTokens:16000,requestTimeoutSeconds:60}),key:()=> 'fixture-key'},{
  async check(_artifact,{onProgress}){rounds++;for(let i=1;i<=48;i++){await onProgress({code:'check_started',index:i,total:48});await onProgress({code:'check_passed',index:i,total:48});}return rounds<3?{ok:false,issues:[{code:'runtime_error',path:'scripts'}]}:{ok:true,issues:[]};}
 },{lookup:async()=>[{address:'8.8.8.8',family:4}],fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(++requests===1?{name:artifact.name,capabilities:[],acceptance}:artifact)},finish_reason:'stop'}]}))});
 const jobs=createJobs(f.db,f.projects,generator,f.billing),task=jobs.submit('a',f.project.id,{prompt:'大验收',baseVersion:null},'large-progress-1');
 await jobs.shutdown();const result=jobs.get('a',task.id);
 assert.equal(result.state,'ready');assert.equal(rounds,3);assert.equal(result.progress[0].phase,'queued');
 assert.ok(result.progress.some(e=>e.code==='plan_validated'));
 assert.equal(result.progress.filter(e=>e.code==='check_passed').length,144);
 assert.equal(result.progress.filter(e=>e.code==='check_issue').length,2);
 assert.deepEqual(f.projects.history('a',f.project.id).items[0].progress,result.progress);
});
