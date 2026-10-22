import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
function fixture(){
 const nodes=[];const tooltip={hidden:true,style:{},offsetWidth:160,offsetHeight:90};
 const chart={clientWidth:960,clientHeight:310,replaceChildren(){},append(){},setAttribute(){}};
 const context={dom:{chart,chartWrap:{getBoundingClientRect(){return {left:0,top:0,width:960,height:310}}},chartTooltip:tooltip,chartEmpty:{}},formatNumber:String,svgNode(tag,attributes={},text=''){const node={tag,attributes,text,events:{},append(){},addEventListener(name,fn){this.events[name]=fn}};nodes.push(node);return node;}};
 const start=source.indexOf('  function linePath(');const end=source.indexOf('  function renderFunnel(',start);
 vm.runInNewContext(source.slice(start,end)+';this.render=renderTrend;',context);
 return {context,nodes,tooltip};
}
test('all horizontal chart positions map to a time bucket without gaps',()=>{const f=fixture();f.context.render({hourlySeries:[{label:'10/12 10:00',pageViews:12,uniqueVisitors:8},{label:'10/12 11:00',pageViews:24,uniqueVisitors:10},{label:'10/12 12:00',pageViews:18,uniqueVisitors:9}]});const hits=f.nodes.filter(n=>n.tag==='rect');assert.equal(hits[0].attributes.x,48);for(let i=1;i<hits.length;i++)assert.ok(Math.abs(hits[i-1].attributes.x+hits[i-1].attributes.width-hits[i].attributes.x)<1e-6);assert.equal(hits.at(-1).attributes.x+hits.at(-1).attributes.width,938);hits[1].events.pointermove({clientX:490,clientY:80});assert.equal(f.tooltip.hidden,false);assert.match(f.tooltip.textContent,/10\/12 11:00\nPV  24\nUV  10/)});
test('empty chart clears an earlier tooltip',()=>{const f=fixture();f.tooltip.hidden=false;f.context.render({hourlySeries:[]});assert.equal(f.tooltip.hidden,true)});
