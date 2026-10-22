import {HttpError} from './validation.mjs';
import {safeFetch} from './safe-upstream.mjs';
import {parseExplainerOutput,repairHint,outputIssue} from './explainer-output.mjs';
const instructions=`你是中文交互教学设计师。为用户的具体问题生成清楚、可辨认、会运动的教学示意，只返回紧凑JSON，不要Markdown、代码或外部资源。聚焦一个核心机制，4至8个必要部件，3至4步骤，禁止堆砌装饰或用散落方块冒充实物。
结构示例：{"version":2,"title":"标题","summary":"对象","reason":"因果解释","try":"操作建议","assumptions":"简化限制","variables":{"x":0},"controls":[{"id":"x","label":"进程","min":0,"max":1,"step":0.01}],"parts":[{"id":"body","name":"主体","description":"作用","type":"box","position":[0,0,0],"size":[40,30,20],"tone":"mid","palette":"blue","rotation":0,"scale":1,"explode":[0,0,20]}],"steps":[{"title":"观察","text":"什么变化导致什么现象","parts":["body"],"values":{"x":0},"duration":4}]}。
parts类型仅box/cylinder/gear/spring/pipe/sphere/profile。sphere是椭球，不能把器官画成一堆不相连的球；机械用装配结构，自然实物用整体轮廓，抽象机制用节点与移动消息。部件名字会显示在画面上。坐标范围±500，size为三个正数字常量且不超过200，explode为三个数字常量且范围±200。rotation是角度，scale为0.1至3之间的数字或表达式，可演示收缩。tone只允许lo/mid/hi/lit；palette可选slate/blue/coral/teal/amber/violet，用不同颜色区分作用。
profile是有厚度的竖直轮廓，size=[宽,厚,高]，position是底部中心，需outline为3至32个二维点，坐标范围[-0.5,0.5]，y朝上。可以直接采用心形outline=[[0,-0.5],[-0.5,0.1],[-0.3,0.5],[0,0.28],[0.3,0.5],[0.5,0.1]]，其他对象自行设计匹配轮廓。器官部件按实际关系相连，不要散落；不要用外壳遮挡核心对象。
变量最多6个，滑块1至3个；id用英文字母开头的字母数字下划线，唯一。每个滑块必须明显改变位置、角度或scale。第一步是初态，后续steps.values必须在控制范围内并有可观察变化；播放器会连续插值，设计真实动作而不是仅切换高亮，旋转角连续。duration为2至15秒，steps.parts引用真实id，values只引用滑块变量。文字解释具体因果及简化条件，不编造精确测量。
所有计算只用数组AST；引用变量"$x"；可用add/sub/mul/div/pow/sin/cos/sqrt/abs/min/max/round/floor，形式如["mul","$x",90]；比较gt/lt/lte/gte/eq，条件["if",["gt","$x",0.5],1,0]。三角函数用弧度，所有中间状态必须有限。禁止字符串算式、零除、负数开方。全JSON不超过48000字符，必须输出完整对象。`;
async function bounded(response){if(!response.body)throw Error('Empty response');const reader=response.body.getReader();let size=0;const chunks=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>512000){await reader.cancel();throw Error('Response too large');}chunks.push(Buffer.from(value));}return Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}}
export function createExplainerRunner(store,options={}){return {async run(user,input,callbacks={}){
 store.assertUser(user);
 if(typeof input?.question!=='string'||!input.question.trim()||input.question.length>1000)throw new HttpError(422,'invalid_explainer_question','请输入不超过1000字的问题');
 const config=store.config();if(!config.ready)throw new HttpError(503,'explainer_unconfigured','AI讲解暂未启用，请在运营中心配置并启用AI助手');
 const providerKey=store.key();
 const reservation=callbacks.reserve?callbacks.reserve(()=>store.reserve(user,config.dailyLimit)):store.reserve(user,config.dailyLimit);
 const signal=AbortSignal.timeout((config.requestTimeoutSeconds??120)*1000);
 let jsonMode=true;
 let phase='connection',attemptNumber=0,upstreamStatus=null,finishReason=null,contentLength=0,validationReason=null;
 const diagnostic=(event,category)=>{try{(options.logger??console).warn(JSON.stringify({event,category,...(/^[a-f0-9-]{36}$/.test(callbacks.taskId??'')?{taskId:callbacks.taskId}:{}),phase,attempt:attemptNumber,upstreamStatus,finishReason,contentLength,validationReason}));}catch{}};
 try{
  await callbacks.onReservation?.(reservation);
  await callbacks.onPhase?.('planning');
  const messages=[{role:'system',content:instructions},{role:'user',content:JSON.stringify({question:input.question,mode:['参数实验','逐步演示','关系图'].includes(input.mode)?input.mode:'自动',level:input.level==='standard'?'一般':'零基础'})}];
  for(let attempt=0;attempt<2;attempt++){
   attemptNumber=attempt+1;phase='connection';upstreamStatus=null;finishReason=null;contentLength=0;validationReason=null;
   await callbacks.onPhase?.('building');
   const payload={model:config.model,messages,max_tokens:config.maxTokens??12000,stream:false,...(jsonMode?{response_format:{type:'json_object'}}:{}),...(/^(?:step-3\.[57]-flash|gpt-[56]|o[134])/.test(config.model)?{reasoning_effort:'low'}:{})};
   const request=()=>safeFetch(config.endpoint,{...options,method:'POST',signal,headers:{Authorization:'Bearer '+providerKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
   let response=await request();
   if(jsonMode&&[400,422].includes(response.status)){
    const rejection=await bounded(response);
    if(/response_format/i.test(rejection)&&/unsupported|not supported|unknown parameter|unrecognized/i.test(rejection)){
     jsonMode=false;delete payload.response_format;response=await request();
    }else{phase='provider_rejected';throw Error('Provider rejected');}
   }
   upstreamStatus=response.status;
   if(!response.ok){phase='provider_rejected';await response.body?.cancel();throw Error('Provider rejected');}
   phase='response';
   const body=JSON.parse(await bounded(response));const content=body.choices?.[0]?.message?.content;
   finishReason=['stop','length','content_filter','tool_calls'].includes(body.choices?.[0]?.finish_reason)?body.choices[0].finish_reason:'other';contentLength=typeof content==='string'?content.length:0;
   if(finishReason==='length'){phase='scene';diagnostic('explainer_attempt_failed','truncated');throw Error('Truncated output');}
   if(typeof content!=='string'||content.includes(providerKey))throw Error('Invalid response');
   let validated=false;
   try{
    phase='scene';
    await callbacks.onPhase?.('checking');
    const scene=parseExplainerOutput(content);
    validated=true;
    if(callbacks.commitSuccess)await callbacks.commitSuccess(scene,reservation);else store.settle(user,reservation,false);return scene;
   }catch(error){
    if(validated)throw error;
    const issue=outputIssue(error);validationReason=issue.code+' '+issue.path;
    diagnostic('explainer_attempt_failed',finishReason==='length'?'truncated':'invalid_scene');
    if(attempt===1)throw error;
    await callbacks.onPhase?.('repairing');
    messages.push({role:'assistant',content:content.slice(0,20000)},{role:'user',content:repairHint(error)});
   }
  }
 }catch{store.settle(user,reservation,true);const code=signal.aborted?'explainer_timeout':phase==='provider_rejected'?'explainer_provider_rejected':phase==='scene'?(finishReason==='length'?'explainer_output_truncated':'explainer_invalid_scene'):'explainer_generation_failed';diagnostic('explainer_generation_failed',code);throw new HttpError(signal.aborted?504:502,code,'本次未能生成可运行的演示，次数已退回。请细化问题后重试。');}
 }};}

