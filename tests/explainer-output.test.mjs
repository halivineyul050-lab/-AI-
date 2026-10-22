import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseExplainerOutput,repairHint} from '../backend/explainer-output.mjs';
const sample=()=>({version:2,title:'机构',summary:'观察',reason:'原理',try:'调整',assumptions:'简化',variables:{x:0},controls:[{id:'x',label:'参数',min:0,max:1,step:.1}],parts:[{id:'a',name:'轮',description:'运动',type:'gear',position:[0,0,0],size:[20,20,4],tone:'hi'}],steps:[{title:'观察',text:'观察传动',parts:['a'],values:{x:1},duration:3}]});
test('JSON syntax failure yields position and safe repair instruction, never source text',()=>{
 let error;try{parseExplainerOutput('{"private-question": 1+2}');}catch(e){error=e;}
 assert.equal(error.code,'json_syntax');assert.match(error.path,/^character\[\d+\]$/);
 const hint=repairHint(error);assert.match(hint,/json_syntax/);assert.ok(!hint.includes('private-question'));assert.match(hint,/JSON/);
});
test('invalid scene identifies exact field for repair and rejects unsafe output',()=>{
 const s=sample();s.parts[0].size[1]=-2;let error;try{parseExplainerOutput(JSON.stringify(s));}catch(e){error=e;}
 assert.equal(error.code,'scene_size');assert.equal(error.path,'parts[0].size');assert.match(repairHint(error),/parts\[0\]\.size/);
 s.parts[0].size=[20,20,4];s.parts[0].position[0]=['eval','private-content'];assert.throws(()=>parseExplainerOutput(JSON.stringify(s)),e=>e.code==='scene_expression'&&e.path==='parts[0].position[0]');
});
test('valid code fences remain supported without weakening validation',()=>{assert.equal(parseExplainerOutput('```json\n'+JSON.stringify(sample())+'\n```').version,2);});
test('missing title, variable arrays and unsupported tones identify repairable schema fields',()=>{
 for(const [mutate,code,path] of [
  [s=>delete s.title,'scene_text','title'],
  [s=>s.variables=[{id:'x',value:0}],'scene_variables','variables'],
  [s=>s.parts[0].tone='metal','scene_tone','parts[0].tone'],
  [s=>{s.controls[0].name='参数';delete s.controls[0].label;},'scene_text','controls[0].label']
 ]){const s=sample();mutate(s);assert.throws(()=>parseExplainerOutput(JSON.stringify(s)),e=>e.code===code&&e.path===path&&repairHint(e).includes(path));}
});
