// Fixed exported runtime. Generated source is served as data and never imported by Node.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {createForms} from './runtime/forms.mjs';
import {createFormLimiter,handleFormRuntime,injectFormRuntime} from './runtime/form-runtime.mjs';

const here=new URL('./',import.meta.url),data=new URL('./data/',here),authPath=new URL('owner.json',data);
mkdirSync(data,{recursive:true,mode:0o700});
if(process.argv.includes('--init-admin')){
 if(existsSync(authPath)){console.error('作者认证已初始化；请保管原密码。');process.exit(1);}
 const prompt=createInterface({input:process.stdin,output:process.stdout});const password=await prompt.question('设置作者密码（12至128字符）：');prompt.close();
 if(password.length<12||password.length>128){console.error('密码长度不符合要求');process.exit(1);}
 const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,32).toString('hex');writeFileSync(authPath,JSON.stringify({salt,digest}),{mode:0o600,flag:'wx'});console.log('作者认证已初始化；用户名 owner。');process.exit(0);
}
if(!existsSync(authPath)){console.error('请先运行 node server.mjs --init-admin 设置作者密码');process.exit(1);}
const saved=JSON.parse(readFileSync(authPath,'utf8')),artifact=JSON.parse(readFileSync(new URL('./artifact.json',here),'utf8'));
const db=new DatabaseSync(fileURLToPath(new URL('app.db',data)));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
db.exec('CREATE TABLE IF NOT EXISTS nestdutio_projects(id TEXT PRIMARY KEY);CREATE TABLE IF NOT EXISTS nestdutio_versions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,artifact TEXT NOT NULL);');
db.exec(readFileSync(new URL('./runtime/schema.sql',here),'utf8').replace(/CREATE TABLE /g,'CREATE TABLE IF NOT EXISTS ').replace(/CREATE INDEX /g,'CREATE INDEX IF NOT EXISTS '));
db.prepare('INSERT OR IGNORE INTO nestdutio_projects(id) VALUES(?)').run('export');db.prepare('INSERT OR IGNORE INTO nestdutio_versions(id,project_id,artifact) VALUES(?,?,?)').run('version','export',JSON.stringify(artifact));
const forms=createForms(db,{get(user,id){if(user!=='owner'||id!=='export')throw Error('Invalid owner');}}),limit=createFormLimiter(),adminLimit=createFormLimiter({max:20});
const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',json:'application/json',txt:'text/plain; charset=utf-8'};
let publicOrigin,adminOrigin;
const publicServer=createServer((req,res)=>{void (async()=>{
 if(req.headers.host!==new URL(publicOrigin).host){res.writeHead(404);res.end();return;}
 if(await handleFormRuntime(req,res,{artifact,origin:publicOrigin,basePath:'/_nestdutio',submit:(schema,input)=>forms.submit('export','version',schema.id,input),limit:ip=>limit(ip)}))return;
 const path=new URL(req.url,publicOrigin).pathname,file=artifact.files.find(f=>f.path===(path==='/'?artifact.entry:path.slice(1)));
 if(!['GET','HEAD'].includes(req.method)||!file){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':mime[file.path.split('.').at(-1)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',"Content-Security-Policy":"sandbox allow-scripts allow-same-origin allow-forms; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?'':file.path.endsWith('.html')?injectFormRuntime(file.content,artifact,'/_nestdutio'):file.content);
})().catch(()=>{if(!res.headersSent){res.writeHead(500);res.end('Request failed');}else res.destroy();});});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const adminServer=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");res.setHeader('X-Frame-Options','DENY');
 if(req.headers.host!==new URL(adminOrigin).host||req.headers.origin&&req.headers.origin!==adminOrigin){res.writeHead(403);res.end();return;}
 let valid=false;try{const header=req.headers.authorization??'';if(header.length<1024&&header.startsWith('Basic ')){const value=Buffer.from(header.slice(6),'base64').toString(),i=value.indexOf(':');if(value.slice(0,i)==='owner'){const digest=scryptSync(value.slice(i+1),saved.salt,32);valid=timingSafeEqual(digest,Buffer.from(saved.digest,'hex'));}}}catch{}
 if(!valid){try{adminLimit(req.socket.remoteAddress??'');}catch{res.writeHead(429);res.end();return;}res.writeHead(401,{'WWW-Authenticate':'Basic realm="NeStudio Author", charset="UTF-8"'});res.end('Author authentication required');return;}
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 let url;try{url=new URL(req.url,adminOrigin);}catch{res.writeHead(400);res.end();return;}if(url.pathname==='/records.csv'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="records.csv"'});res.end(forms.exportCsv('owner','export'));return;}
 let records;try{records=forms.list('owner','export',{offset:Number(url.searchParams.get('offset')??0),limit:50});}catch{res.writeHead(422);res.end();return;}
 if(url.pathname==='/records'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(records));return;}
 if(url.pathname!=='/'){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>作者数据</title><style>body{max-width:900px;margin:40px auto;padding:16px;font:16px/1.7 system-ui}pre{white-space:pre-wrap;background:#f5f5fa;padding:16px;border-radius:12px}</style><h1>'+escape(artifact.name)+' · 作者数据</h1><p>共 '+records.total+' 条；<a href="/records.csv">下载 CSV</a></p>'+records.items.map(r=>'<section><h2>'+escape(r.schema.title)+'</h2><p>'+escape(r.createdAt)+'</p><pre>'+escape(JSON.stringify(r.values,null,2))+'</pre></section>').join('')+(records.nextOffset===null?'':'<a href="/?offset='+records.nextOffset+'">下一页</a>'));
});
await new Promise((resolve,reject)=>{publicServer.once('error',reject);publicServer.listen(Number(process.env.PORT??8080),process.env.HOST??'127.0.0.1',resolve);});publicOrigin=process.env.PUBLIC_ORIGIN??'http://127.0.0.1:'+publicServer.address().port;
await new Promise((resolve,reject)=>{adminServer.once('error',reject);adminServer.listen(Number(process.env.ADMIN_PORT??8081),'127.0.0.1',resolve);});adminOrigin='http://127.0.0.1:'+adminServer.address().port;
console.log(JSON.stringify({publicUrl:publicOrigin,adminUrl:adminOrigin}));
const stop=()=>{publicServer.closeAllConnections();adminServer.closeAllConnections();publicServer.close();adminServer.close();db.close();process.exit(0);};process.once('SIGTERM',stop);process.once('SIGINT',stop);
