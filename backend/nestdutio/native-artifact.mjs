import posix from 'node:path/posix';
import {HttpError} from '../validation.mjs';
const fail=path=>{throw new HttpError(422,'nestdutio_native_artifact_invalid','原生作品结构不符合要求：'+path);};
const text=(value,max,path)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(path);return value;};
const valueText=(value,path)=>{if(typeof value!=='string'||value.length>200)fail(path);return value;};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const basicWxApis=new Set(['showToast','hideToast','showModal','showLoading','hideLoading','showActionSheet','navigateTo','redirectTo','navigateBack','switchTab','reLaunch','setNavigationBarTitle','stopPullDownRefresh']);
const storageWxApis=new Set(['setStorage','setStorageSync','getStorage','getStorageSync','getStorageInfo','getStorageInfoSync','removeStorage','removeStorageSync','clearStorage','clearStorageSync']);
// Conservative static contract checks, not a JavaScript security sandbox.
function validateWxCalls(source,capabilities){
 for(const match of source.matchAll(/\bwx\b/g)){
  const call=/^\s*\.\s*([a-zA-Z_$][\w$]*)\s*\(/.exec(source.slice(match.index+2));
  if(!call)fail('wx.direct_call_required');
  if(storageWxApis.has(call[1])){if(!capabilities.includes('storage'))fail('capabilities.storage');}
  else if(!basicWxApis.has(call[1]))fail('capability_unavailable');
 }
}
export function nativePath(path){
 if(typeof path!=='string'||path.length>160||(path!=='project.config.json'&&!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.(?:js|json|wxml|wxss|svg|txt)$/.test(path))||path.split('/').some(part=>['node_modules','data','imports'].includes(part)))fail('files.path');
 return path;
}
function metadata(input){
 if(!object(input)||input.schemaVersion!==1||input.target!=='wechat')fail('schemaVersion/target');
 if(input.entry!=='app.json')fail('entry');
 const name=text(input.name,80,'name');
 if(!Array.isArray(input.capabilities)||input.capabilities.some(c=>c!=='storage'))fail('capability_unavailable');
 if(!Array.isArray(input.acceptance)||!input.acceptance.length||input.acceptance.length>48)fail('acceptance');
 const acceptance=input.acceptance.map(a=>{
  if(!object(a)||!['visible','tap','input','text'].includes(a.kind))fail('acceptance.kind');
  const target=text(a.target,160,'acceptance.target');
  if(!/^[#.][a-zA-Z_][a-zA-Z0-9_-]*$/.test(target))fail('acceptance.target');
  const out={kind:a.kind,target};
  if(a.kind==='input')out.input=valueText(a.input,'acceptance.input 必须使用input字符串字段，不使用value');
  if(a.kind==='text')out.value=valueText(a.value,'acceptance.value');
  if(a.kind==='tap'&&(a.output!==undefined||a.value!==undefined)){
   if(typeof a.output!=='string'||! /^[#.][a-zA-Z_][a-zA-Z0-9_-]*$/.test(a.output))fail('acceptance.output');
   out.output=a.output;out.value=valueText(a.value,'acceptance.value');
  }
  return out;
 });
 return {schemaVersion:1,target:'wechat',name,entry:'app.json',capabilities:[...new Set(input.capabilities)],acceptance};
}
export function validateNativePlan(input){return metadata(input);}
function reference(from,ref){
 if(typeof ref!=='string'||!ref||/[:\\%?#]/.test(ref))fail('reference');
 const resolved=ref.startsWith('/')?ref.slice(1):posix.join(posix.dirname(from),ref);
 nativePath(resolved+'.json');return resolved;
}
export function validateNativeArtifact(input,{appid='touristappid'}={}){
 const meta=metadata(input);
 if(!/^(?:touristappid|wx[0-9a-f]{16})$/.test(appid))fail('appid');
 if(!Array.isArray(input.files)||!input.files.length||input.files.length>30)fail('files');
 let bytes=0;const paths=new Set();
 const files=input.files.map(f=>{
  if(!object(f))fail('files');const path=nativePath(f.path);if(paths.has(path))fail('files.duplicate');paths.add(path);
  if(typeof f.content!=='string')fail('files.content');const size=Buffer.byteLength(f.content);bytes+=size;
  if(size>262144||bytes>2097152)fail('files.size');return {path,content:f.content};
 });
 for(const path of ['app.json','app.js','app.wxss','project.config.json'])if(!paths.has(path))fail(path);
 const config=files.find(f=>f.path==='project.config.json');
 config.content=JSON.stringify({compileType:'miniprogram',miniprogramRoot:'./',appid},null,2);
 const json=new Map();
 for(const file of files){
  const {path,content}=file;
  if(path.endsWith('.js'))validateWxCalls(content,meta.capabilities);
  if(/appsecret|api[_-]?key|access[_-]?token|-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(content))fail('secrets');
  if(path.endsWith('.js')&&/\b(?:window|document|localStorage|sessionStorage|process|globalThis|eval|Function)\b|\bimport\s*\(|\b(?:module\.exports|exports\.)|\b(?:fetch|XMLHttpRequest)\s*\(/.test(content))fail('browser/server code');
  if(/\bwx\s*(?:\.\s*(?:request|uploadFile|downloadFile|connectSocket|cloud|login|requestPayment)|\[)/.test(content))fail('capability_unavailable');
  if(!meta.capabilities.includes('storage')&&/\bwx\s*\.\s*(?:setStorage|getStorage|removeStorage|clearStorage)/.test(content))fail('capabilities.storage');
  if(/<(?:\/?\s*)(?:html|body|head|script|iframe|web-view|wxs)\b/i.test(content))fail('native markup');
  if(path.endsWith('.json')){let value;try{value=JSON.parse(content);}catch{fail(path);}if(!object(value))fail(path);json.set(path,value);
   for(const key of ['subpackages','subPackages','plugins','preloadRule','workers','sitemapLocation','functionalPages','entryPagePath','renderer','componentFramework','resolveAlias','scripts','script','packOptions','condition','genericsImplementation','componentGenerics'])if(key in value)fail('unsupported config.'+key);
   if(value.tabBar?.custom)fail('unsupported custom tabBar');
  }
  if(path.endsWith('.js')&&/\bimport\s+(?!\()|\brequire\s*\(\s*[^'"\s]/.test(content))fail('unsupported module');
  if(path.endsWith('.js'))for(const match of content.matchAll(/\brequire\s*\(\s*(['"])(.*?)\1\s*\)/g)){
   const ref=match[2];if(!ref.startsWith('.'))fail('require');const target=posix.join(posix.dirname(path),ref);nativePath(target.endsWith('.js')?target:target+'.js');if(!paths.has(target)&&!paths.has(target+'.js'))fail('require.missing');
  }
 }
 const app=json.get('app.json');if(!Array.isArray(app.pages)||!app.pages.length||app.pages.length>12||new Set(app.pages).size!==app.pages.length)fail('app.pages');
 const quartet=base=>{for(const ext of ['js','json','wxml','wxss']){nativePath(base+'.'+ext);if(!paths.has(base+'.'+ext))fail('missing '+base+'.'+ext);}};
 for(const page of app.pages){if(typeof page!=='string'||page.startsWith('/')||page.includes('.'))fail('app.pages');quartet(page);}
 for(const item of app.tabBar?.list??[]){if(!app.pages.includes(item.pagePath))fail('tabBar.pagePath');for(const key of ['iconPath','selectedIconPath'])if(item[key]!==undefined){nativePath(item[key]);if(!paths.has(item[key]))fail('tabBar.icon');}}
 const visited=new Set(),active=new Set();
 const visit=path=>{
  if(active.has(path))fail('usingComponents.cycle');if(visited.has(path))return;active.add(path);
  const config=json.get(path);if(!config)fail('usingComponents.config');
  if(config.usingComponents!==undefined){if(!object(config.usingComponents))fail('usingComponents');for(const ref of Object.values(config.usingComponents)){
   const base=reference(path,ref);quartet(base);if(json.get(base+'.json')?.component!==true)fail('usingComponents.component');visit(base+'.json');
  }}active.delete(path);visited.add(path);
 };
 for(const path of json.keys())visit(path);
 for(const {path,content} of files){
  if(path.endsWith('.wxml'))for(const resource of content.matchAll(/<(?:image|cover-image|audio|video)\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi)){const ref=resource[1];if(ref.includes('{{'))fail('dynamic resource');const target=ref.startsWith('/')?ref.slice(1):posix.join(posix.dirname(path),ref);nativePath(target);if(!paths.has(target))fail('resource.missing');}
  if(path.endsWith('.wxml'))for(const match of content.matchAll(/<(?:import|include)\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi)){const ref=match[1];if(!ref.endsWith('.wxml'))fail('wxml reference');const target=reference(path,ref.slice(0,-5))+'.wxml';if(!paths.has(target))fail('wxml reference.missing');}
  if(path.endsWith('.wxss'))for(const match of content.matchAll(/@import\s+['"]([^'"]+)['"]/g)){const ref=match[1];if(!ref.endsWith('.wxss'))fail('wxss reference');const target=reference(path,ref.slice(0,-5))+'.wxss';if(!paths.has(target))fail('wxss reference.missing');}
  if(path.endsWith('.wxss')){
   let count=0;
   for(const match of content.matchAll(/\burl\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^\s'"()]+))\s*\)/gi)){
    count++;const ref=match[1]??match[2]??match[3];
    if(!ref||/[:\\%?#{}]/.test(ref))fail('wxss resource');
    const target=ref.startsWith('/')?ref.slice(1):posix.join(posix.dirname(path),ref);
    nativePath(target);if(!paths.has(target))fail('wxss resource.missing');
   }
   if(count!==[...content.matchAll(/\burl\s*\(/gi)].length)fail('wxss resource.syntax');
  }
 }
 return {...meta,files,verification:{structure:'passed',compile:'pending',business:'pending'}};
}
export const nativePlanningContract=`返回 JSON 原生计划：schemaVersion:1,target:"wechat",name,entry:"app.json",capabilities:[] 或 ["storage"],acceptance。acceptance 为 visible/tap/input/text，target 仅 #id 或 .class；input 使用 input 字符串，text 使用 value 字符串。文件规划最多12个；必需 app.json/app.js/app.wxss/project.config.json 及每页 js/json/wxml/wxss 四件套。只支持主包及本地自定义组件。`;
export const nativeInstructions=`生成可存储 JSON 微信原生小程序作品。${nativePlanningContract} files 为 [{path,content}]，内容为纯文本，路径仅小写字母数字下划线连字符及目录。允许 js/json/wxml/wxss/svg/txt，不支持二进制/base64图片。使用 App、Page、Component、setData、微信基础组件和声明的 wx 存储 API。禁止 HTML/web-view、浏览器 DOM、Node 服务端代码、动态执行、第三方包、WXS、分包、插件、云开发、网络请求、登录支付、秘钥。远程报名/后台/数据库需求必须返回明确 capability_unavailable，不能把本地存储宣称为真实提交。project.config.json 由平台覆盖，不能含 AppSecret。组件 usingComponents 只能引用包内完整组件。结构检查不是编译或业务验证，不要声称已运行。`;

