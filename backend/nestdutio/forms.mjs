import {randomUUID,createHash} from 'node:crypto';
import {HttpError} from '../validation.mjs';
import {validateForms,validateSubmission} from './form-schema.mjs';
const fail=(status,code,message)=>{throw new HttpError(status,code,message);};
const csv=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
export function createForms(db,projects,{maxRecords=10000,maxDaily=1000}={}){
 const tx=fn=>{db.exec(db.backend==='mariadb'?'START TRANSACTION':'BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 const decode=r=>({id:r.id,versionId:r.version_id,formId:r.form_id,schema:JSON.parse(r.schema_json),values:JSON.parse(r.values_json),createdAt:r.created_at});
 function submit(projectId,versionId,formId,input){
  const row=db.prepare('SELECT artifact FROM nestdutio_versions WHERE id=? AND project_id=?').get(versionId,projectId);if(!row)fail(404,'nestdutio_form_not_found','表单不存在');
  const artifact=JSON.parse(row.artifact),schema=validateForms(artifact.forms??[]).find(f=>f.id===formId);if(!artifact.capabilities.includes('forms')||!schema)fail(404,'nestdutio_form_not_found','表单不存在');
  if(!input||typeof input.requestKey!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestKey))fail(422,'nestdutio_form_request_invalid','提交标识无效');
  const values=validateSubmission(schema,input.values),encoded=JSON.stringify(values),hash=createHash('sha256').update(encoded).digest('hex');
  return tx(()=>{if(db.backend==='mariadb')db.prepare('SELECT id FROM nestdutio_projects WHERE id=? FOR UPDATE').get(projectId);const existing=db.prepare('SELECT id,body_hash FROM nestdutio_form_records WHERE project_id=? AND form_id=? AND request_key=?').get(projectId,formId,input.requestKey);if(existing){if(existing.body_hash!==hash)fail(409,'nestdutio_form_request_conflict','同一标识不能提交不同内容');return {id:existing.id,duplicate:true};}
   // Serialize quota and insert across application processes, including independent domains.
   const count=Number(db.prepare('SELECT COUNT(*) AS n FROM nestdutio_form_records WHERE project_id=?').get(projectId).n),day=new Date().toISOString().slice(0,10)+'T00:00:00.000Z';
   if(count>=maxRecords||Number(db.prepare('SELECT COUNT(*) AS n FROM nestdutio_form_records WHERE project_id=? AND created_at>=?').get(projectId,day).n)>=maxDaily)fail(429,'nestdutio_form_quota','当前表单收集额度已满，请联系作者');
   const id=randomUUID();db.prepare('INSERT INTO nestdutio_form_records(id,project_id,version_id,form_id,request_key,body_hash,schema_json,values_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,projectId,versionId,formId,input.requestKey,hash,JSON.stringify(schema),encoded,new Date().toISOString());return {id,duplicate:false};
  });
 }
 function list(user,projectId,{offset=0,limit=50}={}){projects.get(user,projectId);if(!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isSafeInteger(limit)||limit<1||limit>100)fail(422,'nestdutio_records_page_invalid','分页参数无效');const total=Number(db.prepare('SELECT COUNT(*) AS n FROM nestdutio_form_records WHERE project_id=?').get(projectId).n);const rows=db.prepare('SELECT * FROM nestdutio_form_records WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').all(projectId,limit,offset);return {items:rows.map(decode),total,nextOffset:offset+rows.length<total?offset+rows.length:null};}
 function exportCsv(user,projectId){projects.get(user,projectId);const rows=db.prepare('SELECT * FROM nestdutio_form_records WHERE project_id=? ORDER BY created_at,id LIMIT 10000').all(projectId).map(decode),fields=[...new Set(rows.flatMap(r=>r.schema.fields.map(f=>f.name)))];return '\ufeff'+[['记录编号','提交时间','表单',...fields],...rows.map(r=>[r.id,r.createdAt,r.schema.title,...fields.map(f=>r.values[f]??'')])].map(row=>row.map(csv).join(',')).join('\r\n');}
 return {submit,list,exportCsv};
}
