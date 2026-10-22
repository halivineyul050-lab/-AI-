import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createCreditStore} from '../backend/credits.mjs';
const module=await import('../backend/nestdutio/metering.mjs').catch(()=>({}));
test('billing defaults remain fixed, token rates require explicit valid values',()=>{assert.equal(typeof module.validateBilling,'function');assert.equal(module.defaultBilling.mode,'fixed');assert.throws(()=>module.validateBilling({mode:'tokens'}));assert.deepEqual(module.validateBilling({mode:'tokens',inputCreditsPerMillion:0.000001,outputCreditsPerMillion:2}),{...module.defaultBilling,mode:'tokens',inputCreditsPerMillion:0.000001,outputCreditsPerMillion:2});for(const patch of [{mode:'bad'},{inputCreditsPerMillion:0.0000001},{defaultBudgetCredits:1001},{maxTaskCredits:10001}])assert.throws(()=>module.validateBilling(patch));});
test('usage requires actual counters and ignores nested reasoning/cache counters',()=>{assert.equal(typeof module.normalizeUsage,'function');for(const usage of [undefined,{}, {prompt_tokens:1}, {prompt_tokens:-1,completion_tokens:1},{prompt_tokens:'1',completion_tokens:2}])assert.throws(()=>module.normalizeUsage({usage}),e=>e.code==='nestdutio_usage_unavailable');assert.deepEqual(module.normalizeUsage({usage:{prompt_tokens:3,completion_tokens:4,completion_tokens_details:{reasoning_tokens:2}}}),{promptTokens:3,completionTokens:4});});
test('pricing rounds the aggregate once with exact decimal rates',()=>{assert.equal(typeof module.priceUsage,'function');assert.equal(module.priceUsage({promptTokens:1,completionTokens:1},{inputCreditsPerMillion:500000,outputCreditsPerMillion:500000}),1);assert.equal(module.priceUsage({promptTokens:100000000,completionTokens:0},{inputCreditsPerMillion:0.01,outputCreditsPerMillion:0}),1);assert.equal(module.priceUsage({promptTokens:0,completionTokens:0},{inputCreditsPerMillion:1,outputCreditsPerMillion:1}),0);});
test('request limit accounts for prior aggregate usage and conservative input bytes',()=>{assert.equal(typeof module.limitRequestTokens,'function');const messages=[{role:'user',content:'你好'}],rates={inputCreditsPerMillion:1000000,outputCreditsPerMillion:1000000};const input=Buffer.byteLength(JSON.stringify(messages))+1024;assert.equal(module.limitRequestTokens(messages,2000,{promptTokens:10,completionTokens:20},2000,rates),2000-input-30);assert.equal(module.limitRequestTokens(messages,2000,{promptTokens:10,completionTokens:20},1,rates),0);});
function setup(){const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE user_email_verifications(user_id TEXT PRIMARY KEY);INSERT INTO users VALUES('u')");for(const file of ['027_credits.sql','037_nestdutio_metering.sql'])db.exec(readFileSync(new URL('../backend/migrations/'+file,import.meta.url),'utf8'));const s=createCreditStore(db);s.redeem('u',s.createCodes({credits:100})[0].code);return {db,s};}
test('budget reservation ignores fixed prices, releases unused funds and settles idempotently',()=>{const {db,s}=setup();try{s.configure({modelPrices:{nestdutio:999}});const r=s.reserveBudget('u',{requestId:'r',budgetCredits:30});assert.equal(r.reservedCredits,30);assert.deepEqual(s.wallet('u'),{balance:100,frozen:30});assert.throws(()=>s.settle(r.id,1));assert.throws(()=>s.settleBudget(r.id,31));assert.deepEqual(s.settleBudget(r.id,7),{balance:93,frozen:0});s.settleBudget(r.id,7);assert.throws(()=>s.settleBudget(r.id,8),e=>e.code==='credit_settlement_conflict');assert.equal(s.ledger('u').filter(x=>x.kind==='nestdutio_generation').length,1);assert.equal(db.prepare('SELECT charged_credits FROM credit_reservations WHERE id=?').get(r.id).charged_credits,7);}finally{db.close();}});
test('budget duplicate/overdraw and throwing financial hooks roll back all changes',()=>{const {db,s}=setup();try{assert.throws(()=>s.reserveBudget('u',{requestId:'bad',budgetCredits:20},()=>{throw Error('hook')}));assert.equal(s.wallet('u').frozen,0);const r=s.reserveBudget('u',{requestId:'r',budgetCredits:80});assert.throws(()=>s.reserveBudget('u',{requestId:'r',budgetCredits:1}),e=>e.code==='credit_duplicate_request');assert.throws(()=>s.reserveBudget('u',{requestId:'other',budgetCredits:30}),e=>e.code==='credit_insufficient');assert.throws(()=>s.settleBudget(r.id,10,()=>{throw Error('hook')}));assert.deepEqual(s.wallet('u'),{balance:100,frozen:80});assert.deepEqual(s.settleBudget(r.id,0),{balance:100,frozen:0});const fixed=s.reserve('u',{requestId:'fixed',count:1});assert.throws(()=>s.settleBudget(fixed.id,0));s.settle(fixed.id,1);assert.equal(s.wallet('u').balance,80);}finally{db.close();}});

function race(path,operations){const gate=new SharedArrayBuffer(4),state=new Int32Array(gate);let ready=0;const source=`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const {DatabaseSync}=await import('node:sqlite');const {createCreditStore}=await import(workerData.module);const db=new DatabaseSync(workerData.path);db.exec('PRAGMA busy_timeout=5000');const store=createCreditStore(db);parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.gate),0,0);try{parentPort.postMessage({result:store[workerData.operation.method](...workerData.operation.args,...(workerData.operation.withHook?[()=>db.prepare('INSERT INTO settlement_effects(id) VALUES(?)').run(workerData.operation.args[0])]:[]))});}catch(e){parentPort.postMessage({error:e.code,status:e.statusCode});}finally{db.close();}})();`;return Promise.all(operations.map(operation=>new Promise((resolve,reject)=>{const w=new Worker(source,{eval:true,workerData:{path,module:new URL('../backend/credits.mjs',import.meta.url).href,gate,operation}});w.on('error',reject);w.on('message',m=>{if(m.ready){if(++ready===operations.length){Atomics.store(state,0,1);Atomics.notify(state,0);}}else resolve(m);});})));}
test('independent connections serialize token budget overdraw, duplicate request and actual settlement',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nikai-meter-race-')),path=join(dir,'db.sqlite'),db=new DatabaseSync(path);
 try{
  db.exec("PRAGMA journal_mode=WAL;CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE user_email_verifications(user_id TEXT PRIMARY KEY);INSERT INTO users VALUES('u')");
  for(const file of ['027_credits.sql','037_nestdutio_metering.sql'])db.exec(readFileSync(new URL('../backend/migrations/'+file,import.meta.url),'utf8'));
  db.exec('CREATE TABLE settlement_effects(id TEXT PRIMARY KEY)');
  const s=createCreditStore(db);s.redeem('u',s.createCodes({credits:100})[0].code);
  const attempts=await race(path,[{method:'reserveBudget',args:['u',{requestId:'one',budgetCredits:60}]},{method:'reserveBudget',args:['u',{requestId:'two',budgetCredits:60}]}]);
  assert.equal(attempts.filter(x=>x.result).length,1);assert.equal(attempts.filter(x=>x.status===402).length,1);
  const r=attempts.find(x=>x.result).result;
  const settlements=await race(path,[{method:'settleBudget',args:[r.id,7],withHook:true},{method:'settleBudget',args:[r.id,7],withHook:true}]);
  assert.equal(settlements.filter(x=>x.result).length,2);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM settlement_effects').get().n,1);assert.deepEqual(s.wallet('u'),{balance:93,frozen:0});assert.equal(s.ledger('u').filter(x=>x.kind==='nestdutio_generation').length,1);
  const duplicates=await race(path,[{method:'reserveBudget',args:['u',{requestId:'same',budgetCredits:20}]},{method:'reserveBudget',args:['u',{requestId:'same',budgetCredits:20}]}]);
  assert.equal(duplicates.filter(x=>x.result).length,1);assert.equal(duplicates.filter(x=>x.status===409).length,1);assert.equal(s.wallet('u').frozen,20);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('repeated token settlement runs its durable transaction hook only once',()=>{
 const {db,s}=setup();try{
  db.exec('CREATE TABLE settlement_effects(id TEXT PRIMARY KEY)');
  const r=s.reserveBudget('u',{requestId:'hook-once',budgetCredits:20});
  const hook=()=>db.prepare('INSERT INTO settlement_effects(id) VALUES(?)').run(r.id);
  s.settleBudget(r.id,7,hook);
  assert.deepEqual(s.settleBudget(r.id,7,hook),{balance:93,frozen:0});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM settlement_effects').get().n,1);
 }finally{db.close();}
});
