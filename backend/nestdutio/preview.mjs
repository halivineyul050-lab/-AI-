import {createServer} from 'node:http';import {randomBytes,randomUUID} from 'node:crypto';
import {validateArtifact} from './artifact.mjs';
import {createPreviewForms,createFormLimiter,handleFormRuntime,injectFormRuntime} from './form-runtime.mjs';
const mime={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',json:'application/json',svg:'image/svg+xml',txt:'text/plain; charset=utf-8'};
export async function startPreviewServer({parentOrigin='http://127.0.0.1:4400',port=0,host='127.0.0.1',originTemplate=null,ttl=900000}={}){
 const parent=new URL(parentOrigin);if(parent.origin!==parentOrigin)throw Error('Invalid parent origin');const entries=new Map(),limiter=createFormLimiter({max:100});let base;
 const server=createServer(async(req,res)=>{
  const deny=()=>{res.writeHead(404,{'Cache-Control':'no-store'});res.end();};let url;try{url=new URL(req.url,'http://preview.invalid');}catch{return deny();}
  const match=url.pathname.match(/^\/([A-Za-z0-9_-]{32})\/(.+)$/),entry=match&&entries.get(match[1]);if(!entry||entry.expiresAt<=Date.now()||req.headers.host!==entry.host)return deny();
  const own=new URL(entry.url).origin,basePath='/'+match[1]+'/_nestdutio';
  if(await handleFormRuntime(req,res,{artifact:entry.artifact,origin:own,basePath,submit:(schema,input)=>entry.forms.submit(schema,input),limit:ip=>limiter(match[1]+':'+ip)}))return;
  if(!['GET','HEAD'].includes(req.method))return deny();const file=entry.artifact.files.find(f=>f.path===match[2]);if(!file)return deny();
  const connect=entry.artifact.capabilities.includes('forms')?own:"'none'";
  res.writeHead(200,{'Content-Type':mime[file.path.split('.').at(-1)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Origin-Agent-Cluster':'?1','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=()',
   'Content-Security-Policy':`sandbox allow-scripts allow-same-origin allow-forms; default-src 'none'; script-src 'unsafe-inline' ${own}; style-src 'unsafe-inline' ${own}; img-src ${own} data:; font-src ${own}; connect-src ${connect}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors ${parentOrigin}`});
  const content=file.path.endsWith('.html')?injectFormRuntime(file.content,entry.artifact,basePath):file.content;res.end(req.method==='HEAD'?'':content);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});base=originTemplate??`http://{project}.localhost:${server.address().port}`;
 const probe=new URL(base.replace('{project}','sample'));if(!base.includes('{project}')||probe.hostname===parent.hostname||!['http:','https:'].includes(probe.protocol)||probe.username||probe.password||probe.pathname!=='/'||probe.search||probe.hash){server.close();throw Error('Preview must use an isolated project origin');}
 if(!probe.hostname.endsWith('.localhost')&&probe.protocol!=='https:'){server.close();throw Error('Production preview requires HTTPS');}
 function put(input,{project=randomUUID(),expiresAt=Date.now()+ttl}={}){if(!/^[a-z0-9-]{1,64}$/.test(project)||!Number.isFinite(expiresAt)||expiresAt>Date.now()+ttl)throw Error('Invalid preview scope');for(const [key,e]of entries)if(e.expiresAt<=Date.now())entries.delete(key);if(entries.size>=100)throw Error('Preview capacity exceeded');const artifact=validateArtifact(input),id=randomBytes(24).toString('base64url'),origin=new URL(base.replace('{project}',project)),url=origin.origin+'/'+id+'/'+artifact.entry;entries.set(id,{artifact,expiresAt,host:origin.host,url,forms:createPreviewForms()});return {id,url,expiresAt};}
 return {put,count:(id,formId)=>entries.get(id)?.forms.count(formId)??0,revoke:id=>entries.delete(id),port:server.address().port,async close(){entries.clear();server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
