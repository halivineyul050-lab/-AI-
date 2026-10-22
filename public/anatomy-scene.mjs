// Pure allow-list validation. Geometry is data; provider text never becomes markup.
const id=/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const fail=(code='invalid_scene',path='scene')=>{const error=Error('Invalid anatomy scene');error.code=code;error.path=path;throw error;};
const text=(x,max,path='scene')=>{if(typeof x!=='string'||x.length>max)fail('scene_text',path);return x;};
const bounded=(x,max=2000)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=max;
const vector=(v,positive=false)=>{if(!Array.isArray(v)||v.length!==3||!v.every(x=>bounded(x)&&(!positive||x>0)))fail();return [...v];};
export function anatomyStepValues(scene,index){const values={...scene.variables};for(const step of scene.steps.slice(0,index+1))Object.assign(values,step.values);return values;}
export function validateAnatomy(raw,evaluate){
 if(!raw||raw.version!==2||JSON.stringify(raw).length>48000)fail();
 const out={version:2};for(const key of ['title','summary','reason','try','assumptions'])out[key]=text(raw[key],key==='title'?120:2000,key);
 if(!raw.variables||typeof raw.variables!=='object'||Array.isArray(raw.variables)||Object.keys(raw.variables).length>10)fail('scene_variables','variables');
 out.variables={};for(const [key,value]of Object.entries(raw.variables)){if(!/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/.test(key)||!bounded(value,100000))fail('scene_variables','variables');out.variables[key]=value;}
 if(!Array.isArray(raw.controls)||raw.controls.length>6)fail('scene_controls','controls');const controls=new Map();
 out.controls=raw.controls.map((c,i)=>{if(!c||!Object.hasOwn(out.variables,c.id)||controls.has(c.id)||![c.min,c.max,c.step].every(x=>bounded(x,100000))||c.min>=c.max||c.step<=0||(c.max-c.min)/c.step>10000||out.variables[c.id]<c.min||out.variables[c.id]>c.max)fail('scene_controls',`controls[${i}]`);const v={id:c.id,label:text(c.label,80,`controls[${i}].label`),min:c.min,max:c.max,step:c.step};controls.set(c.id,v);return v;});
 if(!Array.isArray(raw.parts)||!raw.parts.length||raw.parts.length>80)fail('scene_parts','parts');const ids=new Set();
 out.parts=raw.parts.map((p,i)=>{if(p&&!['lo','mid','hi','lit'].includes(p.tone))fail('scene_tone',`parts[${i}].tone`);if(!p||!id.test(p.id)||ids.has(p.id)||!['box','cylinder','gear','spring','pipe','sphere','profile'].includes(p.type)||!['lo','mid','hi','lit'].includes(p.tone))fail('scene_parts',`parts[${i}]`);ids.add(p.id);
 if(p.palette!==undefined&&!['slate','blue','coral','teal','amber','violet'].includes(p.palette))fail('scene_parts',`parts[${i}].palette`);
 let outline;if(p.type==='profile'){
  if(!Array.isArray(p.outline)||p.outline.length<3||p.outline.length>64||p.outline.some(v=>!Array.isArray(v)||v.length!==2||v.some(n=>!bounded(n,.5))))fail('scene_parts',`parts[${i}].outline`);
  const area=p.outline.reduce((sum,a,j)=>{const b=p.outline[(j+1)%p.outline.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
  if(Math.abs(area)<.01)fail('scene_parts',`parts[${i}].outline`);outline=p.outline.map(v=>[...v]);
 }
 if(!Array.isArray(p.position)||p.position.length!==3)fail('scene_expression',`parts[${i}].position`);return {id:p.id,name:text(p.name,80,`parts[${i}].name`),description:text(p.description,1000,`parts[${i}].description`),type:p.type,...(outline?{outline}:{}),...(p.palette?{palette:p.palette}:{}),position:p.position.map(x=>structuredClone(x)),size:(()=>{try{return vector(p.size,true);}catch{fail('scene_size',`parts[${i}].size`);}})(),tone:p.tone,rotation:structuredClone(p.rotation??0),...(p.scale!==undefined?{scale:structuredClone(p.scale)}:{}),explode:vector(p.explode??[0,0,0])};});
 if(!Array.isArray(raw.steps)||!raw.steps.length||raw.steps.length>12)fail('scene_steps','steps');
 out.steps=raw.steps.map((s,i)=>{if(!s||!Array.isArray(s.parts)||s.parts.length>80||s.parts.some(x=>!ids.has(x))||!s.values||typeof s.values!=='object'||Array.isArray(s.values)||!bounded(s.duration,30)||s.duration<1)fail('scene_steps',`steps[${i}]`);const values={};for(const [key,value]of Object.entries(s.values)){const c=controls.get(key);if(!c||!bounded(value,100000)||value<c.min||value>c.max)fail('scene_steps',`steps[${i}].values`);values[key]=value;}return {title:text(s.title,120,`steps[${i}].title`),text:text(s.text,2000,`steps[${i}].text`),parts:[...new Set(s.parts)],values,duration:s.duration};});
 if(raw.view!==undefined){const v=raw.view;if(!v||!Number.isInteger(v.step)||v.step<0||v.step>=out.steps.length||!v.variables||typeof v.variables!=='object'||Array.isArray(v.variables)||![0,1].includes(v.apart)||!bounded(v.zoom,2)||v.zoom<.6)fail();const variables={...anatomyStepValues(out,v.step)};for(const [key,value]of Object.entries(v.variables)){if(!Object.hasOwn(out.variables,key)||!bounded(value,100000))fail();const c=controls.get(key);if(c?(value<c.min||value>c.max):value!==out.variables[key])fail();variables[key]=value;}out.view={step:v.step,variables,apart:v.apart,zoom:v.zoom};}
 const samples=[out.variables];for(const c of out.controls)for(let i=0;i<=20;i++)samples.push({...out.variables,[c.id]:c.min+(c.max-c.min)*i/20});let phase={...out.variables};for(const s of out.steps){phase={...phase,...s.values};samples.push(phase);}
 if(out.view)samples.push(out.view.variables);
 // Sample combined phases too; arbitrary controls are checked again before rendering.
 for(let i=0;i<=20;i++)samples.push({...out.variables,...Object.fromEntries(out.controls.map(c=>[c.id,c.min+(c.max-c.min)*i/20]))});
 for(let mask=0;mask<2**out.controls.length;mask++)samples.push({...out.variables,...Object.fromEntries(out.controls.map((c,i)=>[c.id,mask&(1<<i)?c.max:c.min]))});
 for(const values of samples)for(const [i,p] of out.parts.entries())for(const [j,expression] of [...p.position,p.rotation].entries()){try{if(!bounded(evaluate(expression,values),10000))fail();}catch{fail('scene_expression',j===3?`parts[${i}].rotation`:`parts[${i}].position[${j}]`);}}
  for(const values of samples)for(const [i,p]of out.parts.entries())if(p.scale!==undefined){let scale;try{scale=evaluate(p.scale,values);}catch{fail('scene_expression',`parts[${i}].scale`);}if(typeof scale!=='number'||!Number.isFinite(scale)||scale<.1||scale>3)fail('scene_expression',`parts[${i}].scale`);}
 return out;
}
