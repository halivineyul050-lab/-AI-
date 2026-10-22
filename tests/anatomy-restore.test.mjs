import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/explain.js',import.meta.url),'utf8');
test('pending question stays private until server owner lookup succeeds',async()=>{
 const start=source.indexOf('async function recoverPendingTask(');assert.ok(start>=0);
 const question={value:''};let cleared=false,generated=false;
 const ctx=vm.createContext({URLSearchParams,location:{hash:''},pendingTask:()=>({id:'other-user-id',question:'private question'}),fetch:async()=>({}),taskResponse:async()=>{throw Object.assign(Error('not found'),{status:404});},savePending:()=>{cleared=true;},$:(s)=>question,document:{getElementById:()=>({})},generate:()=>{generated=true;}});
 await vm.runInContext(source.slice(start,source.indexOf('\nvoid recoverPendingTask()',start))+';recoverPendingTask()',ctx);
 assert.equal(question.value,'');assert.equal(cleared,true);assert.equal(generated,false);
});
