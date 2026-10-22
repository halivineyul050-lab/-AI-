import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApplication} from '../server.mjs';
import {registerUser} from '../backend/auth.mjs';

test('email verification guards registration, isolates purposes and revokes reset sessions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nikai-email-test-')); const mails=[];
 const app=buildApplication({dbPath:join(dir,'test.db'),logger:false,authEmailEnv:{RESEND_API_KEY:'test-secret',AUTH_EMAIL_FROM:'noreply@ontimo.cn'},authEmailFetch:async(url,init)=>{mails.push(JSON.parse(init.body));return {ok:true,json:async()=>({id:'mail-id'})};}});
 const address=await app.listen(0,'127.0.0.1'); const base=`http://127.0.0.1:${address.port}`;
 const req=async(path,body,cookie)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const registration={displayName:'验证用户',email:'verified@example.com',password:'correct-horse-battery',consentAccepted:true,termsAccepted:true,consentVersion:'2026-07'};
 const code=()=>mails.at(-1).text.match(/\b\d{6}\b/)[0];
 try{
  assert.equal((await req('/api/v1/auth/register',registration)).status,422);
  assert.equal((await req('/api/v1/auth/email-code',{email:registration.email,purpose:'register'})).status,200);
  const registerCode=code();
  assert.equal((await req('/api/v1/auth/email-code',{email:registration.email,purpose:'register'})).status,429);
  assert.equal((await req('/api/v1/auth/reset-password',{email:registration.email,code:registerCode,password:'replacement-password'})).status,422);
  const created=await req('/api/v1/auth/register',{...registration,code:registerCode});assert.equal(created.status,201);assert.equal(created.body.data.user.emailVerified,true);
  assert.equal((await req('/api/v1/auth/email-code',{email:registration.email,purpose:'reset'})).status,200);
  const resetCode=code();assert.equal((await req('/api/v1/auth/reset-password',{email:registration.email,code:'000000'===resetCode?'000001':'000000',password:'replacement-password'})).status,422);
  assert.equal((await req('/api/v1/auth/reset-password',{email:registration.email,code:resetCode,password:'replacement-password'})).status,200);
  assert.equal((await fetch(base+'/api/v1/auth/me',{headers:{Cookie:created.cookie}})).status,401);
  assert.equal((await req('/api/v1/auth/reset-password',{email:registration.email,code:resetCode,password:'replacement-password'})).status,422);
  assert.equal((await req('/api/v1/auth/login',{email:registration.email,password:'replacement-password'})).status,200);
  const legacy=await registerUser(app.db,{...registration,email:'legacy@example.com',normalizedEmail:'legacy@example.com'});const legacyCookie=`nikai_auth=${legacy.token}`;
  const count=mails.length;assert.equal((await req('/api/v1/auth/email-code',{email:'legacy@example.com',purpose:'reset'})).status,200);assert.equal(mails.length,count);
  assert.equal((await req('/api/v1/account/verify-email/send',{password:'wrong-password'},legacyCookie)).status,401);
  assert.equal((await req('/api/v1/account/verify-email/send',{password:registration.password},legacyCookie)).status,200);
  assert.equal((await req('/api/v1/account/verify-email',{code:code(),password:registration.password},legacyCookie)).status,200);
  assert.equal((await req('/api/v1/auth/email-code',{email:'legacy@example.com',purpose:'reset'})).status,429);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('mail failures are visible and registration cannot bypass verification when mail is unconfigured',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nikai-email-fail-'));
 const app=buildApplication({dbPath:join(dir,'test.db'),logger:false,authEmailEnv:{}});const address=await app.listen(0,'127.0.0.1');
 try{const r=await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/email-code`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'member@example.com',purpose:'register'})});assert.equal(r.status,503);}
 finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
