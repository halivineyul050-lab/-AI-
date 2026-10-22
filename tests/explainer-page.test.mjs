import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';

test('interactive explainer is served with its assets and an honest example-mode boundary',async()=>{
 const app=buildApplication({dbPath:join(mkdtempSync(join(tmpdir(),'nikai-explainer-')),'test.db'),logger:false});
 try{
  const address=await app.listen(0,'127.0.0.1');const base='http://127.0.0.1:'+address.port;
  const response=await fetch(base+'/explain');assert.equal(response.status,200);
  const html=await response.text();assert.ok(html.includes('AI 自由生成'));assert.ok(html.includes('站点已配置的AI模型'));
  assert.ok(html.includes('/explain.js?v='));assert.ok(html.includes('/explain.css?v='));
  assert.ok(response.headers.get('content-security-policy').includes("object-src 'none'"));
  for(const path of ['/explain.js','/explain.css','/explain-ai.mjs','/explain-scene.mjs'])assert.equal((await fetch(base+path)).status,200);
  assert.equal((await fetch(base+'/api/v1/explain/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'解释弹簧'})})).status,401);
  assert.ok((await (await fetch(base+'/utilities')).text()).includes('href="/explain"'));
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
