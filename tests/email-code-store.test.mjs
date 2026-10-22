import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../backend/database.mjs';
import {createAuthEmailService} from '../backend/auth-email.mjs';

function fixture(){const dir=mkdtempSync(join(tmpdir(),'nikai-codes-'));const db=openDatabase(join(dir,'test.db'));let time=Date.now();const mails=[];let fail=false;
 const service=createAuthEmailService(db,{env:{RESEND_API_KEY:'test-secret',AUTH_EMAIL_FROM:'noreply@ontimo.cn'},now:()=>time,fetchImpl:async(_url,init)=>{mails.push(JSON.parse(init.body));return {ok:!fail,json:async()=>({id:'receipt'})};}});
 return {db,service,mails,advance:n=>time+=n,fail:()=>fail=true,code:()=>mails.at(-1).text.match(/\b\d{6}\b/)[0],close:()=>{db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('code expiry, wrong email, five attempts and six-digit format are enforced',async()=>{
 const f=fixture();try{
  await f.service.issue('Member@Example.com','register');const code=f.code();
  const row=f.db.prepare('SELECT * FROM auth_email_codes').get();assert.notEqual(row.code_hash,code);assert.equal(row.code_hash.length,64);
  assert.throws(()=>f.service.authorize('other@example.com','register',code),{code:'invalid_email_code'});
  assert.throws(()=>f.service.authorize('member@example.com','verify',code),{code:'invalid_email_code'});
  assert.throws(()=>f.service.authorize('member@example.com','register','123'),{code:'invalid_email_code'});
  for(let i=0;i<5;i++)assert.throws(()=>f.service.authorize('member@example.com','register',code==='000000'?'000001':'000000'),{code:'invalid_email_code'});
  assert.throws(()=>f.service.authorize('member@example.com','register',code),{code:'invalid_email_code'});
  f.advance(60_001);await f.service.issue('member@example.com','register');const next=f.code();f.advance(600_000);
  assert.throws(()=>f.service.authorize('member@example.com','register',next),{code:'invalid_email_code'});
 }finally{f.close();}
});
test('concurrent closures can consume once and a failed transaction preserves the code',async()=>{
 const f=fixture();try{
  await f.service.issue('member@example.com','register');const a=f.service.authorize('member@example.com','register',f.code());const b=f.service.authorize('member@example.com','register',f.code());
  f.db.exec('BEGIN IMMEDIATE');a();f.db.exec('ROLLBACK');b();assert.throws(a,{code:'invalid_email_code'});
 }finally{f.close();}
});
test('concurrent sends reserve cooldown and provider failures never activate codes',async()=>{
 const f=fixture();try{
  const first=f.service.issue('member@example.com','register');await assert.rejects(f.service.issue('member@example.com','register'),{code:'email_code_cooldown'});await first;
  f.advance(60_001);f.fail();await assert.rejects(f.service.issue('member@example.com','register'),{code:'email_send_failed'});
  assert.equal(f.db.prepare('SELECT delivered FROM auth_email_codes ORDER BY created_at DESC LIMIT 1').get().delivered,0);
  assert.throws(()=>f.service.authorize('member@example.com','register',f.code()),{code:'invalid_email_code'});
 }finally{f.close();}
});
test('per-email hourly quota spans different purposes',async()=>{
 const f=fixture();try{
  for(let i=0;i<5;i++){await f.service.issue('member@example.com',i%2?'verify':'register');f.advance(60_001);}
  await assert.rejects(f.service.issue('member@example.com','register'),{code:'email_code_rate_limit'});
 }finally{f.close();}
});
