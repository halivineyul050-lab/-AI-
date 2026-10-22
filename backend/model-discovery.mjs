import {HttpError} from './validation.mjs';
import {safeFetch} from './safe-upstream.mjs';
const fail=(status,message)=>new HttpError(status,'model_discovery_failed',message);
export function chatEndpoint(value){
 let url;try{if(typeof value!=='string'||value.length>2048)throw Error();url=new URL(value.trim());}catch{throw fail(422,'请输入有效的 HTTPS 接口地址');}
 const path=url.pathname.replace(/\/$/,'');
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(path&&!/^\/(?:[A-Za-z0-9_-]+\/)*v1(?:\/chat\/completions)?$/.test(path)))throw fail(422,'请填写 HTTPS 平台地址、/v1 或完整聊天接口');
 url.pathname=!path?'/v1/chat/completions':path.endsWith('/chat/completions')?path:path+'/chat/completions';
 return url.href;
}
export async function discoverModels(input,saved={},options={}){
 const endpoint=chatEndpoint(input?.endpoint);
 if(input.apiKey!==undefined&&(typeof input.apiKey!=='string'||input.apiKey.length>4096))throw fail(422,'API Key 格式无效');
 let key=input.apiKey?.trim();
 if(!key&&!input.clearKey){
  let same=false;try{same=chatEndpoint(saved.endpoint)===endpoint;}catch{}
  if(!same)throw fail(422,'新服务地址请填写 API Key 后获取模型');
  try{key=saved.key?.();}catch{throw fail(422,'已保存密钥不可用，请重新填写');}
 }
 if(!key||/[\r\n]/.test(key))throw fail(422,'请填写 API Key 后获取模型');
 const signal=AbortSignal.timeout(15000);
 try{
  const response=await safeFetch(endpoint.replace(/\/chat\/completions$/,'/models'),{...options,signal,headers:{Authorization:'Bearer '+key,Accept:'application/json'}});
  if(!response.ok){await response.body?.cancel();throw fail(502,[401,403].includes(response.status)?'鉴权失败，请检查 API Key 和模型权限':[404,405].includes(response.status)?'服务商未开放模型列表接口，请检查地址或联系服务商':response.status===429?'请求过于频繁，请稍后刷新':'获取模型失败，请稍后刷新');}
  if(!response.body)throw fail(502,'模型列表响应为空');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw fail(502,'模型列表响应过大');chunks.push(Buffer.from(value));}}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
  let payload;try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(502,'模型列表格式不兼容');}
  const values=Array.isArray(payload)?payload:payload?.data;if(!Array.isArray(values))throw fail(502,'模型列表格式不兼容');
  const ids=[...new Set(values.map(x=>typeof x==='string'?x:x?.id).filter(x=>typeof x==='string'&&x.trim()&&x.length<=200&&!/[\x00-\x1f\x7f]/.test(x)&&!x.includes(key)).map(x=>x.trim()))].sort();
  if(ids.length>10000)throw fail(502,'模型数量超出限制');
  return {items:ids.map(id=>({id}))};
 }catch(error){if(error instanceof HttpError)throw error;throw fail(signal.aborted?504:502,signal.aborted?'获取模型超时，请刷新重试':'无法连接模型服务，请检查地址与网络');}
}
