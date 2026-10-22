import * as k from './vendor/anatomy/iso-kit.mjs?v=20261019-quality-1';
import {evaluate,validateScene} from './explain-scene.mjs?v=20261019-quality-1';
import {anatomyStepValues} from './anatomy-scene.mjs?v=20261019-quality-1';

// Only fixed platform geometry builders write SVG. No scene string enters markup.
function geometry(part,values,apart){
 const pos=part.position.map((v,i)=>evaluate(v,values)+part.explode[i]*apart);
 const angle=evaluate(part.rotation,values)*Math.PI/180;
 if([...pos,angle].some(x=>!Number.isFinite(x)||Math.abs(x)>15000))throw Error('参数超出绘图范围');
 const scale=evaluate(part.scale??1,values);if(!Number.isFinite(scale)||scale<.1||scale>3)throw Error('invalid_scale');
 const [w,d,h]=part.size.map(v=>v*scale);return {...part,pos,angle,w,d,h};
}
function picture(p,P){
 const [x,y,z]=p.pos,{w,d,h}=p;
 const rotate=ring=>ring.map(([a,b])=>[x+a*Math.cos(p.angle)-b*Math.sin(p.angle),y+a*Math.sin(p.angle)+b*Math.cos(p.angle)]);
 const style={tone:p.tone,lit:p.tone==='lit'};
 if(p.type==='profile'){
  const point=(u,v,front)=>{const a=u*w,b=front*d/2;return k.iso([x+a*Math.cos(p.angle)-b*Math.sin(p.angle),y+a*Math.sin(p.angle)+b*Math.cos(p.angle),z+(v+.5)*h],P);};
  const front=p.outline.map(([u,v])=>point(u,v,1)),back=p.outline.map(([u,v])=>point(u,v,-1));
  const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],at=(points,i)=>points[(i+points.length)%points.length];
  const contour=points=>`M${midpoint(at(points,-1),points[0]).join(' ')} `+points.map((a,i)=>`Q${a.join(' ')} ${midpoint(a,at(points,i+1)).join(' ')}`).join(' ')+'Z';
  const sides=front.map((a,i)=>{const f0=midpoint(at(front,i-1),a),f1=midpoint(a,at(front,i+1)),b0=midpoint(at(back,i-1),back[i]),b1=midpoint(back[i],at(back,i+1));return `<path class="iso-shade" d="M${f0.join(' ')} Q${a.join(' ')} ${f1.join(' ')} L${b1.join(' ')} Q${back[i].join(' ')} ${b0.join(' ')}Z"/>`;}).join('');
  return `<g class="iso-solid"><path class="iso-fill" d="${contour(back)}"/>${sides}<path class="iso-top" d="${contour(front)}"/><path class="iso-line iso-edge" d="${contour(front)}"/></g>`;
 }
 if(p.type==='box'){
  const ring=rotate(k.roundedPlan({x:-w/2,y:-d/2,w,d,r:Math.min(w,d)*.06},3));
  const bolts=[[-.35,-.35],[.35,-.35],[-.35,.35],[.35,.35]].map(([a,b])=>rotate([[a*w,b*d]])[0]).map(([a,b])=>k.iso([a,b,z+h],P));
  return k.solidSvg(k.extrude(ring,z,h,P),{...style,inner:k.dotsSvg(bolts,{size:1,tone:'mid'})});
 }
 if(p.type==='sphere'){
  const center=k.iso([x,y,z+h/2],P),cam=k.cameraOf(P);
  const rx=Math.hypot(w*cam.sinA,d*cam.cosA)*cam.k/2;
  const ry=Math.hypot(w*cam.cosA*cam.sinE,d*cam.sinA*cam.sinE,h*cam.cosE)*cam.k/2;
  const mark=k.iso([x+Math.cos(p.angle)*w*.35,y+Math.sin(p.angle)*d*.35,z+h*.8],P);
  return `<ellipse class="anatomy-sphere" fill="url(#anatomy-sphere-${p.palette??'slate'})" cx="${center[0]}" cy="${center[1]}" rx="${rx}" ry="${ry}"/><circle class="anatomy-sphere-mark" cx="${mark[0]}" cy="${mark[1]}" r="3"/>`;
 }
 if(p.type==='spring'){
  const local={...P,origin:k.iso([x,y,z],P),azimuth:(P.azimuth??45)-p.angle*180/Math.PI};
  const coil=k.coil(-w/2,w/2,[0,h/2],Math.min(d,h)*.38,6,'x',local,24);
  const thickness=Math.max(1.5,Math.min(d,h)*.1*P.scale);
  return `<g class="anatomy-coil" stroke-width="${thickness}"><path class="anatomy-coil-back" d="${coil.back}"/><path class="anatomy-coil-front" d="${coil.front}"/></g>`;
 }
 if(p.type==='pipe'){
  const radius=Math.min(w,d)/2;
  return k.solidSvg(k.cylinder(x,y,radius,z,h,P,32),style)+k.solidSvg(k.cylinder(x,y,radius*1.15,z,Math.min(h*.15,radius*.25),P,32),style)+k.solidSvg(k.cylinder(x,y,radius*1.15,z+h-Math.min(h*.15,radius*.25),Math.min(h*.15,radius*.25),P,32),style)+k.lineSvg(k.onTop(k.circleRing(x,y,radius*.65),z+h,P,true),{tone:'mid'});
 }
 if(p.type==='gear'){
  const ring=rotate(Array.from({length:64},(_,i)=>{const a=i*Math.PI/32,r=i%4<2?.5:.42;return [Math.cos(a)*w*r,Math.sin(a)*d*r];}));
  return k.solidSvg(k.extrude(ring,z,h,P,{convex:false}),style)+k.solidSvg(k.cylinder(x,y,Math.min(w,d)*.16,z+h,h*.2,P,24),style)+k.lineSvg(k.onTop(k.circleRing(x,y,Math.min(w,d)*.07),z+h*1.2,P,true),{tone:'mid'})+k.lineSvg(k.onTop(rotate([[w*.18,0],[w*.36,0]]),z+h+.1,P),{tone:'mid',className:'anatomy-direction'});
 }
 const ring=rotate(Array.from({length:40},(_,i)=>[Math.cos(i*Math.PI/20)*w/2,Math.sin(i*Math.PI/20)*d/2]));
 return k.solidSvg(k.extrude(ring,z,h,P),style)+k.lineSvg(k.onTop(rotate([[0,0],[w*.38,0]]),z+h,P),{tone:'mid'});
}
const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function orderParts(parts,P){
 // A supporting plate must be behind the parts above it, even when its center
 // is closer to the camera. Center depth alone hides rear gears under a base.
 const bounds=p=>{const c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle));return {x:(p.w*c+p.d*s)/2,y:(p.w*s+p.d*c)/2};};
 const below=(a,b)=>{const A=bounds(a),B=bounds(b);return a.pos[2]+a.h<=b.pos[2]&&Math.abs(a.pos[0]-b.pos[0])<A.x+B.x&&Math.abs(a.pos[1]-b.pos[1])<A.y+B.y;};
 const remaining=[...parts],ordered=[];
 while(remaining.length){
  const eligible=remaining.filter(b=>!remaining.some(a=>a!==b&&below(a,b)));
  eligible.sort((a,b)=>k.depthOf(a.pos,P)-k.depthOf(b.pos,P));
  const next=eligible[0];ordered.push(next);remaining.splice(remaining.indexOf(next),1);
 }
 return ordered;
}
function cornersOf(parts){return parts.flatMap(p=>{
 const c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle)),rx=(p.w*c+p.d*s)*.6,ry=(p.w*s+p.d*c)*.6;
 return k.boxCorners({x:p.pos[0]-rx,y:p.pos[1]-ry,w:rx*2,d:ry*2},p.pos[2],p.pos[2]+p.h*1.2);
});}
function camera(scene,apart){
 const states=[scene.variables,...scene.steps.map((_,i)=>anatomyStepValues(scene,i))];
 if(scene.view)states.push(scene.view.variables);
 for(const c of scene.controls)for(let i=0;i<=20;i++)states.push({...scene.variables,[c.id]:c.min+(c.max-c.min)*i/20});
 for(let i=0;i<=20;i++)states.push({...scene.variables,...Object.fromEntries(scene.controls.map(c=>[c.id,c.min+(c.max-c.min)*i/20]))});
 for(let mask=0;mask<2**scene.controls.length;mask++)states.push({...scene.variables,...Object.fromEntries(scene.controls.map((c,i)=>[c.id,mask&(1<<i)?c.max:c.min]))});
 // Reduce projected bounds incrementally: a maximal scene exceeds spread-argument
 // limits if passed directly to fitProjection's Math.min(...points).
 const unit={origin:[0,0],scale:1};let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 for(const v of states)for(const point of cornersOf(scene.parts.map(p=>geometry(p,v,apart)))){
  const [x,y]=k.iso(point,unit);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 const projection={bounds:{left,right,top,bottom}};fitBounds(projection);return projection;
}
function fitBounds(projection){const {left,right,top,bottom}=projection.bounds;const scale=Math.min(650/(right-left),350/(bottom-top));projection.scale=scale;projection.origin=[400-(left+right)/2*scale,250-(top+bottom)/2*scale];}
function includeCurrentBounds(projection,parts){
 if(!projection.bounds)return;
 const b=projection.bounds;let changed=false;
 for(const point of cornersOf(parts)){const [x,y]=k.iso(point,{origin:[0,0],scale:1});if(x<b.left||x>b.right||y<b.top||y>b.bottom){b.left=Math.min(b.left,x);b.right=Math.max(b.right,x);b.top=Math.min(b.top,y);b.bottom=Math.max(b.bottom,y);changed=true;}}
 // Sampling cannot bound every possible expression. Expand only when a new
 // extremum actually appears, never shrink/follow the object during playback.
 if(changed)fitBounds(projection);
}
export function createAnatomyProjection(scene,apart=0){return camera(scene,apart);}
export function renderAnatomyFrame(scene,values,{apart=0,zoom=1,step=0,selected='',projection}={}){
 const parts=scene.parts.map(p=>geometry(p,values,apart)),base=projection??camera(scene,apart);
 includeCurrentBounds(base,parts);
 const P={...base,scale:base.scale*zoom,origin:base.origin.map((v,i)=>(i?250:400)+(v-(i?250:400))*zoom)};
 if(!Number.isFinite(P.scale)||P.scale<=0)throw Error('invalid_projection');
 const ordered=orderParts(parts,P);
 const focused=scene.steps[step].parts;
 const paletteColors={slate:['#e6edf7','#8294b1','#536580'],blue:['#c0e8ff','#68b5e0','#326eaa'],coral:['#ffd9d7','#ed918d','#b45963'],teal:['#cdf2e8','#77c7b4','#358978'],amber:['#fff0bd','#e4bd68','#a97b30'],violet:['#e9dcff','#b598e1','#785ca9']};
 const gradients=Object.entries(paletteColors).map(([id,c])=>`<radialGradient id="anatomy-sphere-${id}" cx="30%" cy="25%"><stop stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>`).join('');
 const body=ordered.map(p=>k.groupSvg(picture(p,P),{'data-part':p.id,'data-palette':p.palette??'slate',tabindex:0,role:'button','aria-label':p.name,'aria-pressed':selected===p.id?'true':'false',class:focused.includes(p.id)?'anatomy-active':''})).join('');
 const labels=parts.filter(p=>selected?p.id===selected:focused.includes(p.id)).slice(0,4).map((p,i)=>{
  const at=k.iso([p.pos[0],p.pos[1],p.pos[2]+p.h],P),left=at[0]<400;
  const x=left?22:778,y=45+i*36,edge=left?155:645;
  return `<g class="anatomy-callout"><path d="M${at[0]} ${at[1]}L${edge} ${y}H${x}"/><circle cx="${at[0]}" cy="${at[1]}" r="3"/><text x="${x}" y="${y-8}" text-anchor="${left?'start':'end'}">${escapeText(p.name.slice(0,16))}</text></g>`;
 }).join('');
 return k.figureSvg({width:800,height:500,label:scene.title,body:`<defs>${gradients}</defs>${body}${labels}`});
}
export function mountAnatomy(stage,controls,input,onChange=()=>{}){
 const scene=validateScene(input),values={...(scene.view?.variables??anatomyStepValues(scene,0))};
 let selected='',step=scene.view?.step??0,apart=scene.view?.apart??0,zoom=scene.view?.zoom??1,playing=false,raf=0,dead=false,speech=false,visible=true,transition=null,lastFrame=0;
 const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const clean=[],listen=(node,event,fn)=>{node.addEventListener(event,fn);clean.push(()=>node.removeEventListener(event,fn));};
 stage.replaceChildren();controls.replaceChildren();stage.classList.add('anatomy-stage');controls.classList.add('anatomy-controls');
 const status=document.createElement('div');status.className='anatomy-status';stage.append(status);
 const host=document.createElement('div');host.className='anatomy-figure';stage.append(host);
 const caption=document.createElement('p');caption.className='anatomy-caption';caption.setAttribute('aria-live','polite');stage.append(caption);
 const toolbar=document.createElement('div');toolbar.className='anatomy-toolbar';controls.append(toolbar);
 const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;listen(b,'click',fn);toolbar.append(b);return b;};
 const cancelSpeech=()=>{if(speech&&'speechSynthesis'in window)window.speechSynthesis.cancel();};
 const pause=()=>{playing=false;cancelAnimationFrame(raf);raf=0;play.textContent='播放步骤';play.setAttribute('aria-pressed','false');cancelSpeech();};
 const narrate=()=>{cancelSpeech();if(speech&&visible){const u=new SpeechSynthesisUtterance(scene.steps[step].text);u.lang='zh-CN';window.speechSynthesis.speak(u);}};
 const sliders=new Map();let projection=camera(scene,apart);
 function draw(){
  if(dead)return false;
  try{
   const focused=host.contains(document.activeElement)?document.activeElement?.dataset.part:null;
   host.innerHTML=renderAnatomyFrame(scene,values,{apart,zoom,step,selected,projection});host.querySelector('svg').setAttribute('role','group');
   for(const group of host.querySelectorAll('[data-part]')){const select=()=>{selected=group.dataset.part;draw();};group.onclick=select;group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};}
   if(focused)host.querySelector(`[data-part="${focused}"]`)?.focus({preventScroll:true});
   picker.value=selected;
   const chosen=scene.parts.find(p=>p.id===selected),s=scene.steps[step];
   caption.textContent=chosen?`${chosen.name} · ${chosen.description}`:s.text;
   status.textContent=`${step+1} / ${scene.steps.length} · ${s.title}`;
   for(const [id,{range,output}]of sliders){range.value=values[id];output.textContent=String(Number(values[id].toFixed(2)));}
   previous.disabled=step===0;next.disabled=step===scene.steps.length-1;
   stepButtons.forEach((b,i)=>{b.setAttribute('aria-current',i===step?'step':'false');});
   onChange({...values},{observation:chosen?`${chosen.name}：${chosen.description}`:s.text,reason:scene.reason,try:scene.try});
   return true;
  }catch{
   pause();host.replaceChildren();status.textContent='画面绘制失败';caption.textContent=`第 ${step+1} 步的结构或参数无法绘制。点击“重置”恢复；仍失败时请修改讲解，错误位置：画面绘制。`;
   return false;
  }
 }
 function go(index){cancelSpeech();transition=null;selected='';step=Math.max(0,Math.min(scene.steps.length-1,index));Object.assign(values,anatomyStepValues(scene,step));draw();narrate();}
 function advance(now){
  if(!playing||!visible||dead)return;
  if(!transition){
   if(step===scene.steps.length-1){pause();return;}
   selected='';step++;transition={from:{...values},to:anatomyStepValues(scene,step),start:now,duration:scene.steps[step].duration*1000};narrate();
  }
  const t=Math.min(1,(now-transition.start)/transition.duration);transition.fraction=t;
  const motion=reducedMotion()?(t===1?1:0):t;
  for(const key of Object.keys(values))values[key]=transition.from[key]+(transition.to[key]-transition.from[key])*motion;
  if(now-lastFrame>=32||t===1){lastFrame=now;if(!draw())return;}
  if(t===1)transition=null;
  raf=requestAnimationFrame(advance);
 }
 const previous=button('上一步',()=>{pause();go(step-1);});
 const play=button('播放步骤',()=>{if(playing){pause();return;}if(transition){transition.start=performance.now()-(transition.fraction??0)*transition.duration;}else if(step===scene.steps.length-1)go(0);playing=true;play.textContent='暂停';play.setAttribute('aria-pressed','true');raf=requestAnimationFrame(advance);});play.setAttribute('aria-pressed','false');
 const next=button('下一步',()=>{pause();go(step+1);});
 const explode=button(apart?'合拢':'拆解',()=>{pause();apart=apart?0:1;projection=camera(scene,apart);explode.textContent=apart?'合拢':'拆解';explode.setAttribute('aria-pressed',String(Boolean(apart)));draw();});explode.setAttribute('aria-pressed',String(Boolean(apart)));
 button('放大',()=>{zoom=Math.min(2,zoom+.2);draw();});button('缩小',()=>{zoom=Math.max(.6,zoom-.2);draw();});
 button('重置',()=>{pause();transition=null;step=0;apart=0;zoom=1;selected='';projection=camera(scene,apart);Object.assign(values,anatomyStepValues(scene,0));explode.textContent='拆解';explode.setAttribute('aria-pressed','false');draw();});
 const voice=button('开启朗读',()=>{speech=!speech;voice.textContent=speech?'关闭朗读':'开启朗读';voice.setAttribute('aria-pressed',String(speech));if(speech)narrate();else window.speechSynthesis.cancel();});voice.setAttribute('aria-pressed','false');
 if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){voice.disabled=true;voice.textContent='此浏览器不支持朗读';}
 const timeline=document.createElement('nav');timeline.className='anatomy-timeline';timeline.setAttribute('aria-label','讲解步骤');controls.append(timeline);
 const stepButtons=scene.steps.map((s,i)=>{const b=document.createElement('button');b.type='button';b.textContent=`${i+1}  ${s.title}`;listen(b,'click',()=>{pause();go(i);});timeline.append(b);return b;});
 for(const c of scene.controls){const label=document.createElement('label');label.className='anatomy-slider';const name=document.createElement('span');name.textContent=c.label;const range=document.createElement('input');range.type='range';range.min=c.min;range.max=c.max;range.step=c.step;range.value=values[c.id];range.setAttribute('aria-label',c.label);const output=document.createElement('output');label.append(name,range,output);controls.append(label);sliders.set(c.id,{range,output});listen(range,'input',()=>{pause();transition=null;values[c.id]=Number(range.value);draw();});}
 const partLabel=document.createElement('label');partLabel.className='anatomy-slider';const partName=document.createElement('span');partName.textContent='探索部件';const picker=document.createElement('select');const all=document.createElement('option');all.value='';all.textContent='整体结构';picker.append(all);for(const p of scene.parts){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;picker.append(o);}partLabel.append(partName,picker);controls.append(partLabel);listen(picker,'change',()=>{selected=picker.value;draw();});
 listen(document,'visibilitychange',()=>{if(document.hidden)pause();});
 let observer;if('IntersectionObserver'in window){observer=new IntersectionObserver(entries=>{visible=entries[entries.length-1].isIntersecting;if(!visible)pause();});observer.observe(stage);}
 draw();return {scene:()=>({...scene,view:{step,variables:{...values},apart,zoom}}),destroy(){if(dead)return;pause();dead=true;observer?.disconnect();clean.forEach(fn=>fn());stage.replaceChildren();controls.replaceChildren();stage.classList.remove('anatomy-stage');controls.classList.remove('anatomy-controls');}};
}
