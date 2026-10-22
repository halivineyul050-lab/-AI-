import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {validateNativeArtifact} from './native-artifact.mjs';
import {HttpError} from '../validation.mjs';
const runtime=readFileSync(new URL('./native-preview-runtime.js',import.meta.url),'utf8');
export function createNativePreview(input){
 const artifact=validateNativeArtifact(input),files=Object.fromEntries(artifact.files.map(f=>[f.path,f.content]));
 const expressions=new Set();for(const file of artifact.files.filter(f=>f.path.endsWith('.wxml')))for(const m of file.content.matchAll(/{{([\s\S]*?)}}/g))expressions.add(m[1].trim());
 const modules=artifact.files.filter(f=>f.path.endsWith('.js')).map(f=>JSON.stringify(f.path)+':function(require,module,exports){\n'+f.content+'\n}');
 const source='window.__nativeBundle={files:'+JSON.stringify(files)+',modules:{'+modules.join(',')+'},expressions:{'+[...expressions].map(e=>JSON.stringify(e)+':function(scope){with(scope){return ('+e+');}}').join(',')+'}};window.startNativeSimulator();';
 try{new Script(source);}catch{throw new HttpError(422,'nestdutio_native_preview_invalid','模拟预览无法解析工程表达式，请查看源码并在微信开发者工具验证');}
 if(Buffer.byteLength(source)>262144)throw new HttpError(422,'nestdutio_native_preview_limit','工程超过浏览器模拟预览大小限制，仍可下载到微信开发者工具运行');
 return {schemaVersion:1,name:artifact.name,entry:'index.html',capabilities:artifact.capabilities.includes('storage')?['localStorage']:[],acceptance:[{kind:'visible',target:'#simulator-page'}],files:[
  {path:'index.html',content:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小程序模拟预览</title><link rel="stylesheet" href="simulator.css"><header id="simulator-title"></header><div id="simulator-notice" role="status">浏览器模拟 · 微信能力与真机表现需另行验证</div><main id="simulator-page"></main><nav id="simulator-tabs"></nav><div id="simulator-toast" role="status"></div><script src="runtime.js"></script><script src="bundle.js"></script></html>'},
  {path:'runtime.js',content:runtime},{path:'bundle.js',content:source},
  {path:'simulator.css',content:'*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,sans-serif;color:#252334;background:#f7f7fa}#simulator-title{padding:13px;text-align:center;font-weight:600;background:white}#simulator-notice{padding:8px 12px;font:11px/1.5 system-ui;color:#766983;background:#f0ecfa}#simulator-page{min-height:70vh}#simulator-tabs{display:flex;position:sticky;bottom:0;background:white}#simulator-tabs button{flex:1}#simulator-toast{position:fixed;bottom:70px;left:15%;right:15%;padding:12px;text-align:center;border-radius:12px;background:#252334;color:white;pointer-events:none}#simulator-toast:empty{display:none}wx-view,wx-scroll-view,wx-cover-view,wx-form,wx-block{display:block}wx-text{white-space:pre-wrap}button{font:inherit;cursor:pointer;border:1px solid #ddd;border-radius:7px;padding:10px 18px}input,textarea,select{font:inherit;max-width:100%;padding:8px}img{max-width:100%}'}
 ]};
}
