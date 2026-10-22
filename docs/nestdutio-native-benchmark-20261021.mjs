// Copy to the root of an isolated source snapshot on the authorized host.
// This uses at most CNY 1, within the original CNY 5 task budget (prior upper bound 0.429438).
import {writeFileSync} from 'node:fs';
import {openMariaDatabase} from '/opt/nikai-ai/backend/mariadb-compat.mjs';
import {createSecretBox} from '/opt/nikai-ai/backend/image-provider-secrets.mjs';
import {createGenerator} from './backend/nestdutio/generator.mjs';
import {validateNativeArtifact} from './backend/nestdutio/native-artifact.mjs';
import {validateGeneratedFile} from './backend/nestdutio/generation-manifest.mjs';
import {inspectUsage} from './backend/nestdutio/request-accounting.mjs';
import {safeFetch} from './backend/safe-upstream.mjs';
const db=openMariaDatabase();let config;try{config=JSON.parse(db.prepare('SELECT document FROM nestdutio_config WHERE id=1').get().document);}finally{db.close();}
if(config.mode!=='independent'||new URL(config.endpoint).hostname!=='api.deepseek.com'||config.model!=='deepseek-flash')throw Error('Expected verified provider configuration');
const key=createSecretBox(process.env.NIKE_IMAGE_CONFIG_KEY).decrypt(config.encryptedKey);
const balanceResponse=await safeFetch('https://api.deepseek.com/user/balance',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});
if(!balanceResponse.ok)throw Error('Cannot verify currency');const balance=await balanceResponse.json();if(!balance.is_available||!balance.balance_infos?.length||balance.balance_infos.some(x=>x.currency!=='CNY'))throw Error('Expected CNY account');
let upperCny=0,calls=0;const events=[],checks=[],responses=[];
const fetchImpl=async(url,init)=>{
 if(new URL(url).hostname!=='api.deepseek.com')throw Error('Unexpected provider');const payload=JSON.parse(init.body);
 const reserve=((Buffer.byteLength(JSON.stringify(payload.messages))+4096)*2+payload.max_tokens*8)/1e6;
 if(upperCny+reserve>1)throw Error('Native benchmark one yuan ceiling');upperCny+=reserve;calls++;
 const response=await safeFetch(url,init);let usage;try{const body=await response.clone().json();usage=inspectUsage(body);const content=body.choices?.[0]?.message?.content;if(typeof content==='string'&&!content.includes(key)&&Buffer.byteLength(content)<=262144)responses.push({request:calls,content});}catch{}
 if(usage?.status==='reported'){const amount=(usage.promptTokens*2+usage.completionTokens*8)/1e6;if(amount>reserve)throw Error('Usage exceeded reservation');upperCny+=amount-reserve;}
 return response;
};
const checker={async check(artifact){try{validateNativeArtifact(artifact);for(const file of artifact.files)validateGeneratedFile(file,'wechat');checks.push({structure:'passed',compile:'pending',business:'pending'});return {ok:true};}catch(error){checks.push({structure:'failed',reason:error.code});return {ok:false,issues:[{code:'native_structure_failed',path:'native',detail:error.message.slice(0,300)}]};}}};
const generator=createGenerator({config:()=>({...config,ready:true}),key:()=>key},checker,{fetchImpl});
let result;
try{const artifact=await generator.run({target:'wechat',prompt:'生成微信原生等额本息房贷计算器。金额单位元，年利率百分数，期限月数；计算月供、总利息、还款总额；零利率正确、非法输入提示，支持重置。使用Page、setData、WXML、WXSS，页面布局适合手机，无外部图片和网络服务。工程必须完整可导入。'},{onRequest:event=>events.push(event),onProgress:event=>{if(['file_started','file_saved','repair_started','check_issue'].includes(event.code))console.log(JSON.stringify(event));}});
 writeFileSync(new URL('native.artifact.json',import.meta.url),JSON.stringify(artifact,null,2));result={ok:true,files:artifact.files.length,bytes:artifact.files.reduce((n,f)=>n+Buffer.byteLength(f.content),0),verification:artifact.verification};
}catch(error){result={ok:false,errorCode:error.code??'benchmark_failed',errorMessage:error.message};}
const report={...result,budgetCny:1,conservativeUpperCny:upperCny,calls,events,checks,notice:'No WeChat AppID was available; no claim of WeChat compile or phone validation.'};
writeFileSync(new URL('native-report.json',import.meta.url),JSON.stringify(report,null,2));writeFileSync(new URL('native-responses.json',import.meta.url),JSON.stringify(responses,null,2));console.log(JSON.stringify({...result,calls,conservativeUpperCny:upperCny}));
