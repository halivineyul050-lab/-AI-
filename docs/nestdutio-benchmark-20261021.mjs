// Copy this script to the root of an isolated /tmp source snapshot, then run.
// Reads the existing credential in memory; never writes it or changes application data.
import {writeFileSync} from 'node:fs';
import {openMariaDatabase} from '/opt/nikai-ai/backend/mariadb-compat.mjs';
import {createSecretBox} from '/opt/nikai-ai/backend/image-provider-secrets.mjs';
import {createGenerator} from './backend/nestdutio/generator.mjs';
import {startPreviewServer} from './backend/nestdutio/preview.mjs';
import {checkArtifact} from './backend/nestdutio/checker.mjs';
import {safeFetch} from './backend/safe-upstream.mjs';
import {inspectUsage} from './backend/nestdutio/request-accounting.mjs';

const db=openMariaDatabase();let saved;
try {saved=JSON.parse(db.prepare('SELECT document FROM nestdutio_config WHERE id=1').get().document);}
finally {db.close();}
if(saved.mode!=='independent'||new URL(saved.endpoint).hostname!=='api.deepseek.com'||saved.model!=='deepseek-flash')throw Error('Benchmark provider changed');
const key=createSecretBox(process.env.NIKE_IMAGE_CONFIG_KEY).decrypt(saved.encryptedKey);
const balanceResponse=await safeFetch('https://api.deepseek.com/user/balance',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});
if(!balanceResponse.ok)throw Error('Cannot verify account billing currency');
const balance=await balanceResponse.json();
if(!balance.is_available||!balance.balance_infos?.length||balance.balance_infos.some(x=>x.currency!=='CNY'))throw Error('Benchmark requires verified CNY account');
const recheck=process.argv[2]==='mortgage';
const ceiling=recheck?1:5;
console.log(JSON.stringify({event:'currency_verified',currency:'CNY',budget:ceiling,priceSource:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',bound:'peak prices, all input uncached: CNY 2/8 per million'}));
let spentUpper=0,requests=0;
async function budgetFetch(url,init){
  if(new URL(url).hostname!=='api.deepseek.com')throw Error('Unexpected benchmark provider');
  const payload=JSON.parse(init.body);
  // UTF-8 bytes plus generous protocol overhead bound input tokens. No retries
  // escape this guard, including response_format fallback requests.
  const inputBound=Buffer.byteLength(JSON.stringify(payload.messages))+4096;
  const bound=(inputBound*2+payload.max_tokens*8)/1e6;
  if(spentUpper+bound>ceiling)throw Error('Benchmark ceiling reached');
  spentUpper+=bound;requests++;
  const response=await safeFetch(url,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(180000)])});
  let usage;try {usage=inspectUsage(await response.clone().json());}catch{/* Unknown usage retains its reservation. */}
  if(usage?.status==='reported'){
    const upper=(usage.promptTokens*2+usage.completionTokens*8)/1e6;
    if(upper>bound)throw Error('Provider usage exceeded reservation');
    spentUpper+=upper-bound;
  }
  return response;
}
const preview=await startPreviewServer();
const results=[];
const cases=[
 ['mortgage','制作可实际使用的房贷计算器：等额本息，本金单位元、年利率百分数、期限月数，输出月供、总利息、还款总额；支持零利率，非法输入显示错误。手机可用，界面清晰。'],
 ['habits','制作可实际使用的习惯打卡工具：添加多个习惯、每条独立打卡和删除、刷新后保持，空名称报错，本地保存并说明不会云同步。手机可用。'],
 ['signup','制作活动报名网页：收集姓名和邮箱必填、可选备注；真实提交到作者后台，成功显示回执，失败可重试，提交期间防止重复点击。手机可用。']
];
try{
 for(const [name,prompt]of cases.filter(([name])=>!recheck||name==='mortgage')){
  const started=Date.now(),events=[],reports=[];
  const checker={async check(artifact,options){writeFileSync(new URL(name+'.attempt-'+(reports.length+1)+'.artifact.json',import.meta.url),JSON.stringify(artifact,null,2));const report=await checkArtifact(artifact,{...options,preview});reports.push({...report,acceptance:artifact.acceptance});return report;}};
  const generator=createGenerator({config:()=>({...saved,ready:true}),key:()=>key},checker,{fetchImpl:budgetFetch});
  console.log(JSON.stringify({event:'case_started',name}));
  let result;
  try{const artifact=await generator.run({prompt},{onRequest:e=>events.push(e),onProgress:e=>{if(['file_started','file_saved','repair_started','check_issue','checks_passed'].includes(e.code))console.log(JSON.stringify({event:'progress',name,...e}));}});
   writeFileSync(new URL(name+'.artifact.json',import.meta.url),JSON.stringify(artifact,null,2));
   result={name,ok:true,files:artifact.files.length,bytes:artifact.files.reduce((n,f)=>n+Buffer.byteLength(f.content),0)};
  }catch(error){result={name,ok:false,errorCode:error.code??'benchmark_failed'};}
  results.push({...result,durationMs:Date.now()-started,events,reports});
  console.log(JSON.stringify({event:'case_finished',...result,requests,spentUpperCny:spentUpper}));
  writeFileSync(new URL(recheck?'report-mortgage-recheck.json':'report.json',import.meta.url),JSON.stringify({budgetCny:ceiling,spentUpperCny:spentUpper,requests,results},null,2));
 }
}finally{await preview.close();}
