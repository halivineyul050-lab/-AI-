import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatEndpoint,discoverModels} from '../backend/model-discovery.mjs';
const lookup=async()=>[{address:'93.184.216.34',family:4}];
test('normalizes root, version and prefixed full chat endpoints',()=>{
 for(const value of ['https://example.com','https://example.com/v1/','https://example.com/v1/chat/completions'])assert.equal(chatEndpoint(value),'https://example.com/v1/chat/completions');
 assert.equal(chatEndpoint('https://example.com/team/v1'),'https://example.com/team/v1/chat/completions');
 for(const value of ['http://example.com','https://a:b@example.com','https://example.com?x=1','https://example.com/nope'])assert.throws(()=>chatEndpoint(value));
});
test('discovers deduplicated models with supplied or same-service saved key',async()=>{
 let calls=0;
 const fetchImpl=async(url,init)=>{calls++;assert.equal(url,'https://example.com/team/v1/models');assert.equal(init.headers.get('Authorization'),'Bearer test-secret');return Response.json({data:[{id:'b'},{id:'a'},{id:'b'},{id:''}]});};
 const result=await discoverModels({endpoint:'https://example.com/team/v1',apiKey:'test-secret'},{},{lookup,fetchImpl});
 assert.deepEqual(result.items,[{id:'a'},{id:'b'}]);
 await discoverModels({endpoint:'https://example.com/team/v1'}, {endpoint:'https://example.com/team/v1/chat/completions',key:()=> 'test-secret'},{lookup,fetchImpl});
 assert.equal(calls,2);
 await assert.rejects(()=>discoverModels({endpoint:'https://other.example/v1'}, {endpoint:'https://example.com/team/v1',key:()=>{throw Error('must not read');}},{lookup,fetchImpl}),{status:422});
});
test('rejects private destinations, invalid responses and masks provider errors',async()=>{
 const input={endpoint:'https://example.com',apiKey:'test-secret'};
 await assert.rejects(()=>discoverModels(input,{}, {lookup:async()=>[{address:'127.0.0.1',family:4}],fetchImpl:()=>{throw Error('must not fetch');}}));
 for(const response of [new Response('secret upstream detail',{status:401}),Response.json({bad:true}),new Response('x'.repeat(2*1024*1024+1))]){
  await assert.rejects(()=>discoverModels(input,{}, {lookup,fetchImpl:async()=>response}),e=>e.status>=400&&!e.message.includes('secret upstream'));
 }
 let redirects=0;
 await assert.rejects(()=>discoverModels(input,{}, {lookup,fetchImpl:async()=>{redirects++;return new Response(null,{status:302,headers:{location:'https://other.example/v1/models'}});}}));
 assert.equal(redirects,1);
});
