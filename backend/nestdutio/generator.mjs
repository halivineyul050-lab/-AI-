import {qualityProfile,validateQualityPlan} from './business-quality.mjs';
import {validateNativePlan,nativeInstructions,nativePlanningContract} from './native-artifact.mjs';
import {generationFingerprint,validateManifest,validateCheckpoint,validateGeneratedFile} from './generation-manifest.mjs';
import {normalizeUsage} from './metering.mjs';
import {inspectUsage} from './request-accounting.mjs';
import {validateForms} from './form-schema.mjs';
import {HttpError} from '../validation.mjs';import {safeFetch} from '../safe-upstream.mjs';import {validateArtifact} from './artifact.mjs';
const fail=(code,message,status=502)=>{throw new HttpError(status,code,message);};
async function bounded(response){if(!response.body)fail('nestdutio_provider_failed','服务商没有返回内容');const r=response.body.getReader(),chunks=[];let n=0;try{while(true){const {value,done}=await r.read();if(done)break;n+=value.length;if(n>3000000){await r.cancel();fail('nestdutio_provider_failed','模型返回内容过大');}chunks.push(Buffer.from(value));}return Buffer.concat(chunks).toString('utf8');}finally{r.releaseLock();}}
function parse(content){try{return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{fail('nestdutio_json_invalid','模型输出不是完整JSON');}}

function parseFile(text,path){const raw=text.trim();if(raw.startsWith('<<<FILE>>>')){const match=/^<<<FILE>>>([^\r\n]*)\r?\n([\s\S]*)\r?\n<<<END_FILE>>>$/.exec(raw);if(!match||(match[1].trim()&&match[1].trim()!==path))fail('nestdutio_artifact_invalid','文件输出缺少完整结束标记');return {path,content:match[2]};}return parse(text);}
const contract=`你是网页需求设计师。规划必须额外包含manifest:{entry:"index.html",files:[{path:"index.html",purpose:"页面结构",dependencies:[]}]}，最多12文件；将样式和逻辑合理分离，每文件完整且独立生成。修改已有作品时，必须参考previousEntry和previousFiles，清单包含现有资源；首版没有删除协议，默认保留全部旧资源和功能，不得通过漏列文件删除旧功能。仅输出合法JSON对象，键和字符串必须用双引号，不要Markdown或注释。结构：{"name":"作品名称","capabilities":[],"forms":[],"acceptance":[]}。
支持能力：无后端的网页用[]；当前浏览器保存用["localStorage"]；访客提交报名/反馈/咨询，作者在平台查看和导出记录，必须用["forms"]，这已由平台提供，绝对不要为这种需求声明database。只有个人账号云同步、任意数据库查询、支付、业务登录才标database/payment/auth等不支持的能力，不能隐藏这些缺项。
仅用户明确要求向作者收集报名、预约、反馈等记录才使用forms；计算器、个人待办、浏览器本地保存不应添加云表单。计算类验收必须使用可直接核对的简单数值，避免凭心算编写复杂小数预期值。例如房贷用本金120000、年利率0、期数12，月供10000、总利息0；百分比用100的10%等于10。验收预期只包含确定的核心结果数字，不绑定千位分隔、货币符号或约字等装饰格式。
forms只有capabilities包含forms时非空。例如：{"name":"报名","capabilities":["forms"],"forms":[{"id":"signup","title":"活动报名","fields":[{"name":"name","label":"姓名","type":"text","required":true,"maxLength":80},{"name":"email","label":"邮箱","type":"email","required":true,"maxLength":200}]}],"acceptance":[{"kind":"fill","target":"#name","input":"测试访客"},{"kind":"fill","target":"#email","input":"visitor@example.invalid"},{"kind":"submitForm","formId":"signup","target":"#submit","output":"#status","value":"提交成功"}]}。
forms最多3个，每个最多12字段；字段type仅text/textarea/email/number/select，select必须有options字符串数组。id和字段name须以小写字母开头，仅小写字母数字下划线，最多40字符。required必须是布尔值。
验收类型：visible有target；fill有target和input，用于先填多字段；clickText有target、output、value；fillText有target、input、output、value；submitForm有formId、target、output、value。submitForm必须在填好所有必填字段后执行，每个声明的表单至少有一个submitForm验收。不要用visible代替核心操作；至少一个真正的操作检查，纯展示站可用visible。选择器简短明确。修改时保留未要求移除的功能和表单字段。`;
const instructions=`创建完整、美观、响应式、能实际运行的网页。仅返回合法JSON：{"schemaVersion":1,"name":"名称","entry":"index.html","files":[{"path":"index.html","content":"完整HTML含样式和脚本"}],"capabilities":[],"acceptance":[]}。只允许html/css/js/json/svg/txt资源；路径只能英文字母数字下划线连字符和目录斜杠，不允许绝对路径、..、反斜杠、百分号、node_modules、服务器代码或密钥。最多30文件，总大小2MiB。优先完整单HTML，用原生浏览器API，无外部字体/图片/CDN/API，图片用内联SVG或CSS。所有按钮真实工作，计算正确；禁止用alert、空事件或模拟提交冒充功能。必须实现用户已确认的验收选择器和行为，不得改验收以规避失败。适配390px手机与1440px桌面，不横向溢出。localStorage用于明确要求的本地持久化，初始化时恢复记录，禁止把它描述为云同步。支持静态功能、localStorage和声明式forms。forms表单通过平台自动提供的window.NeStdutio.submitForm(formId,values)异步提交，await成功后显示回执，catch显示错误；不要自己声明SDK或使用外部服务。HTML不用导入SDK，平台会在作品脚本之前注入。请禁用提交按钮直到请求结束，防止重复操作。按requiredForms字段生成真实表单，不收集未声明字段。预览提交为临时测试数据，发布后提交才保存真实数据。修改已有版本时保留未被要求改变的功能。不要Markdown、占位TODO、生成器说明或额外解释。`;
const fileInstructions=instructions.replace(/仅返回合法JSON：[\s\S]*?。只允许/,'本次返回文件原文：首行格式为<<<FILE>>>后紧接本次file.path（例如<<<FILE>>>index.html），最后一行<<<END_FILE>>>，两行之间仅完整文件内容。不要JSON、不要转义代码、不要Markdown或解释。不得输出其他文件。只允许').replace('优先完整单HTML，','按已确定清单拆分HTML、样式和逻辑，每个文件实现约定接口，');
export function createGenerator(store,checker,options={}){return {async run(input,callbacks={}){
 const config=store.config(),key=store.key();if(callbacks.expectedModel&&callbacks.expectedModel!==config.model||callbacks.expectedEndpoint&&callbacks.expectedEndpoint!==config.endpoint)fail('nestdutio_model_changed','模型配置已更新，积分已退回，请刷新后重试',409);if(!config.ready||!key)fail('nestdutio_unconfigured','请先启用NeStudio模型配置',503);
 if(typeof input?.prompt!=='string'||!input.prompt.trim()||input.prompt.length>4000)fail('nestdutio_prompt_invalid','请输入1至4000字需求',422);
 if(input.base)validateArtifact(input.base);
 const target=input.target??input.base?.target??'web',isNative=target==='wechat';
 if(!['web','wechat'].includes(target)||(input.base&&((input.base.target??'web')!==target)))fail('nestdutio_target_mismatch','项目目标与已有作品不一致',422);
 const quality=isNative?null:qualityProfile(input.prompt);
 const generationInstructions=isNative?nativeInstructions:instructions;
 const perFileInstructions=isNative?'你是微信原生小程序单文件代码生成器。严格按用户file.path和manifest职责生成一个完整文件。首行<<<FILE>>>后紧接file.path，最后一行<<<END_FILE>>>，中间为文件原文；不要JSON外包装、不要Markdown，不得输出其他文件或工程元数据。JSON配置文件的内容本身必须是合法JSON。原生页面使用Page、setData、WXML与WXSS；存储使用声明的wx.getStorageSync/setStorageSync等直接调用，禁止wx别名、DOM、HTML、Node、外部资源和未支持的网络/登录/支付接口。保持清单内文件接口和用户功能，acceptance选择器必须对应控件id或class。app.json只使用pages和window基本配置，不声明sitemapLocation、renderer、workers、preloadRule、plugins或分包等未支持项。project.config.json仅输出空对象，平台会生成安全配置。':fileInstructions;
 const validateOutput=raw=>{if((raw?.target??'web')!==target)fail('nestdutio_artifact_invalid','输出作品的目标不匹配');return validateArtifact(raw);};
 let phase='planning';const progress=event=>callbacks.onProgress?.({phase,...event});const setPhase=async state=>{phase=state;await callbacks.onPhase?.(state);};
 const now=options.now??Date.now,deadline=now()+600000,signal=AbortSignal.timeout(600000);let jsonMode=true,httpCalls=0,currentRequestSignal;
 async function request(messages,maxTokens,structured=true){
  if(callbacks.beforeRequest){const allowed=await callbacks.beforeRequest(messages,maxTokens);if(!Number.isSafeInteger(allowed)||allowed<128||allowed>maxTokens)fail('nestdutio_budget_exceeded','本次预算不足，积分已退回',402);maxTokens=allowed;}
  const payload={model:config.model,messages,max_tokens:maxTokens,stream:false,...(/^deepseek-(?:flash|v4-flash|v4-pro|chat)$/i.test(config.model)?{thinking:{type:'disabled'}}:{}),...(structured&&jsonMode?{response_format:{type:'json_object'}}:{}),...(/^(?:step-3\.[57]-flash|gpt-[56]|o[134])/.test(config.model)?{reasoning_effort:'low'}:{})};
  await progress({code:'model_waiting'});
  let meta;
  const observe=(status,usage={status:'missing'},httpStatus=null)=>callbacks.onRequest?.({...meta,status,usage,httpStatus});
  const observeError=async response=>{
   let text;try{text=await bounded(response);}catch(error){await observe('http_error',{status:'missing'},response.status);throw error;}
   let body;try{body=JSON.parse(text);}catch{}
   const usage=inspectUsage(body);await observe('http_error',usage,response.status);
   if(callbacks.onUsage&&usage.status==='reported')await callbacks.onUsage(normalizeUsage(body));
   return text;
  };
  const send=async()=>{
   if(httpCalls>=24)fail('nestdutio_request_limit','生成请求已达到安全上限');
   if(now()>=deadline-60000)fail('nestdutio_timeout','生成时间不足，已保留检查时间',504);
   httpCalls++;meta={sequence:httpCalls,phase,model:config.model};
   currentRequestSignal=AbortSignal.any([signal,AbortSignal.timeout(Math.min((config.requestTimeoutSeconds??180)*1000,deadline-60000-now()))]);
   try{return await safeFetch(config.endpoint,{...options,method:'POST',signal:currentRequestSignal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload)});}
   catch(error){await observe('transport_error');throw error;}
  };
  let response=await send();
  if(payload.response_format&&[400,422].includes(response.status)){
   const text=await observeError(response);
   if(/response_format/i.test(text)&&/unsupported|not supported|unknown parameter|unrecognized/i.test(text)){jsonMode=false;delete payload.response_format;response=await send();}
   else fail('nestdutio_provider_failed','模型服务拒绝了请求');
  }
  if(!response.ok){await observeError(response);await progress({code:'provider_http_error',status:response.status});fail('nestdutio_provider_failed','模型服务暂时不可用');}
  await progress({code:'model_responded'});
  let body;try{body=JSON.parse(await bounded(response));}catch{await observe('invalid_response',{status:'missing'},response.status);fail('nestdutio_provider_failed','模型响应格式错误');}
  const usage=inspectUsage(body);await observe(usage.status,usage,response.status);
  if(callbacks.onUsage){if(usage.status!=='reported')fail('nestdutio_usage_unavailable','上游未返回有效实际 Token 用量');await callbacks.onUsage(normalizeUsage(body));}
  const content=body.choices?.[0]?.message?.content;
  if(body.choices?.[0]?.finish_reason==='length'){
   await progress({code:'output_limit'});
   const error=new HttpError(502,'nestdutio_output_limit','模型输出达到本轮上限，未能返回完整作品，本次积分已退回');
   if(typeof content==='string'&&!content.includes(key)&&Buffer.byteLength(content)<=262144)error.partialContent=content;
   throw error;
  }
  if(typeof content!=='string'||content.includes(key))fail('nestdutio_provider_failed','模型响应无效');
  await progress({code:'model_received',characters:content.length});return content;
 }
 try{
  let planned,forms,acceptance,repairs=2;const resumed=callbacks.resumeCheckpoint&&Object.keys(callbacks.resumeCheckpoint).length?validateCheckpoint(callbacks.resumeCheckpoint,input,config):null;
  const planning=[{role:'system',content:isNative?nativePlanningContract+' 必须包含 manifest:{entry:"app.json",files:[{path,purpose,dependencies:[]}]}，最多12文件，包含全部原生根文件与页面四件套。完整JSON示例：{"schemaVersion":1,"target":"wechat","name":"计数器","entry":"app.json","capabilities":[],"acceptance":[{"kind":"tap","target":"#add","output":"#count","value":"1"}],"manifest":{"entry":"app.json","files":[{"path":"app.json","purpose":"页面注册","dependencies":[]}]}}。示例manifest省略了其他文件，实际必须列全。输入示例：{"kind":"input","target":"#principal","input":"120000"}，input类型字段名必须是input不能是value。每次input只填写一个字段，不检查结果；tap才可检查output/value，或用text检查结果；不支持fill/fillText/clickText等网页验收类型。':contract},{role:'user',content:JSON.stringify({prompt:input.prompt,platformQualityContract:quality?.contract??null,previousAcceptance:input.base?.acceptance??[],previousForms:input.base?.forms??[],previousEntry:input.base?.entry??null,previousFiles:(input.base?.files??[]).map(f=>({path:f.path,purpose:f.path===input.base?.entry?'现有入口页面':f.path.endsWith('.css')?'现有样式':f.path.endsWith('.js')?'现有交互逻辑':'现有资源'}))})}];
  while(!resumed){await setPhase(repairs===2?'planning':'repairing');if(repairs<2)await progress({code:'repair_started',attempt:2-repairs});const content=await request(planning,Math.min(config.maxTokens??16000,4000));
   try{planned=parse(content);if(!Array.isArray(planned.capabilities)||planned.capabilities.some(x=>!(isNative?['storage']:['localStorage','forms']).includes(x)))fail('nestdutio_capability_unavailable','该需求需要尚未支持的业务账号、支付或第三方服务，本次消耗会退回',422);forms=isNative?[]:validateForms(planned.forms??[]);acceptance=isNative?validateNativePlan({...planned,schemaVersion:1,target:'wechat',entry:'app.json'}).acceptance:validateArtifact({schemaVersion:1,name:planned.name,entry:'index.html',files:[{path:'index.html',content:'<title>plan</title>'}],capabilities:planned.capabilities,forms,acceptance:planned.acceptance}).acceptance;validateQualityPlan(quality,acceptance);if(isNative){try{validateManifest(planned.manifest,{target});}catch{fail('nestdutio_artifact_invalid','原生清单必须包含app.json/app.js/app.wxss/project.config.json和至少一套页面JS/JSON/WXML/WXSS，不得省略文件');}}await progress({code:'plan_validated',total:acceptance.length});break;}
   catch(error){if(['nestdutio_json_invalid','nestdutio_artifact_invalid','nestdutio_native_artifact_invalid','nestdutio_form_invalid'].includes(error.code))await progress({code:error.code==='nestdutio_json_invalid'?'json_invalid':'artifact_invalid'});if(!['nestdutio_json_invalid','nestdutio_artifact_invalid','nestdutio_native_artifact_invalid','nestdutio_form_invalid'].includes(error.code)||repairs===0)throw error;repairs--;planning.push({role:'assistant',content:content.slice(0,20000)},{role:'user',content:'请修复需求JSON，保持用户需求和能力边界。错误：'+(error.code==='nestdutio_json_invalid'?'JSON语法不完整':error.message)});}
  }
  if(resumed){planned=resumed.plan;forms=planned.forms;acceptance=planned.acceptance;}
  if(planned.manifest||resumed){
   const manifest=resumed?.manifest??validateManifest(planned.manifest,{target}),files=resumed?.files??[];
   const plan={...(isNative?{schemaVersion:1,target:'wechat',entry:'app.json'}:{}),name:planned.name,capabilities:planned.capabilities,forms,acceptance};const assembledFiles=()=>[...(input.base?.files??[]).filter(f=>!files.some(g=>g.path===f.path)),...files];
   const save=async()=>{await callbacks.onCheckpoint?.({schemaVersion:1,...generationFingerprint(input,config),plan,manifest,files:files.map(f=>({...f}))});};
   await progress({code:'manifest_validated',total:manifest.files.length});
   if(resumed)await progress({code:'checkpoint_reused',total:manifest.files.length,index:files.length});else await save();
   async function requestFile(messages,spec){
    try{return await request(messages,config.maxTokens??16000,false);}
    catch(error){
     const prefix=error.partialContent;
     if(error.code!=='nestdutio_output_limit'||typeof prefix!=='string'||!['<<<FILE>>>','<<<FILE>>>'+spec.path].includes(prefix.split(/\r?\n/)[0])||prefix.includes('<<<END_FILE>>>'))throw error;
     await progress({code:'file_continue',file:spec.path});
     const tail=await request([...messages,{role:'assistant',content:prefix},{role:'user',content:'上一条在长度上限处中断。逐字符接续上一条末尾，仅返回剩余文件内容，最后输出换行和<<<END_FILE>>>。不要重复已有前缀、不要再输出文件头、不要Markdown，不得省略功能。'}],config.maxTokens??16000,false);
     if(tail.trimStart().startsWith('<<<FILE>>>'))fail('nestdutio_artifact_invalid','续写重复文件头');
     return prefix+tail;
    }
   }
   const generateFile=async(spec,issues)=>{await setPhase(issues?'repairing':'generating');await progress({code:'file_started',file:spec.path,index:manifest.files.indexOf(spec)+1,total:manifest.files.length});
    let retryReason=null;for(let retry=0;retry<2;retry++){try{const text=await requestFile([{role:'system',content:perFileInstructions.replace('创建完整、美观、响应式、能实际运行的网页。','你是单文件代码生成器，本轮只生成 '+spec.path+'，职责：'+spec.purpose+'。').replace('例如<<<FILE>>>index.html','例如<<<FILE>>>'+spec.path)+'\n本轮首行必须是<<<FILE>>>'+spec.path+'。'+(spec.path.endsWith('.css')?'仅生成纯CSS样式，禁止HTML标签、script或整页代码。':spec.path.endsWith('.js')?'仅生成JavaScript代码，禁止HTML页面、style标签。':'按本文件类型输出，引用清单中的其他文件，不要将其他文件的职责全部塞进本文件。')},{role:'user',content:JSON.stringify({prompt:input.prompt,platformQualityContract:quality?.contract??null,plan,manifest,file:spec,completedFiles:files.filter(f=>f.path===manifest.entry||spec.dependencies.includes(f.path)),completedFileIndex:files.map(f=>({path:f.path})),previousVersion:input.base?{...input.base,files:input.base.files.filter(f=>f.path===spec.path||f.path===manifest.entry||spec.dependencies.includes(f.path))}:null,issues:issues??null,...(retry?{regeneration:'先前文件输出'+retryReason+'。请从头生成完整、紧凑代码，去除重复但完整保留原需求、功能、样式与接口，不续写、不省略功能。'}:{})})}],spec);const file=parseFile(text,spec.path);if(file.path!==spec.path||typeof file.content!=='string'||Buffer.byteLength(file.content)>262144)fail('nestdutio_artifact_invalid','文件内容或路径无效');validateGeneratedFile(file,target);const other=files.filter(f=>f.path!==file.path);if(other.reduce((n,f)=>n+Buffer.byteLength(f.content),Buffer.byteLength(file.content))>2097152)fail('nestdutio_artifact_invalid','文件总大小超限');const index=files.findIndex(f=>f.path===file.path);if(index<0)files.push({path:file.path,content:file.content});else files[index]={path:file.path,content:file.content};await save();await progress({code:'file_saved',file:spec.path,index:files.length,total:manifest.files.length});return;}catch(error){if(retry||!['nestdutio_output_limit','nestdutio_json_invalid','nestdutio_artifact_invalid'].includes(error.code))throw error;retryReason=error.code==='nestdutio_output_limit'?'达到上限而截断':'JSON或脚本语法不完整';await progress({code:'file_retry',file:spec.path,attempt:2});}}
   };
   for(const spec of manifest.files)if(!files.some(f=>f.path===spec.path))await generateFile(spec);
   for(let attempt=0;attempt<3;attempt++){
    let artifact,report;
    try{artifact=validateOutput({schemaVersion:1,...plan,entry:manifest.entry,files:assembledFiles()});await progress({code:'artifact_validated'});await setPhase('checking');report=await checker.check(artifact,{deadline,quality,onProgress:event=>progress(event)});}
    catch(error){if(!isNative||!['nestdutio_artifact_invalid','nestdutio_native_artifact_invalid'].includes(error.code))throw error;report={ok:false,issues:[{code:'native_structure_failed',path:'native',detail:error.message.slice(0,300)}]};}
    if(report.ok){await progress({code:'checks_passed',total:acceptance.length});return artifact;}for(const issue of report.issues??[]){const match=/^acceptance\[(\d+)\]$/.exec(issue.path??'');await progress({code:'check_issue',issue:issue.code,step:issue.phase,...(match?{index:Number(match[1])+1}:{})});}if(attempt===2)fail('nestdutio_check_failed','作品仍未通过运行检查，本次消耗已退回');await progress({code:'repair_started',attempt:attempt+1});const issuePaths=new Set((report.issues??[]).map(i=>i.path));const targets=manifest.files.filter(f=>issuePaths.has(f.path));for(const spec of targets.length?targets:manifest.files)await generateFile(spec,report.issues??[]);}
  }
  const messages=[{role:'system',content:generationInstructions},{role:'user',content:JSON.stringify({prompt:input.prompt,platformQualityContract:quality?.contract??null,requiredAcceptance:acceptance,requiredForms:forms,capabilities:planned.capabilities,previousVersion:input.base??null})}];
  for(let attempt=0;attempt<3;attempt++){
   await setPhase(attempt?'repairing':'generating');if(attempt)await progress({code:'repair_started',attempt});const content=await request(messages,config.maxTokens??16000);let safeIssue;
   try{const raw=parse(content);const artifact=validateOutput({...raw,...(isNative?{target:'wechat'}:{}),acceptance,forms,capabilities:planned.capabilities});await progress({code:'artifact_validated'});await setPhase('checking');const report=await checker.check(artifact,{deadline,quality,onProgress:event=>progress(event)});if(report.ok){await progress({code:'checks_passed',total:acceptance.length});return artifact;}for(const issue of report.issues??[]){const match=/^acceptance\[(\d+)\]$/.exec(issue.path??'');await progress({code:'check_issue',issue:issue.code,step:issue.phase,...(match?{index:Number(match[1])+1}:{})});}safeIssue=JSON.stringify(report.issues);}catch(error){if(['nestdutio_json_invalid','nestdutio_artifact_invalid','nestdutio_native_artifact_invalid','nestdutio_form_invalid'].includes(error.code))await progress({code:error.code==='nestdutio_json_invalid'?'json_invalid':'artifact_invalid'});if(!['nestdutio_artifact_invalid','nestdutio_native_artifact_invalid','nestdutio_json_invalid'].includes(error.code))throw error;safeIssue=error.code==='nestdutio_artifact_invalid'?error.message:'JSON syntax invalid';}
   if(repairs===0)fail('nestdutio_check_failed','作品仍未通过运行检查，本次消耗已退回');repairs--;messages.push({role:'assistant',content:content.slice(0,100000)},{role:'user',content:'修复以下检查问题并重新输出完整JSON，保留原需求和验收，不可省略功能：'+safeIssue});
  }
 }catch(error){if(signal.aborted||currentRequestSignal?.aborted)fail('nestdutio_timeout','生成超时，本次消耗已退回',504);if(error instanceof HttpError)throw error;fail('nestdutio_generation_failed','暂未生成可运行作品，本次消耗已退回');}
 }};}
