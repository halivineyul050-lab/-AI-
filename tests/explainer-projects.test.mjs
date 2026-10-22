import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {buildApplication} from '../server.mjs';import {registerUser} from '../backend/auth.mjs';
test('project history authenticates and restores persisted records with owner-only filtered pagination',async()=>{
 const app=buildApplication({dbPath:join(mkdtempSync(join(tmpdir(),'explain-projects-')),'app.db'),logger:false});try{
 const address=await app.listen(0,'127.0.0.1'),base='http://127.0.0.1:'+address.port;
 const member=email=>registerUser(app.db,{email,normalizedEmail:email,displayName:'测试',password:'safe-test-password',consentVersion:'test'});
 const a=await member('history-a@example.test'),b=await member('history-b@example.test'),headers={Cookie:'nikai_auth='+a.token};
 const add=(i,user,state='ready',question='月亮项目 '+i)=>{const id='12345678-1234-1234-1234-'+String(i).padStart(12,'0');app.db.prepare('INSERT INTO explainer_tasks(id,user_id,request_key,state,question,mode,level,result,error_code,reservation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user,'history_key_'+i,state,question,'自动','simple',state==='ready'?JSON.stringify({title:'讲解 '+i,summary:'正文不应进入列表'}):'','explainer_timeout','',new Date(1700000000000+i*1000).toISOString(),new Date(1700000000000+i*1000).toISOString());return id;};
 for(let i=1;i<=23;i++)add(i,a.user.id);const failed=add(24,a.user.id,'failed','包含100%_的主题');const active=add(25,a.user.id,'building','进行中的讲解');add(26,b.user.id,'ready','其他用户秘密');
 assert.equal((await fetch(base+'/api/v1/explain/projects')).status,401);
 const response=await fetch(base+'/api/v1/explain/projects',{headers});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const first=(await response.json()).data;assert.equal(first.items.length,20);assert.equal(first.nextOffset,20);assert.equal(first.items[0].id,active);assert.ok(!JSON.stringify(first).includes('正文不应进入列表'));assert.ok(!JSON.stringify(first).includes('其他用户秘密'));
 const second=await fetch(base+'/api/v1/explain/projects?offset=20',{headers}).then(r=>r.json());assert.equal(second.data.items.length,5);assert.equal(second.data.nextOffset,null);
 const filtered=await fetch(base+'/api/v1/explain/projects?state=failed&q='+encodeURIComponent('100%_'),{headers}).then(r=>r.json());assert.deepEqual(filtered.data.items.map(x=>x.id),[failed]);
 const running=await fetch(base+'/api/v1/explain/projects?state=running',{headers}).then(r=>r.json());assert.deepEqual(running.data.items.map(x=>x.id),[active]);
 for(const query of ['offset=-1','offset=1.5','state=bad','q='+encodeURIComponent('长'.repeat(81))])assert.equal((await fetch(base+'/api/v1/explain/projects?'+query,{headers})).status,422);
 assert.equal((await fetch(base+'/api/v1/explain/tasks/'+failed,{headers:{Cookie:'nikai_auth='+b.token}})).status,404);
 const detail=await fetch(base+'/api/v1/explain/tasks/'+failed,{headers}).then(r=>r.json());assert.equal(detail.data.question,'包含100%_的主题');assert.equal(detail.data.error.code,'explainer_timeout');
 // Do not leave a pretend in-flight row for shutdown; no provider was called.
 app.db.prepare("UPDATE explainer_tasks SET state='failed' WHERE id=?").run(active);
 }finally{await app.close();}
});
