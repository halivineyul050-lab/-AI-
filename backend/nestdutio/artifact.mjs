import {validateForms} from './form-schema.mjs';
import {validateNativeArtifact} from './native-artifact.mjs';
import {HttpError} from '../validation.mjs';
const fail=(path)=>{throw new HttpError(422,'nestdutio_artifact_invalid','作品结构不符合运行要求：'+path);};
const text=(x,n,path)=>{if(typeof x!=='string'||!x.trim()||x.length>n)fail(path);return x;};
export function artifactPath(path){if(typeof path!=='string'||path.length>160||!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:html|css|js|json|svg|txt)$/.test(path)||path.split('/').some(p=>['node_modules','data','imports'].includes(p)))fail('files.path');return path;}
export function validateArtifact(input){
 if(input?.target==='wechat')return validateNativeArtifact(input);
 if(input?.target!==undefined&&input.target!=='web')fail('target');
 if(!input||input.schemaVersion!==1)fail('schemaVersion');const name=text(input.name,80,'name'),entry=artifactPath(input.entry);if(!entry.endsWith('.html'))fail('entry');
 if(!Array.isArray(input.files)||!input.files.length||input.files.length>30)fail('files');let bytes=0;const paths=new Set();
 const files=input.files.map(f=>{if(!f)fail('files');const path=artifactPath(f.path);if(paths.has(path))fail('files.duplicate');paths.add(path);if(typeof f.content!=='string')fail('files.content');const size=Buffer.byteLength(f.content);bytes+=size;if(size>262144||bytes>2097152)fail('files.size');return {path,content:f.content};});if(!paths.has(entry))fail('entry');
 if(!Array.isArray(input.capabilities)||input.capabilities.some(x=>!['localStorage','forms'].includes(x)))fail('capabilities');
 const forms=validateForms(input.forms??[]);if(input.capabilities.includes('forms')!==!!forms.length)fail('forms');
 if(!Array.isArray(input.acceptance)||!input.acceptance.length||input.acceptance.length>48)fail('acceptance');
 const acceptance=input.acceptance.map(a=>{if(!a||!['visible','clickText','fillText','fill','submitForm'].includes(a.kind))fail('acceptance.kind');const out={kind:a.kind,target:text(a.target,160,'acceptance.target')};if(!['visible','fill'].includes(a.kind)){out.output=text(a.output,160,'acceptance.output');out.value=text(a.value,200,'acceptance.value');}if(a.kind==='submitForm'){if(!forms.some(f=>f.id===a.formId))fail('acceptance.formId');out.formId=a.formId;}if(['fillText','fill'].includes(a.kind))out.input=text(a.input,200,'acceptance.input');return out;});
 if(forms.some(f=>!acceptance.some(a=>a.kind==='submitForm'&&a.formId===f.id)))fail('acceptance.forms');
 return {schemaVersion:1,name,entry,files,...(forms.length?{forms}:{}),capabilities:[...new Set(input.capabilities)],acceptance};
}
