import {validateAnatomy} from './anatomy-scene.mjs?v=20261019-quality-1';
const operations={
 add:(...a)=>a.reduce((x,y)=>x+y,0),sub:(a,b)=>a-b,mul:(...a)=>a.reduce((x,y)=>x*y,1),div:(a,b)=>a/b,
 sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,abs:Math.abs,pow:Math.pow,min:Math.min,max:Math.max,round:Math.round,floor:Math.floor,
 concat:(...a)=>a.join(''),lt:(a,b)=>a<b,gt:(a,b)=>a>b,lte:(a,b)=>a<=b,gte:(a,b)=>a>=b,eq:(a,b)=>a===b,if:(a,b,c)=>a?b:c
};
export function evaluate(value,variables,depth=0){
 if(depth>12)throw Error('Expression depth exceeded');
 if(Array.isArray(value)){const [op,...args]=value;if(!Object.hasOwn(operations,op)||args.length>12)throw Error('Unsupported expression');const result=operations[op](...args.map(x=>evaluate(x,variables,depth+1)));if(typeof result==='number'&&!Number.isFinite(result))throw Error('Non-finite expression');return result;}
 if(typeof value==='string'&&value.startsWith('$')){const key=value.slice(1);if(!Object.hasOwn(variables,key))throw Error('Unknown variable');return variables[key];}
 if(typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=1500||typeof value==='boolean')return value;
 throw Error('Invalid value');
}
const props={circle:['x','y','r','fill','stroke','opacity'],rect:['x','y','width','height','fill','stroke','opacity'],line:['x','y','x2','y2','stroke','width','opacity'],text:['x','y','text','fill','size','opacity']};
export function validateScene(raw){
 if(raw?.version===2)return validateAnatomy(raw,evaluate);
 if(raw?.version!==undefined&&raw.version!==1)throw Error('Unsupported scene version');
 if(!raw||typeof raw!=='object'||JSON.stringify(raw).length>48000)throw Error('Scene too large');
 for(const key of ['title','summary','reason','try','assumptions'])if(typeof raw[key]!=='string'||raw[key].length>(key==='title'?120:2000))throw Error('Invalid description');
 if(!raw.variables||Array.isArray(raw.variables)||typeof raw.variables!=='object'||Object.keys(raw.variables).length>10)throw Error('Invalid variables');
 const variables={};for(const [key,value]of Object.entries(raw.variables)){if(!/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/.test(key)||!Number.isFinite(value)||Math.abs(value)>100000)throw Error('Invalid variable');variables[key]=value;}
 if(!Array.isArray(raw.controls)||!raw.controls.length||raw.controls.length>6)throw Error('Invalid controls');
 const ids=new Set();const controls=raw.controls.map(c=>{if(!c||!Object.hasOwn(variables,c.id)||ids.has(c.id)||typeof c.label!=='string'||c.label.length>80||![c.min,c.max,c.step].every(Number.isFinite)||c.min>=c.max||c.step<=0||(c.max-c.min)/c.step>10000||variables[c.id]<c.min||variables[c.id]>c.max)throw Error('Invalid control');ids.add(c.id);return {id:c.id,label:c.label,min:c.min,max:c.max,step:c.step};});
 if(!Array.isArray(raw.elements)||raw.elements.length>70||!raw.elements.length)throw Error('Invalid elements');
 const elements=raw.elements.map(el=>{if(!el||!Object.hasOwn(props,el.type))throw Error('Unsupported element');const out={type:el.type};for(const key of props[el.type])if(Object.hasOwn(el,key))out[key]=el[key];return out;});
 const samples=[variables,...controls.flatMap(c=>[{...variables,[c.id]:c.min},{...variables,[c.id]:c.max}])];
 for(const state of samples)for(const el of elements){for(const [key,value]of Object.entries(el)){if(key==='type')continue;const result=evaluate(value,state);if(['fill','stroke'].includes(key)){if(typeof result!=='string'||!/^#[0-9a-f]{3,8}$/i.test(result))throw Error('Invalid color');}else if(key==='text'){if(typeof result!=='string'&&typeof result!=='number')throw Error('Invalid label');}else if(typeof result!=='number'||!Number.isFinite(result)||Math.abs(result)>100000)throw Error('Invalid coordinate');}}
 return {title:raw.title,summary:raw.summary,reason:raw.reason,try:raw.try,assumptions:raw.assumptions,variables,controls,elements};
}
