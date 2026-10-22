import {HttpError} from '../validation.mjs';
const fail=field=>{throw new HttpError(422,'nestdutio_form_invalid','请检查表单字段：'+field);};
const key=value=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,39}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
export function validateForms(input){
 if(!Array.isArray(input)||input.length>3)fail('forms');const ids=new Set();
 return input.map(form=>{
  if(!form||!key(form.id)||ids.has(form.id)||typeof form.title!=='string'||!form.title.trim()||form.title.length>80||!Array.isArray(form.fields)||!form.fields.length||form.fields.length>12)fail('schema');ids.add(form.id);const names=new Set();
  const fields=form.fields.map(f=>{
   if(!f||!key(f.name)||names.has(f.name)||typeof f.label!=='string'||!f.label.trim()||f.label.length>80||!['text','textarea','email','number','select'].includes(f.type)||typeof f.required!=='boolean')fail('schema.fields');names.add(f.name);
   const maxLength=f.maxLength??(f.type==='textarea'?2000:200);if(!Number.isSafeInteger(maxLength)||maxLength<1||maxLength>2000)fail('maxLength');
   const out={name:f.name,label:f.label.trim(),type:f.type,required:f.required,maxLength};
   if(f.type==='select'){if(!Array.isArray(f.options)||!f.options.length||f.options.length>20||f.options.some(o=>typeof o!=='string'||!o.trim()||o.length>100)||new Set(f.options).size!==f.options.length)fail('options');out.options=[...f.options];}
   return out;
  });return {id:form.id,title:form.title.trim(),fields};
 });
}
export function validateSubmission(input,values){
 const schema=validateForms([input])[0];if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(k=>!schema.fields.some(f=>f.name===k)))fail('values');const out={};
 for(const f of schema.fields){let value=values[f.name];if(value===undefined||value===null||value===''){if(f.required)fail(f.label);continue;}
  if(f.type==='number'){if(typeof value==='string'&&value.trim())value=Number(value);if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12)fail(f.label);out[f.name]=value;continue;}
  if(typeof value!=='string')fail(f.label);value=value.trim();if(value.length>f.maxLength||f.required&&!value||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail(f.label);
  if(f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail(f.label);if(f.type==='select'&&!f.options.includes(value))fail(f.label);out[f.name]=value;
 }if(Buffer.byteLength(JSON.stringify(out))>12000)fail('size');return out;
}
