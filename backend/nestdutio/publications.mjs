import {createPreviewForms,createFormLimiter,handleFormRuntime,injectFormRuntime} from './form-runtime.mjs';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {HttpError} from '../validation.mjs';
import {safeFetch} from '../safe-upstream.mjs';

const fail=(status,code,message)=>{throw new HttpError(status,code,message);};
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',json:'application/json',svg:'image/svg+xml',txt:'text/plain; charset=utf-8'};
export function createPublications(db,projects,{originTemplate,health,resolveDomain=()=>null}={}){
 if(typeof originTemplate!=='string'||originTemplate.split('{slug}').length!==2)throw Error('Invalid publication origin');
 const sample=new URL(originTemplate.replace('{slug}','sample'));
 if(sample.username||sample.password||sample.pathname!=='/'||sample.search||sample.hash||!(sample.protocol==='https:'||sample.protocol==='http:'&&sample.hostname.endsWith('.localhost'))||!sample.hostname.startsWith('sample.'))throw Error('Invalid publication origin');
 const origin=slug=>new URL(originTemplate.replace('{slug}',slug)).origin;
 const row=id=>db.prepare('SELECT * FROM nestdutio_publications WHERE project_id=?').get(id);
 const now=()=>new Date().toISOString(),operations=new Set();
 const tx=fn=>{db.exec(db.backend==='mariadb'?'START TRANSACTION':'BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 const expose=r=>r?{state:r.state,slug:r.slug,url:origin(r.slug),liveVersion:r.live_version,previousVersion:r.previous_version,updatedAt:r.updated_at}:{state:'offline',url:null,liveVersion:null,previousVersion:null};
 tx(()=>{for(const r of db.prepare("SELECT * FROM nestdutio_publications WHERE state='checking'").all()){
  const live=r.live_version===r.candidate_version?r.previous_version:r.live_version;
  db.prepare("UPDATE nestdutio_publications SET state='failed',live_version=?,candidate_version=NULL,candidate_token='' WHERE project_id=?").run(live,r.project_id);
  db.prepare('UPDATE nestdutio_projects SET published_version=? WHERE id=?').run(live,r.project_id);
 }});
 async function check(url,version){
  if(health){if(await health(url,version)!==version)throw Error('Version mismatch');return;}
  const r=await safeFetch(url,{signal:AbortSignal.timeout(8000),headers:{'Cache-Control':'no-cache'}});
  const valid=r.ok&&r.headers.get('X-Nestdutio-Version')===version;await r.body?.cancel();if(!valid)throw Error('Publication health failed');
 }
 async function publish(user,id,versionId,slug){
  projects.get(user,id);const version=projects.getVersion(user,id,versionId);
  if(typeof slug!=='string'||!/^[a-z][a-z0-9-]{2,40}$/.test(slug)||['admin','api','www','mail','preview','support','login'].includes(slug))fail(422,'nestdutio_slug_invalid','地址须为3至41位小写字母、数字或连字符，并以字母开头');
  const token=randomUUID();let old;
  tx(()=>{old=row(id);if(old?.state==='checking')fail(409,'nestdutio_publishing','作品正在发布');
   if(old&&old.slug!==slug&&(old.live_version||old.previous_version))fail(409,'nestdutio_slug_fixed','请使用作品已保留的地址');
   const collision=db.prepare('SELECT project_id FROM nestdutio_publications WHERE slug=?').get(slug);
   if(collision&&collision.project_id!==id)fail(409,'nestdutio_slug_taken','这个地址已被使用');
   if(!old)db.prepare('INSERT INTO nestdutio_publications(project_id,slug,state,updated_at) VALUES(?,?,?,?)').run(id,slug,'offline',now());
   db.prepare("UPDATE nestdutio_publications SET state='checking',slug=?,candidate_version=?,candidate_token=?,updated_at=? WHERE project_id=?").run(slug,versionId,token,now(),id);
  });
  const operation=(async()=>{try{
   await check(origin(slug)+'/_candidate/'+token+'/'+version.artifact.entry,versionId);
   tx(()=>{const r=db.prepare("UPDATE nestdutio_publications SET live_version=?,previous_version=?,updated_at=? WHERE project_id=? AND candidate_token=? AND state='checking'").run(versionId,old?.live_version??null,now(),id,token);
    if(!Number(r.changes))throw Error('Publication changed');db.prepare('UPDATE nestdutio_projects SET published_version=? WHERE id=?').run(versionId,id);
   });
   await check(origin(slug)+'/',versionId);
   db.prepare("UPDATE nestdutio_publications SET state='live',candidate_version=NULL,candidate_token='',updated_at=? WHERE project_id=? AND candidate_token=?").run(now(),id,token);return expose(row(id));
  }catch{tx(()=>{const r=db.prepare("UPDATE nestdutio_publications SET state='failed',live_version=?,previous_version=?,candidate_version=NULL,candidate_token='',updated_at=? WHERE project_id=? AND candidate_token=?").run(old?.live_version??null,old?.previous_version??null,now(),id,token);if(Number(r.changes))db.prepare('UPDATE nestdutio_projects SET published_version=? WHERE id=?').run(old?.live_version??null,id);});fail(502,'nestdutio_publish_failed','访问检查未通过，已保留原线上版本');}})();
  operations.add(operation);try{return await operation;}finally{operations.delete(operation);}
 }
 function context(host,path){
  if(typeof host!=='string'||typeof path!=='string'||path.includes('..')||path.includes('\\')||path.includes('%'))return null;
  const alias=resolveDomain(host),suffix=sample.host.slice(6);let slug,r,address;
  if(alias){r=db.prepare('SELECT * FROM nestdutio_publications WHERE project_id=?').get(alias);address='https://'+host;}
  else{if(!host.endsWith(suffix))return null;slug=host.slice(0,-suffix.length);if(!/^[a-z][a-z0-9-]{2,40}$/.test(slug)||origin(slug)!==sample.protocol+'//'+host)return null;r=db.prepare('SELECT * FROM nestdutio_publications WHERE slug=?').get(slug);address=origin(slug);}
  if(!r)return null;
  const candidate=path.match(/^\/_candidate\/([a-f0-9-]{36})\/(.+)$/);let versionId,filePath;
  if(candidate){if(r.state!=='checking'||r.candidate_token!==candidate[1])return null;versionId=r.candidate_version;filePath=candidate[2];}
  else{if(r.state==='offline'||!r.live_version)return null;versionId=r.live_version;filePath=path==='/'?null:path.slice(1);}
  const v=db.prepare('SELECT artifact FROM nestdutio_versions WHERE id=? AND project_id=?').get(versionId,r.project_id);if(!v)return null;
  const artifact=JSON.parse(v.artifact);return {artifact,projectId:r.project_id,versionId,path:filePath??artifact.entry,candidate:!!candidate,basePath:candidate?'/_candidate/'+candidate[1]+'/_nestdutio':'/_nestdutio',origin:address};
 }
 function asset(host,path){const c=context(host,path);if(!c)return null;const file=c.artifact.files.find(f=>f.path===c.path);return file?{...file,versionId:c.versionId}:null;}
 return {publish,asset,context,get(user,id){projects.get(user,id);return expose(row(id));},async rollback(user,id){projects.get(user,id);const r=row(id);if(!r?.previous_version)fail(409,'nestdutio_rollback_missing','没有可回滚版本');return publish(user,id,r.previous_version,r.slug);},unpublish(user,id){projects.get(user,id);if(row(id)?.state==='checking')fail(409,'nestdutio_publishing','请等待发布完成');tx(()=>{db.prepare("UPDATE nestdutio_publications SET state='offline',previous_version=live_version,live_version=NULL,updated_at=? WHERE project_id=?").run(now(),id);db.prepare('UPDATE nestdutio_projects SET published_version=NULL WHERE id=?').run(id);});return expose(row(id));},async shutdown(){await Promise.allSettled([...operations]);}};
}
export async function startPublicationServer(publications,{port=0,host='127.0.0.1',forms}={}){
 const limiter=createFormLimiter(),candidates=new Map();
 const server=createServer(async(req,res)=>{let asset,context;try{const path=new URL(req.url,'http://publication.invalid').pathname;context=publications.context(req.headers.host,path);asset=['GET','HEAD'].includes(req.method)&&publications.asset(req.headers.host,path);}catch{}
  if(context){let preview;if(context.candidate){if(!candidates.has(context.basePath)){if(candidates.size>=20)candidates.delete(candidates.keys().next().value);candidates.set(context.basePath,createPreviewForms());}preview=candidates.get(context.basePath);}
   if(await handleFormRuntime(req,res,{artifact:context.artifact,origin:context.origin,basePath:context.basePath,limit:ip=>limiter(context.projectId+':'+ip),submit:(schema,input)=>preview?preview.submit(schema,input):forms?forms.submit(context.projectId,context.versionId,schema.id,input):Promise.reject(Error('Form storage unavailable'))}))return;
  }
  if(!asset){res.writeHead(404,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end();return;}
  res.writeHead(200,{'Content-Type':types[asset.path.split('.').at(-1)],'Cache-Control':'no-store','X-Nestdutio-Version':asset.versionId,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Opener-Policy':'same-origin','Origin-Agent-Cluster':'?1','Permissions-Policy':'camera=(),microphone=(),geolocation=(),payment=()',"Content-Security-Policy":"sandbox allow-scripts allow-same-origin allow-forms; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?'':asset.path.endsWith('.html')?injectFormRuntime(asset.content,context.artifact,context.basePath):asset.content);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 return {port:server.address().port,async close(){await publications.shutdown();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
