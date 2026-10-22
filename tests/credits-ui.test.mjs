import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/image-generation.js',import.meta.url),'utf8');
test('credit estimate uses selected model override, requested count and server wallet',()=>{
 const estimate={textContent:''},balance={textContent:''};
 const context=vm.createContext({document:{querySelector:id=>id==='#studio-credit-estimate'?estimate:balance}});
 vm.runInContext(source.slice(source.indexOf('let creditsConfig'),source.indexOf('const MAX_REFERENCE_BYTES'))+`; const imageStudioState={authStatus:'authenticated'}; creditsConfig={defaultImageCredits:20,modelPrices:{premium:35,budget:5}};studioWallet={balance:600,frozen:40}; globalThis.update=updateCreditsEstimate;`,context);
 context.update({count:{value:'3'},model:{value:'premium'}});assert.equal(estimate.textContent,'本次 3 张，预计消耗 105 积分');assert.match(balance.textContent,/560.*40/);
 context.update({count:{value:'2'},model:{value:'ordinary'}});assert.equal(estimate.textContent,'本次 2 张，预计消耗 40 积分');
 context.update({count:{value:'2'},model:{value:'budget'}});assert.equal(estimate.textContent,'本次 2 张，预计消耗 10 积分');
});
test('account and admin credit renderers never parse untrusted data as HTML or persist raw codes',()=>{
 for(const name of ['credits-account.js','credits-admin.js']){const text=readFileSync(new URL('../public/'+name,import.meta.url),'utf8');assert.doesNotMatch(text,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage/);assert.match(text,/textContent/);}
});
test('code metadata state handles redemption, numeric disabled flag and expiry',()=>{
 const source=readFileSync(new URL('../public/credits-admin.js',import.meta.url),'utf8');const start=source.indexOf(' function codeState('),end=source.indexOf(' function addPackage(',start);const context=vm.createContext({Date});vm.runInContext(source.slice(start,end)+'globalThis.state=codeState;',context);
 assert.equal(context.state({disabled:1}), '已停用');assert.equal(context.state({disabled:0,redeemed_by:'user'}),'已兑换');assert.equal(context.state({disabled:0,expires_at:'2000-01-01'}),'已过期');assert.equal(context.state({disabled:0,expires_at:'2999-01-01'}),'可兑换');
});
test('account renderer displays available balance and Chinese ledger descriptions safely',()=>{
 function el(){return {classList:{add(){}},children:[],textContent:'',append(...items){this.children.push(...items)},replaceChildren(){this.children=[]}};}
 const balance=el(),ledger=el(),frozen=el();const context=vm.createContext({balance,ledger,root:{querySelector:()=>frozen},document:{createElement:()=>el()},Date,Math});const source=readFileSync(new URL('../public/credits-account.js',import.meta.url),'utf8');const node=source.slice(source.indexOf(' function node('),source.indexOf(' async function api('));const label=source.slice(source.indexOf(' function ledgerLabel('),source.indexOf(' function setBusy('));const render=source.slice(source.indexOf(' function render('),source.indexOf(' async function load('));vm.runInContext(node+label+render+'globalThis.renderAccount=render;',context);
 context.renderAccount({balance:600,frozen:40,ledger:[{kind:'verification_gift',amount:60},{kind:'redeem',amount:600},{kind:'image_generation',amount:-20},{kind:'image_generation',amount:0},{description:'<img src=x onerror=alert(1)>',amount:2}]});assert.equal(balance.textContent,'560');assert.deepEqual(ledger.children.map(row=>row.children[0].textContent),['邮箱验证赠送','兑换码充值','生图消费','生图未扣费','<img src=x onerror=alert(1)>']);
});
test('unconfigured model prices remain inherited when the default price changes',()=>{
 const adminSource=readFileSync(new URL('../public/credits-admin.js',import.meta.url),'utf8');
 const context=vm.createContext({document:{createElement(tag){return {tag,children:[],value:'',append(input){this.children.push(input)},querySelector(){return this.children[0]}}}},config:{defaultImageCredits:20,modelPrices:{premium:35}}});
 const node=adminSource.slice(adminSource.indexOf(' function node('),adminSource.indexOf(' async function api('));
 const helpers=adminSource.slice(adminSource.indexOf(' function field('),adminSource.indexOf(' async function run('));
 vm.runInContext(node+helpers+'globalThis.renderField=modelPriceField;globalThis.collect=collectModelPrices;',context);
 const ordinary=context.renderField({id:'ordinary',displayName:'普通模型'}).querySelector('input'),premium=context.renderField({id:'premium',displayName:'高级模型'}).querySelector('input');
 assert.equal(ordinary.value,'');assert.equal(ordinary.required,false);assert.equal(ordinary.placeholder,'跟随默认价（20 积分/张）');assert.equal(premium.value,35);
 context.config.defaultImageCredits=30;const updated=context.renderField({id:'ordinary'}).querySelector('input');assert.equal(updated.value,'');assert.equal(updated.placeholder,'跟随默认价（30 积分/张）');
 const prices=context.collect([ordinary,premium]);assert.deepEqual(JSON.parse(JSON.stringify(prices)),{premium:35});assert.equal(prices.ordinary??context.config.defaultImageCredits,30);
 premium.value='';assert.deepEqual(JSON.parse(JSON.stringify(context.collect([ordinary,premium]))),{});
});
test('package editor preserves Chinese names before browser number-input sanitization',()=>{
 function element(tag){const el={children:[],dataset:{},append(...children){this.children.push(...children)},querySelector(){return this.children[0]},addEventListener(){}};let value='',type='text';Object.defineProperty(el,'type',{get:()=>type,set(next){type=next;if(type==='number'&&value!==''&&!Number.isFinite(Number(value)))value='';}});Object.defineProperty(el,'value',{get:()=>value,set(next){value=String(next);if(type==='number'&&value!==''&&!Number.isFinite(Number(value)))value='';}});return el;}
 const packages=element('div'),context=vm.createContext({document:{createElement:element},form:{querySelector:()=>packages}});const admin=readFileSync(new URL('../public/credits-admin.js',import.meta.url),'utf8');const node=admin.slice(admin.indexOf(' function node('),admin.indexOf(' async function api(')),field=admin.slice(admin.indexOf(' function field('),admin.indexOf(' function modelPriceField(')),add=admin.slice(admin.indexOf(' function addPackage('),admin.indexOf(" root.querySelector('[data-add-package]')"));vm.runInContext(node+field+add+'globalThis.add=addPackage;',context);
 context.add({id:'starter',name:'入门套餐',priceCents:600,credits:600});const row=packages.children[0],name=row.children[0].querySelector('input');assert.equal(name.type,'text');assert.equal(name.value,'入门套餐');assert.equal(name.required,true);assert.equal(row.dataset.packageRow,'starter');assert.equal(row.children[1].querySelector('input').value,'6');assert.equal(row.children[2].querySelector('input').value,'600');
});
