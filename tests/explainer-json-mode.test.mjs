import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExplainerRunner} from '../backend/explainer.mjs';
const scene={title:'实验',summary:'观察',reason:'解释',try:'操作',assumptions:'简化',variables:{x:0},controls:[{id:'x',label:'参数',min:0,max:1,step:1}],elements:[{type:'circle',x:1,y:1,r:1}]};
const setup=()=>({config:()=>({ready:true,endpoint:'https://example.com/v1/chat/completions',model:'step-3.7-flash',dailyLimit:10}),key:()=> 'fake-key',assertUser(){},reserve:()=>({token:'t'}),settle(){}});
const lookup=async()=>[{address:'8.8.8.8',family:4}];
test('requests JSON object mode and gives syntax location to one repair',async()=>{
 const payloads=[];const logs=[];const st=setup();const settlements=[];st.settle=(_u,_r,r)=>settlements.push(r);
 const run=createExplainerRunner(st,{lookup,logger:{warn:s=>logs.push(s)},fetchImpl:async(_,init)=>{const p=JSON.parse(init.body);payloads.push(p);return new Response(JSON.stringify({choices:[{message:{content:payloads.length===1?'{"private":1+2}':JSON.stringify(scene)}}]}));}});
 await run.run('u',{question:'测试问题'},{taskId:'d590c9f1-dc44-4881-a270-74038cb8f19d'});
 assert.deepEqual(payloads[0].response_format,{type:'json_object'});assert.match(payloads[1].messages.at(-1).content,/json_syntax.*character\[/);assert.ok(!JSON.stringify(logs).includes('private'));assert.match(JSON.stringify(logs),/d590c9f1/);assert.deepEqual(settlements,[false]);
});
test('providers explicitly rejecting response_format can use legacy mode without an extra charge',async()=>{
 let calls=0;const st=setup();let settled=0;st.settle=()=>settled++;
 const run=createExplainerRunner(st,{lookup,logger:{warn(){}},fetchImpl:async(_,init)=>{const p=JSON.parse(init.body);calls++;if(calls===1)return new Response(JSON.stringify({error:{message:'Unsupported parameter: response_format'}}),{status:400});assert.equal(p.response_format,undefined);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(scene)}}]}));}});
 assert.equal((await run.run('u',{question:'测试问题'})).title,'实验');assert.equal(calls,2);assert.equal(settled,1);
});
for(const status of [400,401,422])test(`unrelated provider rejection ${status} is not retried`,async()=>{
 let calls=0;const refunds=[];const st=setup();st.settle=(_u,_r,refund)=>refunds.push(refund);
 const run=createExplainerRunner(st,{lookup,logger:{warn(){}},fetchImpl:async()=>{calls++;return new Response('{"error":{"message":"Invalid model"}}',{status});}});
 await assert.rejects(run.run('u',{question:'测试问题'}),e=>e.code==='explainer_provider_rejected');assert.equal(calls,1);assert.deepEqual(refunds,[true]);
});
test('invalid JSON after repair refunds exactly once and has a bounded attempt count',async()=>{
 let calls=0;const refunds=[];const st=setup();st.settle=(_u,_r,refund)=>refunds.push(refund);
 const run=createExplainerRunner(st,{lookup,logger:{warn(){}},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'{"x":1+2}'},finish_reason:'stop'}]}));}});
 await assert.rejects(run.run('u',{question:'测试问题'}),e=>e.code==='explainer_invalid_scene');assert.equal(calls,2);assert.deepEqual(refunds,[true]);
});
for(const content of ['',JSON.stringify(scene)])test('truncated output fails immediately without treating the token limit as a scene repair: '+content.length,async()=>{
 let calls=0;const refunds=[],phases=[];const st=setup();st.settle=(_u,_r,r)=>refunds.push(r);
 const run=createExplainerRunner(st,{lookup,logger:{warn(){}},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content},finish_reason:'length'}]}));}});
 await assert.rejects(run.run('u',{question:'测试问题'},{onPhase:p=>phases.push(p)}),e=>e.code==='explainer_output_truncated');
 assert.equal(calls,1);assert.deepEqual(refunds,[true]);assert.equal(phases.includes('repairing'),false);
});
