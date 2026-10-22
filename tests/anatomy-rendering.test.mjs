import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderAnatomyFrame} from '../public/anatomy-renderer.mjs';
import {validateScene} from '../public/explain-scene.mjs';
const scene=type=>validateScene({version:2,title:'结构实验',summary:'观察',reason:'因果',try:'拖动',assumptions:'简化',variables:{x:0},controls:[{id:'x',label:'转角',min:0,max:90,step:1}],parts:[{id:'part',name:'部件 <安全>',description:'功能',type,position:['$x',0,0],size:[40,30,12],tone:'mid',rotation:'$x',explode:[0,0,20]}],steps:[{title:'起点',text:'观察',parts:['part'],values:{x:0},duration:1},{title:'转动',text:'观察转动',parts:['part'],values:{x:90},duration:1}]});
test('every supported primitive renders finite visible geometry, including gears and pipes',()=>{
 for(const type of ['box','cylinder','gear','spring','pipe','sphere']){
  const s=scene(type),svg=renderAnatomyFrame(s,{x:0});
  assert.match(svg,/<svg/);assert.match(svg,/data-part="part"/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);assert.match(svg,/部件 &lt;安全&gt;/);
  assert.notEqual(renderAnatomyFrame(s,{x:45}),renderAnatomyFrame(s,{x:90}));
 }
});
test('exploded and zoomed views stay centered and geometry failures are explicit',()=>{
 const s=scene('gear');assert.notEqual(renderAnatomyFrame(s,{x:0}),renderAnatomyFrame(s,{x:0},{apart:1,zoom:1.4}));
 assert.throws(()=>renderAnatomyFrame(s,{x:Infinity}));
});
test('a wide base cannot cover the rear gear because its center is nearer',()=>{
 const s=scene('gear');s.parts[0].position=[-30,0,0];
 s.parts.push({...s.parts[0],id:'base',name:'底座',type:'box',position:[0,0,-12],size:[150,80,10],rotation:0});
 const svg=renderAnatomyFrame(s,{x:0});
 assert.ok(svg.indexOf('data-part="base"')<svg.indexOf('data-part="part"'),'draw the supporting base first');
});
test('orbit bounds include intermediate motion even when both endpoints coincide',()=>{
 const s=scene('sphere');s.variables.x=0;s.controls[0].max=Math.PI*2;s.controls[0].step=.01;
 s.steps[1].values.x=Math.PI*2;s.parts[0].position=[['mul',200,['sin','$x']],0,0];s.parts[0].size=[10,10,10];
 for(const x of [0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2]){
  const svg=renderAnatomyFrame(s,{x}),m=/<ellipse[^>]*cx="([^"]+)" cy="([^"]+)" rx="([^"]+)" ry="([^"]+)"/.exec(svg);assert.ok(m);
  const [cx,cy,rx,ry]=m.slice(1).map(Number);assert.ok(cx-rx>=0&&cx+rx<=800&&cy-ry>=0&&cy+ry<=500);
 }
 s.parts[0].position=[['mul',200,['sin',['mul',40,'$x']]],0,0];
 const highFrequency=renderAnatomyFrame(s,{x:Math.PI/80});
 const center=Number(/<ellipse[^>]*cx="([^"]+)"/.exec(highFrequency)[1]);assert.ok(center>0&&center<800,'unsampled extrema remain visible too');
});
test('recognizable profile contours and semantic palettes are bounded data, never markup',()=>{
 const s=scene('box');s.parts[0]={...s.parts[0],type:'profile',palette:'coral',outline:[[0,-.5],[-.5,0],[-.3,.5],[0,.3],[.3,.5],[.5,0]]};
 const valid=validateScene(s),svg=renderAnatomyFrame(valid,{x:0});assert.match(svg,/data-palette="coral"/);assert.match(svg,/iso-top/);
 for(const change of [p=>p.outline=[[0,0],[0,0],[0,0]],p=>p.outline[0][0]=.6,p=>p.outline=Array.from({length:65},()=>[0,0]),p=>p.outline[0][0]='<script>',p=>p.palette='red" onclick="alert(1)']){
  const bad=structuredClone(s);change(bad.parts[0]);assert.throws(()=>validateScene(bad));
 }
});
test('bounded scale expressions visibly contract parts and survive scene restore',()=>{
 const s=scene('sphere');s.parts[0].scale=['add',.5,['mul','$x',.005]];
 const valid=validateScene(s);assert.deepEqual(validateScene(JSON.parse(JSON.stringify(valid))).parts[0].scale,s.parts[0].scale);
 assert.notEqual(renderAnatomyFrame(valid,{x:0}),renderAnatomyFrame(valid,{x:90}));
 for(const scale of [0,4,['div',1,0],['eval','alert(1)']]){const bad=structuredClone(s);bad.parts[0].scale=scale;assert.throws(()=>validateScene(bad));}
});
