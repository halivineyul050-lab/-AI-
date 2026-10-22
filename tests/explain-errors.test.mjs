import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/explain.js',import.meta.url),'utf8');
async function failure(status,body){
 const nodes=new Map();const $=s=>{if(!nodes.has(s))nodes.set(s,{value:'自动',textContent:'',focus(){}});return nodes.get(s);};
 const context=vm.createContext({$,document:{getElementById:$},fetch:async()=>new Response(JSON.stringify(body),{status}),projectNavigation:0,generating:false,generated:null,toast(){}});
 await vm.runInContext(source.slice(source.indexOf('async function generate('),source.indexOf('function showGenerated('))+';generate("解释弹簧")',context);
 return $('#input-note').textContent;
}
test('generation displays actual problem details for quota and concurrency errors',async()=>{
 assert.equal(await failure(429,{code:'assistant_daily_limit',title:'今日已用10次，每日限额10次'}),'今日已用10次，每日限额10次');
 assert.equal(await failure(409,{code:'assistant_running',title:'请等待当前对话完成'}),'请等待当前对话完成');
});
test('generation explains invalid output and timeout and includes request reference',async()=>{
 assert.match(await failure(502,{code:'explainer_invalid_scene',requestId:'request-123'}),/模型.*演示.*次数已退回.*request-123/);
 assert.match(await failure(504,{code:'explainer_timeout'}),/超时.*次数已退回/);
});
