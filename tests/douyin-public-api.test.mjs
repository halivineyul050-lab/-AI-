import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';
import {registerUser} from '../backend/auth.mjs';

test('online Douyin status is public, parsing requires login and rejects cross-site requests',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'douyin-api-'));let calls=0;
 const app=buildApplication({dbPath:join(dir,'test.db'),autoSeed:false,logger:false,environment:'test',adminToken:'douyin-test-only',linkPublicEnabled:true,linkExtractPublic:async()=>{calls++;return {platform:'douyin',id:'123',video:'https://v1.douyinvod.com/a.mp4',text:'caption',cover:null};}});
 const user=await registerUser(app.db,{email:'douyin@example.test',normalizedEmail:'douyin@example.test',displayName:'test',password:'douyin-test-password',consentVersion:'2026-07'},{emailVerified:true});
 const address=await app.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${address.port}`;
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const post=headers=>fetch(base+'/api/utilities/link-extract',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({text:'https://v.douyin.com/abc/'})});
 const status=await fetch(base+'/api/utilities/link-extract/status');assert.equal((await status.json()).data.mode,'public');
 assert.equal((await post({})).status,401);assert.equal(calls,0);
 const headers={Cookie:`nikai_auth=${user.token}`};
 assert.equal((await post({...headers,Origin:'https://evil.test'})).status,403);assert.equal(calls,0);
 assert.equal((await post({...headers,'Sec-Fetch-Site':'cross-site'})).status,403);
 const parsed=await post(headers);assert.equal(parsed.status,200);const result=(await parsed.json()).data;assert.ok(result.video);assert.equal(result.audio,null);assert.equal(calls,1);
 assert.equal((await fetch(base+result.video)).status,401);
});
