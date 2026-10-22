import {readProgress} from './progress.mjs';
import {escapeLikePattern} from '../like-pattern.mjs';
import {randomUUID} from 'node:crypto';import {HttpError} from '../validation.mjs';import {validateArtifact} from './artifact.mjs';
export function createProjects(db){
 // Standalone legacy fixtures may load only migration 033; production always migrates before service construction.
 const metadataEnabled=db.backend==='mariadb'||!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nestdutio_project_meta'").get();
 const targetsEnabled=db.backend==='mariadb'||!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nestdutio_project_targets'").get();
 const target=id=>targetsEnabled?db.prepare('SELECT target FROM nestdutio_project_targets WHERE project_id=?').get(id)?.target??'web':'web';
 const now=()=>new Date().toISOString();const fail=(status,code,message)=>{throw new HttpError(status,code,message);};
 const expose=r=>({id:r.id,target:target(r.id),name:r.name,draftVersion:r.draft_version,publishedVersion:r.published_version,createdAt:r.created_at,updatedAt:r.updated_at});
 function get(user,id){const r=db.prepare('SELECT * FROM nestdutio_projects WHERE id=? AND user_id=?').get(id,user);if(!r)fail(404,'nestdutio_not_found','作品不存在');return expose(r);}
 function getVersion(user,id,version){get(user,id);const r=db.prepare('SELECT * FROM nestdutio_versions WHERE project_id=? AND id=?').get(id,version);if(!r)fail(404,'nestdutio_version_not_found','版本不存在');return {id:r.id,createdAt:r.created_at,artifact:JSON.parse(r.artifact)};}
 function saveVersion(user,id,input,baseVersion,{transaction=true}={}){const p=get(user,id);if((input?.target??'web')!==p.target)fail(422,'nestdutio_target_mismatch','项目目标与作品类型不一致');const a=validateArtifact(input);if(transaction)db.exec(db.backend==='mariadb'?'START TRANSACTION':'BEGIN IMMEDIATE');try{const version=randomUUID(),time=now();const changed=db.prepare('UPDATE nestdutio_projects SET draft_version=?,name=?,updated_at=? WHERE id=? AND user_id=? AND '+(baseVersion===null?'draft_version IS NULL':'draft_version=?')).run(version,metadataEnabled&&db.prepare('SELECT custom_name FROM nestdutio_project_meta WHERE project_id=?').get(id)?.custom_name?get(user,id).name:a.name,time,id,user,...(baseVersion===null?[]:[baseVersion]));if(!Number(changed.changes))fail(409,'nestdutio_version_conflict','作品已更新，请载入最新版本');db.prepare('INSERT INTO nestdutio_versions(id,project_id,artifact,created_at) VALUES(?,?,?,?)').run(version,id,JSON.stringify(a),time);if(transaction)db.exec('COMMIT');return {id:version,createdAt:time,artifact:a};}catch(error){if(transaction)db.exec('ROLLBACK');throw error;}}
 function pageNumber(value,fallback,max){value=value??fallback;if(!Number.isSafeInteger(value)||value<0||value>max)fail(422,'nestdutio_page_invalid','分页参数无效');return value;}
 function browse(user,{q='',offset=0,limit=30,archived=false}={}){
  offset=pageNumber(offset,0,1000000);limit=pageNumber(limit,30,50);if(!limit||typeof q!=='string'||q.length>80||typeof archived!=='boolean')fail(422,'nestdutio_page_invalid','搜索参数无效');
  const rows=db.prepare("SELECT p.* FROM nestdutio_projects p LEFT JOIN nestdutio_project_meta m ON m.project_id=p.id WHERE p.user_id=? AND COALESCE(m.archived,0)=? AND p.name LIKE ? ESCAPE '!' ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?").all(user,archived?1:0,'%'+escapeLikePattern(q.trim())+'%',limit+1,offset);
  return {items:rows.slice(0,limit).map(r=>({...expose(r),archived})),nextOffset:rows.length>limit?offset+limit:null};
 }
 function update(user,id,input){get(user,id);if(!input||typeof input!=='object'||Array.isArray(input)||!Object.keys(input).length||Object.keys(input).some(k=>!['name','archived'].includes(k)))fail(422,'nestdutio_project_invalid','项目设置无效');
  if(Object.hasOwn(input,'name')&&(typeof input.name!=='string'||!input.name.trim()||input.name.length>80))fail(422,'nestdutio_name_invalid','作品名称需为1至80字');
  if(Object.hasOwn(input,'archived')&&typeof input.archived!=='boolean')fail(422,'nestdutio_project_invalid','归档设置无效');
  if(input.name!==undefined){db.prepare('INSERT OR IGNORE INTO nestdutio_project_meta(project_id,archived,custom_name) VALUES(?,0,0)').run(id);db.prepare('UPDATE nestdutio_project_meta SET custom_name=1 WHERE project_id=?').run(id);db.prepare('UPDATE nestdutio_projects SET name=?,updated_at=? WHERE id=? AND user_id=?').run(input.name.trim(),now(),id,user);}
  if(input.archived!==undefined){db.prepare('INSERT OR IGNORE INTO nestdutio_project_meta(project_id,archived) VALUES(?,0)').run(id);db.prepare('UPDATE nestdutio_project_meta SET archived=? WHERE project_id=?').run(input.archived?1:0,id);}
  return get(user,id);
 }
 function history(user,id,{before=null,limit=30}={}){get(user,id);limit=pageNumber(limit,30,50);if(!limit)fail(422,'nestdutio_page_invalid','分页参数无效');let cursor=null;
  if(before){try{cursor=JSON.parse(Buffer.from(before,'base64url').toString('utf8'));if(!Array.isArray(cursor)||cursor.length!==2||!cursor.every(x=>typeof x==='string'&&x.length<=80)||!/^\d{4}-\d{2}-\d{2}T/.test(cursor[0]))throw Error();}catch{fail(422,'nestdutio_page_invalid','历史游标无效');}}
  const rows=db.prepare('SELECT * FROM nestdutio_tasks WHERE project_id=? AND user_id=?'+(cursor?' AND (created_at<? OR (created_at=? AND id<?))':'')+' ORDER BY created_at DESC,id DESC LIMIT ?').all(id,user,...(cursor?[cursor[0],cursor[0],cursor[1]]:[]),limit+1),chosen=rows.slice(0,limit),last=chosen.at(-1);
  const active=db.prepare("SELECT id FROM nestdutio_tasks WHERE project_id=? AND user_id=? AND state NOT IN ('ready','failed') ORDER BY created_at DESC,id DESC LIMIT 1").get(id,user);
  return {items:chosen.reverse().map(r=>({id:r.id,prompt:r.prompt,state:r.state,progress:readProgress(r.progress_json),versionId:r.version_id,errorCode:r.error_code,createdAt:r.created_at,updatedAt:r.updated_at})),before:rows.length>limit?Buffer.from(JSON.stringify([last.created_at,last.id])).toString('base64url'):null,activeTaskId:active?.id??null};
 }
 return {get,getVersion,saveVersion,browse,update,history,
  create(user,input){const requested=input?.target??'web';if(!['web','wechat'].includes(requested)||requested==='wechat'&&!targetsEnabled)fail(422,'nestdutio_target_invalid','生成目标无效或尚未启用');const name=input?.name??'未命名作品';if(typeof name!=='string'||!name.trim()||name.length>80)fail(422,'nestdutio_name_invalid','作品名称需为1至80字');const id=randomUUID(),time=now();db.prepare('INSERT INTO nestdutio_projects(id,user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,user,name.trim(),time,time);if(requested==='wechat')db.prepare('INSERT INTO nestdutio_project_targets(project_id,target) VALUES(?,?)').run(id,requested);return get(user,id);},
  list(user){return db.prepare('SELECT * FROM nestdutio_projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').all(user).map(expose);},
  versions(user,id){get(user,id);return db.prepare('SELECT id,created_at FROM nestdutio_versions WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 100').all(id).map(r=>({id:r.id,createdAt:r.created_at}));},
  restore(user,id,version){const p=get(user,id),v=getVersion(user,id,version);return saveVersion(user,id,v.artifact,p.draftVersion);}
 };
}
