import {validateScene,evaluate} from './explain-scene.mjs?v=20261019-quality-1';
export function mountScene(stage,controls,scene,onChange=()=>{}){
 const initial={...scene.variables},variables={...initial},ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 700 405');svg.setAttribute('role','img');svg.setAttribute('aria-label',scene.title);svg.style.background='#101e36';stage.replaceChildren(svg);controls.replaceChildren();
 const shapes=scene.elements.map(el=>{const node=document.createElementNS(ns,el.type);svg.append(node);return {el,node};});
 const inputs=[];
 function render(){for(const {el,node}of shapes){for(const [key,expression]of Object.entries(el)){if(key==='type')continue;const v=evaluate(expression,variables);if(key==='text')node.textContent=String(v);else node.setAttribute(key==='x'&&el.type==='circle'?'cx':key==='y'&&el.type==='circle'?'cy':key==='x'&&el.type==='line'?'x1':key==='y'&&el.type==='line'?'y1':key==='width'&&el.type==='line'?'stroke-width':key==='size'?'font-size':key,String(v));}if(el.type==='text'&&!el.fill)node.setAttribute('fill','#e5eaff');}for(const {input,output,c}of inputs){input.value=variables[c.id];output.textContent=String(Math.round(variables[c.id]*100)/100);}onChange({...variables});}
 for(const c of scene.controls){const row=document.createElement('label');row.className='ai-control';row.textContent=c.label;const input=document.createElement('input'),output=document.createElement('output');input.type='range';input.min=c.min;input.max=c.max;input.step=c.step;input.setAttribute('aria-label',c.label);input.addEventListener('input',()=>{const previous=variables[c.id];try{variables[c.id]=Number(input.value);render();}catch{variables[c.id]=previous;render();output.title='该参数组合无法计算，已恢复上一数值';}});row.append(input,output);controls.append(row);inputs.push({input,output,c});}
 const reset=document.createElement('button');reset.textContent='↺ 重置参数';reset.onclick=()=>{Object.assign(variables,initial);render();};controls.append(reset);render();
 return {scene:()=>validateScene({...scene,variables:{...variables}})};
}
export {validateScene};
