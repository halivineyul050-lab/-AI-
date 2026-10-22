import {test} from 'node:test';import assert from 'node:assert/strict';
import {createGenerator} from '../backend/nestdutio/generator.mjs';
import {generationFingerprint,validateCheckpoint,validateManifest} from '../backend/nestdutio/generation-manifest.mjs';
import {nativeFixture} from './fixtures/nestdutio-native.mjs';
const config={ready:true,model:'test',endpoint:'https://example.com/chat/completions',maxTokens:8000};
test('native manifest must contain roots and complete page quartets',()=>{
 const files=nativeFixture().files.map(f=>({path:f.path,purpose:f.path,dependencies:[]}));
 assert.throws(()=>validateManifest({entry:'app.json',files:files.slice(0,1)},{target:'wechat'}));
 assert.throws(()=>validateManifest({entry:'app.json',files:files.filter(f=>!f.path.endsWith('index.wxss'))},{target:'wechat'}));
 assert.doesNotThrow(()=>validateManifest({entry:'app.json',files},{target:'wechat'}));
});
test('native generation plans native acceptance and generates native files with resumable target isolation',async()=>{
 const artifact=nativeFixture(),payloads=[],checkpoints=[];let checked;
 const manifest={entry:'app.json',files:artifact.files.map(f=>({path:f.path,purpose:f.path,dependencies:[]}))};
 const input={target:'wechat',prompt:'制作微信原生计数器'};
 const generator=createGenerator({config:()=>config,key:()=> 'test-key'},{check:async a=>{checked=a;return {ok:true};}},{lookup:async()=>[{address:'8.8.8.8',family:4}],fetchImpl:async(_url,init)=>{
  const payload=JSON.parse(init.body);payloads.push(payload);const path=payloads.length>1?JSON.parse(payload.messages[1].content).file.path:null;
  const content=path?'<<<FILE>>>'+path+'\n'+artifact.files.find(f=>f.path===path).content+'\n<<<END_FILE>>>':JSON.stringify({...artifact,files:undefined,manifest});
  return new Response(JSON.stringify({choices:[{message:{content}}]}));
 }});
 const result=await generator.run(input,{onCheckpoint:cp=>checkpoints.push(validateCheckpoint(cp,input,config))});
 assert.equal(result.target,'wechat');assert.equal(checked.target,'wechat');assert.equal(result.entry,'app.json');assert.equal(checkpoints.at(-1).files.length,8);
 assert.match(payloads[0].messages[0].content,/WXML|wxml/);
 assert.match(payloads[0].messages[0].content,/"kind":"tap"/);
 assert.doesNotMatch(payloads[1].messages[0].content,/返回 JSON 原生计划|files 为/);
 assert.notEqual(generationFingerprint(input,config).configHash,generationFingerprint({...input,target:'web'},config).configHash);
 assert.throws(()=>validateCheckpoint(checkpoints.at(-1),{...input,target:'web'},config),{code:'nestdutio_checkpoint_invalid'});
});

test('native assembly validation reports structural errors for bounded regeneration instead of failing before repair',async()=>{
 const artifact=nativeFixture();let calls=0;
 const manifest={entry:'app.json',files:artifact.files.map(f=>({path:f.path,purpose:f.path,dependencies:[]}))};
 const generator=createGenerator({config:()=>config,key:()=> 'test-key'},{check:async()=>({ok:true})},{lookup:async()=>[{address:'8.8.8.8',family:4}],fetchImpl:async(_url,init)=>{
  calls++;const payload=JSON.parse(init.body),path=calls>1?JSON.parse(payload.messages[1].content).file.path:null;
  let content=path?artifact.files.find(f=>f.path===path).content:null;
  if(calls===2)content='{"pages":["pages/missing/missing"]}';
  return new Response(JSON.stringify({choices:[{message:{content:path?'<<<FILE>>>'+path+'\n'+content+'\n<<<END_FILE>>>':JSON.stringify({...artifact,files:undefined,manifest})}}]}));
 }});
 const result=await generator.run({target:'wechat',prompt:'计数器'});
 assert.equal(result.target,'wechat');assert.equal(calls,17);assert.match(result.files.find(f=>f.path==='app.json').content,/pages\/index/);
});
