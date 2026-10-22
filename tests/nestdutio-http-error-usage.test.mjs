import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGenerator} from '../backend/nestdutio/generator.mjs';
const config={config:()=>({ready:true,model:'test',endpoint:'https://example.com/chat/completions'}),key:()=> 'test-key'};
const lookup=async()=>[{address:'8.8.8.8',family:4}];
const usage={prompt_tokens:100,completion_tokens:20};

test('HTTP failures keep any valid supplier usage in the request ledger',async()=>{
 const events=[];
 const generator=createGenerator(config,{check:async()=>({ok:true})},{lookup,fetchImpl:async()=>new Response(JSON.stringify({error:{message:'provider failed'},usage}),{status:500})});
 await assert.rejects(generator.run({prompt:'网页'},{onRequest:e=>events.push(e)}),{code:'nestdutio_provider_failed'});
 assert.equal(events.length,1);assert.equal(events[0].status,'http_error');assert.equal(events[0].usage.status,'reported');assert.equal(events[0].usage.promptTokens,100);
});

test('JSON-mode fallback retains reported error usage and counts it once in token billing',async()=>{
 const plan={name:'A',capabilities:[],acceptance:[{kind:'visible',target:'h1'}]};
 const artifact={schemaVersion:1,...plan,entry:'index.html',files:[{path:'index.html',content:'<h1>A</h1>'}]};
 let calls=0;const events=[],metered=[];
 const generator=createGenerator(config,{check:async()=>({ok:true})},{lookup,fetchImpl:async()=>{
  calls++;return new Response(JSON.stringify(calls===1?{error:{message:'response_format unsupported'},usage}:{choices:[{message:{content:JSON.stringify(calls===2?plan:artifact)}}],usage}),{status:calls===1?400:200});
 }});
 await generator.run({prompt:'网页'},{onRequest:e=>events.push(e),onUsage:u=>metered.push(u)});
 assert.equal(events.length,3);assert.equal(metered.length,3);assert.equal(metered.reduce((n,u)=>n+u.promptTokens,0),300);
});
