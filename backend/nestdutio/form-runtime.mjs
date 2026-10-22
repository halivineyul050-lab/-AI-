import {randomUUID,createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {HttpError,readJsonBody} from '../validation.mjs';
import {validateSubmission} from './form-schema.mjs';

export function createFormLimiter({max=20,windowMs=60000,capacity=10000}={}){
 const buckets=new Map();return key=>{const now=Date.now();let bucket=buckets.get(key);if(!bucket||bucket.until<=now){if(buckets.size>=capacity){for(const [k,b]of buckets)if(b.until<=now)buckets.delete(k);if(buckets.size>=capacity)throw new HttpError(429,'nestdutio_form_busy','服务繁忙，请稍后提交');}bucket={count:0,until:now+windowMs};buckets.set(key,bucket);}if(++bucket.count>max)throw new HttpError(429,'nestdutio_form_rate','提交过于频繁，请稍后重试');};
}
export function clientRuntime(basePath){return `(()=>{'use strict';const pending=new Map();Object.defineProperty(window,'NeStdutio',{value:Object.freeze({submitForm(formId,values,options={}){if(!/^[a-z][a-z0-9_]{0,39}$/.test(formId))return Promise.reject(Error('表单无效'));const fingerprint=JSON.stringify([formId,values]);if(pending.has(fingerprint))return pending.get(fingerprint);const operation=(async()=>{const response=await fetch(${JSON.stringify(basePath)}+'/forms/'+formId,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({requestKey:options.requestKey||crypto.randomUUID(),values})});const result=await response.json();if(!response.ok)throw Error(result.message||'提交失败，请稍后重试');return result.data;})();pending.set(fingerprint,operation);operation.then(()=>pending.delete(fingerprint),()=>pending.delete(fingerprint));return operation;}}),writable:false,configurable:false});})();`;}
export function injectFormRuntime(html,artifact,basePath){if(!artifact.capabilities.includes('forms'))return html;const script='<script src="'+basePath+'/runtime.js"></script>';if(/<head(?:\s[^>]*)?>/i.test(html))return html.replace(/<head(?:\s[^>]*)?>/i,head=>head+script);if(/<!doctype[^>]*>/i.test(html))return html.replace(/<!doctype[^>]*>/i,doctype=>doctype+script);return script+html;}
export function createPreviewForms(){const rows=new Map();return {submit(schema,input){const values=validateSubmission(schema,input.values);if(typeof input.requestKey!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestKey))throw new HttpError(422,'nestdutio_form_request_invalid','提交标识无效');const key=schema.id+':'+input.requestKey,hash=createHash('sha256').update(JSON.stringify(values)).digest('hex'),old=rows.get(key);if(old){if(old.hash!==hash)throw new HttpError(409,'nestdutio_form_request_conflict','提交标识冲突');return {id:old.id,duplicate:true,preview:true};}if(rows.size>=100)throw new HttpError(429,'nestdutio_form_quota','预览最多保留100条测试记录');const id=randomUUID();rows.set(key,{id,formId:schema.id,hash});return {id,duplicate:false,preview:true};},count(formId){return [...rows.values()].filter(r=>r.formId===formId).length;}};}
export async function handleFormRuntime(request,response,{artifact,origin,basePath,submit,limit=()=>{}}){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 const json=(status,body)=>{if(!response.destroyed){response.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify(body));}};
 try{
  let path;try{path=new URL(request.url,'http://runtime.invalid').pathname;}catch{json(400,{code:'invalid_request_target'});return true;}if(!path.startsWith(basePath+'/'))return false;
  if(!artifact.capabilities.includes('forms')){json(404,{code:'not_found'});return true;}
  if(path===basePath+'/runtime.js'&&['GET','HEAD'].includes(request.method)){const body=clientRuntime(basePath);response.writeHead(200,{...headers,'Content-Type':'text/javascript; charset=utf-8'});response.end(request.method==='HEAD'?'':body);return true;}
  const match=path.slice(basePath.length).match(/^\/forms\/([a-z][a-z0-9_]{0,39})$/);if(!match){json(404,{code:'not_found'});return true;}
  if(request.method!=='POST'){json(405,{code:'method_not_allowed'});return true;}
  if(request.headers.origin!==origin||!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']??''))throw new HttpError(403,'nestdutio_form_origin','请在作品页面内提交表单');
  const schema=artifact.forms?.find(f=>f.id===match[1]);if(!schema)throw new HttpError(404,'nestdutio_form_not_found','表单不存在');
  const remote=request.socket.remoteAddress??'',forwarded=request.headers['x-real-ip'];const ip=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:remote;limit(ip);
  const input=await readJsonBody(request,16384);if(Object.keys(input).some(k=>!['requestKey','values'].includes(k)))throw new HttpError(422,'nestdutio_form_invalid','提交包含未声明字段');validateSubmission(schema,input.values);
  const result=await submit(schema,input);json(201,{data:result});
 }catch(error){json(error instanceof HttpError?error.status:500,{code:error instanceof HttpError?error.code:'nestdutio_form_failed',message:error instanceof HttpError?error.message:'暂时无法保存，请稍后重试'});}
 return true;
}
