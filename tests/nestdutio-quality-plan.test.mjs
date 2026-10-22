import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGenerator} from '../backend/nestdutio/generator.mjs';
import {validateQualityPlan} from '../backend/nestdutio/business-quality.mjs';

test('mortgage planning rejects a model arithmetic error before code generation',()=>{
 const steps=[{kind:'fill',target:'#principal',input:'120000'},{kind:'fill',target:'#annual-rate',input:'6'},{kind:'fill',target:'#months',input:'12'},{kind:'clickText',target:'#calculate',output:'#monthly-payment',value:'10328.14'}];
 assert.throws(()=>validateQualityPlan({kind:'mortgage'},steps),{code:'nestdutio_artifact_invalid'});
 const r=.06/12,expected=120000*r/(1-(1+r)**-12);
 steps[3].value=expected.toFixed(2);
 assert.doesNotThrow(()=>validateQualityPlan({kind:'mortgage'},steps));
 steps[1].input='12';steps[3].output='#total-interest';steps[3].value='7942.2';
 assert.throws(()=>validateQualityPlan({kind:'mortgage'},steps),{code:'nestdutio_artifact_invalid'});
});

test('calculator planning repairs premature result assertions before freezing acceptance',async()=>{
 const bad=[{kind:'fillText',target:'[data-nest-check="principal"]',input:'120000',output:'[data-nest-check="monthly-payment"]',value:'10000'}];
 const good=[{kind:'fill',target:'[data-nest-check="principal"]',input:'120000'},{kind:'fill',target:'[data-nest-check="annual-rate"]',input:'0'},{kind:'fill',target:'[data-nest-check="months"]',input:'12'},{kind:'clickText',target:'[data-nest-check="calculate"]',output:'[data-nest-check="monthly-payment"]',value:'10000'}];
 const payloads=[];let calls=0;
 const generator=createGenerator({config:()=>({ready:true,model:'fixture',endpoint:'https://example.com/chat/completions'}),key:()=> 'test-key'}, {check:async()=>({ok:true})},{lookup:async()=>[{address:'8.8.8.8',family:4}],fetchImpl:async(_url,init)=>{
  payloads.push(JSON.parse(init.body));calls++;
  const content=calls<3?{name:'房贷',capabilities:[],acceptance:calls===1?bad:good}:{schemaVersion:1,name:'房贷',entry:'index.html',files:[{path:'index.html',content:'<h1>Calculator</h1>'}]};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}));
 }});
 const result=await generator.run({prompt:'房贷计算器'});
 assert.deepEqual(result.acceptance,good);
 assert.equal(calls,3);
 assert.match(payloads[1].messages.at(-1).content,/fill.*clickText/);
});
