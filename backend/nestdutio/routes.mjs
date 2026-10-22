import {createNativePreview} from './native-preview.mjs';
import {timingSafeEqual} from 'node:crypto';
import {HttpError,readJsonBody} from '../validation.mjs';import {createExport} from './export.mjs';
export async function handleNestdutio({request,response,user,pathname,service,sendData,rateLimit}){
 const internal='/api/internal/v1/nestdutio/domains';
 if(pathname.startsWith(internal+'/')){
  const expected=service.workerKey,actual=request.headers.authorization??'',remote=request.socket.remoteAddress;
  if(!/^[a-f0-9]{64}$/.test(expected??'')||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)||request.headers.origin||request.headers['x-forwarded-for']||request.headers['x-real-ip']||!/^Bearer [a-f0-9]{64}$/.test(actual)||!timingSafeEqual(Buffer.from(actual),Buffer.from('Bearer '+expected)))throw new HttpError(404,'not_found','接口不存在');
  response.setHeader('Cache-Control','no-store');const path=pathname.slice(internal.length),method=request.method;
  if(path==='/queue'&&method==='GET'){sendData(response,service.domains.pending());return true;}
  const match=path.match(/^\/([0-9a-f-]{36})\/(begin|complete)$/);if(match&&method==='POST'){const input=await readJsonBody(request,1024);const result=match[2]==='begin'?service.domains.begin(match[1]):await service.domains.complete(match[1],input);sendData(response,result);return true;}
  throw new HttpError(404,'not_found','接口不存在');
 }
 const prefix='/api/v1/nestdutio';if(!pathname.startsWith(prefix+'/'))return false;const path=pathname.slice(prefix.length),method=request.method;
 if(path==='/config'&&method==='GET'){sendData(response,service.publicConfig(),null,200,{'Cache-Control':'no-store'});return true;}
 if(!user)throw new HttpError(401,'auth_required','请先登录后创建作品');service.assertUser(user.id);rateLimit(`${user.id}:nestdutio-read`,180,60000);response.setHeader('Cache-Control','no-store, private');
 const input=()=>readJsonBody(request,24576);const send=(data,status=200)=>sendData(response,data,null,status);
 const params=new URL(request.url,'http://local').searchParams;
 if(path==='/library'&&method==='GET'){send(service.projects.browse(user.id,{q:params.get('q')??'',archived:params.get('archived')==='true',offset:Number(params.get('offset')??0)}));return true;}
 if(path==='/projects'){if(method==='GET'){send(service.projects.list(user.id));return true;}if(method==='POST'){rateLimit(`${user.id}:nestdutio-create`,10,60000);send(service.projects.create(user.id,await input()),201);return true;}}
 const resume=path.match(/^\/tasks\/([0-9a-f-]{36})\/resume$/);if(resume&&method==='POST'){rateLimit(`${user.id}:nestdutio-generate`,5,60000);send(service.jobs.resume(user.id,resume[1],await input()),202);return true;}
 const task=path.match(/^\/tasks\/([0-9a-f-]{36})$/);if(task&&method==='GET'){send(service.jobs.get(user.id,task[1]));return true;}
 const taskPreview=path.match(/^\/tasks\/([0-9a-f-]{36})\/preview$/);
 if(taskPreview&&method==='POST'){rateLimit(`${user.id}:nestdutio-preview`,60,60000);send(await service.taskPreview(user.id,taskPreview[1]));return true;}
 const match=path.match(/^\/projects\/([0-9a-f-]{36})(?:\/(.*))?$/);if(match){const id=match[1],tail=match[2]??'',project=service.projects.get(user.id,id);
  if(tail==='wechat'){if(method==='GET'){send(service.wechat.get(user.id,id));return true;}if(method==='PUT'){rateLimit(`${user.id}:nestdutio-wechat`,30,60000);send(service.wechat.update(user.id,id,await input()));return true;}}
  if(tail==='wechat/handoff'&&method==='POST'){rateLimit(`${user.id}:nestdutio-wechat`,30,60000);const data=await input();send(service.wechat.handoff(user.id,id,data.versionId));return true;}
  if(project.target==='wechat'&&(/^(?:publication|publish|unpublish|rollback|domains|records)(?:\/|$)/.test(tail)))throw new HttpError(422,'nestdutio_target_mismatch','微信原生工程请通过微信开发者工具预览和发布');
  if(['publication','publish','unpublish','rollback'].includes(tail)){
   if(!service.publications)throw new HttpError(503,'nestdutio_hosting_unavailable','托管服务尚未配置');
   if(tail==='publication'&&method==='GET'){send(service.publications.get(user.id,id));return true;}
   if(method==='POST'){rateLimit(`${user.id}:nestdutio-publish`,12,60000);await service.startHosting();if(tail==='publish'){const data=await input();send(await service.publications.publish(user.id,id,data.versionId,data.slug));return true;}if(tail==='unpublish'){send(service.publications.unpublish(user.id,id));return true;}if(tail==='rollback'){send(await service.publications.rollback(user.id,id));return true;}}
  }
  if(tail==='domains'){if(method==='GET'){send(service.domains.list(user.id,id));return true;}if(method==='POST'){rateLimit(`${user.id}:nestdutio-domain-claim`,6,3600000);send(service.domains.claim(user.id,id,await input()),201);return true;}}
  const domain=tail.match(/^domains\/([0-9a-f-]{36})\/(verify|remove)$/);if(domain&&method==='POST'){rateLimit(`${user.id}:nestdutio-domain-check`,12,60000);await input();send(domain[2]==='verify'?await service.domains.verify(user.id,id,domain[1]):service.domains.remove(user.id,id,domain[1]));return true;}
  if(tail==='records'&&method==='GET'){const params=new URL(request.url,'http://local').searchParams;send(service.forms.list(user.id,id,{offset:Number(params.get('offset')??0),limit:50}));return true;}
  if(tail==='records/export'&&method==='GET'){rateLimit(`${user.id}:nestdutio-record-export`,5,60000);const csv=service.forms.exportCsv(user.id,id);response.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="nestdutio-records.csv"','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'});response.end(csv);return true;}
  if(tail==='history'&&method==='GET'){const history=service.projects.history(user.id,id,{before:params.get('before')});history.items=history.items.map(task=>{const exposed=service.jobs.get(user.id,task.id);return {...task,projectId:id,baseVersion:exposed.baseVersion,generation:exposed.generation,usage:exposed.usage,billing:exposed.billing,charge:exposed.charge};});send(history);return true;}
  if(!tail&&method==='PATCH'){rateLimit(`${user.id}:nestdutio-manage`,30,60000);send(service.projects.update(user.id,id,await input()));return true;}
  if(!tail&&method==='GET'){send(service.projects.get(user.id,id));return true;}
  if(tail==='versions'&&method==='GET'){send(service.projects.versions(user.id,id));return true;}
  if(tail==='tasks'&&method==='POST'){rateLimit(`${user.id}:nestdutio-generate`,5,60000);const data=await input();send(service.jobs.submit(user.id,id,data,data.requestKey),202);return true;}
  if(tail==='restore'&&method==='POST'){const data=await input();send(service.projects.restore(user.id,id,data.versionId),201);return true;}
  const version=tail.match(/^versions\/([0-9a-f-]{36})(?:\/(preview|export))?$/);if(version){const v=service.projects.getVersion(user.id,id,version[1]);if(!version[2]&&method==='GET'){send(v);return true;}if(version[2]==='preview'&&method==='POST'){rateLimit(`${user.id}:nestdutio-preview`,20,60000);send((await service.preview()).put(project.target==='wechat'?createNativePreview(v.artifact):v.artifact,{project:id}));return true;}if(version[2]==='export'&&method==='GET'){rateLimit(`${user.id}:nestdutio-export`,10,60000);const zip=createExport(v.artifact,{versionId:v.id,...(project.target==='wechat'?{nativeAppId:service.wechat.get(user.id,id).settings.appId.toLowerCase()}:{} )});response.writeHead(200,{'Content-Type':'application/zip','Content-Length':zip.buffer.length,'Content-Disposition':`attachment; filename="${zip.filename}"`,'X-Content-SHA256':zip.sha256});response.end(zip.buffer);return true;}}
 }
 throw new HttpError(404,'nestdutio_route_not_found','接口不存在');
}
