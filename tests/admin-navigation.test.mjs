import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8');
const setup = source.slice(source.indexOf('  function setupNavigationObserver()'), source.indexOf('  function setupChartResizeObserver()'));
function fixture() {
  const listeners = {}; const events = {}; const moves = [];
  const sections = [{ id:'feedback', top:120 }, { id:'reviews', top:550 }].map(s=>({...s,getBoundingClientRect(){return {top:this.top,bottom:this.top+300}},getClientRects(){return [1]}}));
  const links=sections.map(s=>({href:'#'+s.id,active:false,getAttribute(){return this.href},classList:{toggle(){}},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},addEventListener(k,fn){events[this.href+':'+k]=fn}}));
  links.forEach(l=>l.classList.toggle=(k,v)=>l.active=v);
  const window={innerHeight:900,scrollY:1100,scrollTo(options){moves.push(options);this.scrollY=Math.min(options.top,1100)},history:{pushState(a,b,h){context.location.hash=h}},addEventListener(k,fn){listeners[k]=fn},requestAnimationFrame(fn){fn();return 1},IntersectionObserver:class{constructor(fn){this.fn=fn}observe(){}}};
  const document={documentElement:{scrollHeight:2000},querySelectorAll(){return links},querySelector(h){return sections.find(s=>'#'+s.id===h)}};
  const context={window,document,history:window.history,location:{hash:''},IntersectionObserver:window.IntersectionObserver};
  vm.runInNewContext(setup+';setupNavigationObserver();',context);
  return {links,events,listeners,sections,window,context,moves};
}
test('last review section is selected when scrolling reaches the page bottom',()=>{const f=fixture(); assert.equal(f.links[1].active,true);assert.equal(f.links[1]['aria-current'],'page')});
test('clicking a sidebar destination updates its selection immediately',()=>{const f=fixture(); assert.equal(typeof f.events['#feedback:click'],'function'); f.events['#feedback:click']({preventDefault(){}});assert.equal(f.links[0].active,true);assert.equal(f.links[1].active,false)});
test('scrolling back to feedback updates selection even without IntersectionObserver',()=>{const f=fixture();f.window.scrollY=400;f.sections[0].top=-20;assert.equal(typeof f.listeners.scroll,'function');f.listeners.scroll();assert.equal(f.links[0].active,true)});

test('navigation prevents native smooth scrolling and keeps feedback selected at clamped bottom',()=>{const f=fixture();let prevented=false;f.events['#feedback:click']({preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(f.moves.at(-1).behavior,'instant');f.listeners.scroll();assert.equal(f.links[0].active,true);assert.equal(f.context.location.hash,'#feedback')});
test('rapid feedback and review clicks select only the latest destination',()=>{const f=fixture();for(const id of ['feedback','reviews','feedback'])f.events['#'+id+':click']({preventDefault(){}});f.listeners.scroll();assert.equal(f.links[0].active,true);assert.equal(f.links[1].active,false);assert.equal(f.context.location.hash,'#feedback')});
test('scroll selection follows physical section order rather than sidebar array order',()=>{const f=fixture();f.window.scrollY=400;f.sections[0].top=-10;f.sections[1].top=-100;f.listeners.scroll();assert.equal(f.links[0].active,true)});
test('hidden permission sections do not participate in scroll selection',()=>{const f=fixture();f.window.scrollY=400;f.sections[0].top=-10;f.sections[1].getClientRects=()=>[];f.listeners.scroll();assert.equal(f.links[0].active,true)});
