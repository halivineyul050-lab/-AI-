import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGenerator} from '../backend/nestdutio/generator.mjs';
const acceptance=[{kind:'visible',target:'h1'}],artifact={schemaVersion:1,name:'测试',entry:'index.html',files:[{path:'index.html',content:'<h1>测试</h1>'}],capabilities:[],acceptance};
const config={config:()=>({ready:true,endpoint:'https://example.com/v1/chat/completions',model:'test',maxTokens:12000,requestTimeoutSeconds:60}),key:()=> 'private-key-must-never-be-in-progress'};
const lookup=async()=>[{address:'8.8.8.8',family:4}];
test('progress arrives while model is pending, includes repair/check issues but excludes raw output',async()=>{
 const events=[];let release,entered,calls=0;
 const started=new Promise(r=>entered=r),waiting=new Promise(r=>release=r);
 const gen=createGenerator(config,{async check(){return calls<3?{ok:false,issues:[{code:'interaction_failed',path:'acceptance[0]',phase:'result',secret:'never expose'}]}:{ok:true,issues:[]};}},{lookup,fetchImpl:async()=>{calls++;if(calls===1){entered();await waiting;}return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(calls===1?{name:'测试',capabilities:[],acceptance}:artifact)},finish_reason:'stop'}]}));}});
 const running=gen.run({prompt:'测试'},{onProgress:e=>events.push(e)});await started;
 try {assert.ok(events.some(e=>e.code==='model_waiting'&&e.phase==='planning'));} finally {release();}
 await running;
 assert.ok(events.some(e=>e.code==='check_issue'&&e.issue==='interaction_failed'&&e.index===1));
 assert.ok(events.some(e=>e.code==='repair_started'));
 assert.ok(!JSON.stringify(events).includes('never expose'));
 assert.ok(!JSON.stringify(events).includes('private-key'));
});
test('provider HTTP error is classified with safe status before failure',async()=>{
 const events=[],gen=createGenerator(config,{},{lookup,fetchImpl:async()=>new Response('private upstream details',{status:503})});
 await assert.rejects(gen.run({prompt:'测试'},{onProgress:e=>events.push(e)}),{code:'nestdutio_provider_failed'});
 assert.ok(events.some(e=>e.code==='provider_http_error'&&e.status===503&&e.phase==='planning'));
 assert.ok(!JSON.stringify(events).includes('private upstream'));
});
test('truncated output is reported as output limit instead of unexplained JSON repair',async()=>{
 const events=[],gen=createGenerator(config,{},{lookup,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'{partial'},finish_reason:'length'}]}))});
 await assert.rejects(gen.run({prompt:'测试'},{onProgress:e=>events.push(e)}),{code:'nestdutio_output_limit'});
 assert.ok(events.some(e=>e.code==='output_limit'&&e.phase==='planning'));
});
