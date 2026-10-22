import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {artifactPath,validateArtifact} from './artifact.mjs';
import {nativePath,validateNativePlan} from './native-artifact.mjs';
import {HttpError} from '../validation.mjs';
const invalid=()=>{throw new HttpError(409,'nestdutio_checkpoint_invalid','生成检查点已失效，请重新生成');};
const stable=x=>JSON.stringify(x===undefined?null:x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=x=>createHash('sha256').update(stable(x)).digest('hex');
export function generationFingerprint(input,config){return {promptHash:hash(input.prompt),baseHash:hash(input.base??null),configHash:hash({endpoint:config.endpoint,model:config.model,maxTokens:config.maxTokens??16000,requestTimeoutSeconds:config.requestTimeoutSeconds??180,...((input.target??input.base?.target)==='wechat'?{target:'wechat'}:{})})};}
export function validateManifest(value,{target='web'}={}){if(!value||!Array.isArray(value.files)||!value.files.length||value.files.length>12)invalid();const pathOf=target==='wechat'?nativePath:artifactPath,entry=pathOf(value.entry),seen=new Set();const files=value.files.map(f=>{const path=pathOf(f.path);if(seen.has(path)||typeof f.purpose!=='string'||!f.purpose.trim()||f.purpose.length>500||!Array.isArray(f.dependencies)||f.dependencies.length>12)invalid();seen.add(path);return {path,purpose:f.purpose,dependencies:f.dependencies.map(pathOf)};});if((target==='wechat'?entry!=='app.json':!entry.endsWith('.html'))||!seen.has(entry)||files.some(f=>f.dependencies.some(d=>!seen.has(d))))invalid();if(target==='wechat'){if(['app.json','app.js','app.wxss','project.config.json'].some(p=>!seen.has(p)))invalid();const pages=files.filter(f=>f.path.endsWith('.wxml'));if(!pages.some(page=>['js','json','wxss'].every(ext=>seen.has(page.path.slice(0,-5)+'.'+ext))))invalid();}return {entry,files};}
export function validateCheckpoint(value,input,config){try{
 if(value?.schemaVersion!==1)invalid();const target=input.target??input.base?.target??'web',pathOf=target==='wechat'?nativePath:artifactPath,fingerprints=generationFingerprint(input,config);
 if(Object.entries(fingerprints).some(([k,v])=>value[k]!==v))invalid();const manifest=validateManifest(value.manifest,{target});
 if(!Array.isArray(value.files)||value.files.length>manifest.files.length)invalid();const paths=new Set();let bytes=0;
 const files=value.files.map(f=>{const path=pathOf(f.path);if(paths.has(path)||!manifest.files.some(x=>x.path===path)||typeof f.content!=='string'||Buffer.byteLength(f.content)>262144)invalid();paths.add(path);bytes+=Buffer.byteLength(f.content);validateGeneratedFile(f,target);return {path,content:f.content};});
 if(bytes>2097152)invalid();const plan=target==='wechat'?validateNativePlan(value.plan):validateArtifact({schemaVersion:1,...value.plan,entry:'index.html',files:[{path:'index.html',content:''}]});
 return {schemaVersion:1,...fingerprints,plan:{...(target==='wechat'?{schemaVersion:1,target,entry:'app.json'}:{}),name:plan.name,capabilities:plan.capabilities,forms:plan.forms??[],acceptance:plan.acceptance},manifest,files};
 }catch{invalid();}}

// This trusted program only constructs syntax objects. It never links, evaluates or
// resolves user imports; each module keeps its own scope. All scripts in a file
// share one bounded child, so an HTML file cannot multiply the timeout per tag.
const syntaxCheckProgram=`const fs=require('node:fs'),vm=require('node:vm');const scripts=JSON.parse(fs.readFileSync(0,'utf8'));for(const script of scripts){if(script.module)new vm.SourceTextModule(script.source);else new vm.Script(script.source);}`;
export function validateGeneratedFile(file,target='web'){
 const path=(target==='wechat'?nativePath:artifactPath)(file.path);if(typeof file.content!=='string'||Buffer.byteLength(file.content)>262144)invalid();
 let scripts=[];
 if(path.endsWith('.json')){try{JSON.parse(file.content);}catch{throw new HttpError(422,'nestdutio_artifact_invalid','JSON文件语法不完整');}}
 if(path.endsWith('.js'))scripts=[{source:file.content,module:true}];
 if(path.endsWith('.html'))scripts=[...file.content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].flatMap(m=>{
  const attrs=m[1];if(/\bsrc\s*=/i.test(attrs))return [];
  const match=/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs),type=(match?.[1]??match?.[2]??match?.[3]??'').trim().toLowerCase();
  if(type&&!['module','text/javascript','application/javascript','text/ecmascript','application/ecmascript'].includes(type))return [];
  return [{source:m[2],module:type==='module'}];
 });
 if(scripts.length){const checked=spawnSync(process.execPath,['--experimental-vm-modules','--no-warnings','-e',syntaxCheckProgram],{input:JSON.stringify(scripts),encoding:'utf8',timeout:5000,windowsHide:true,maxBuffer:65536});if(checked.status!==0)throw new HttpError(422,'nestdutio_artifact_invalid','脚本语法不完整');}
 return {path,content:file.content};
}
