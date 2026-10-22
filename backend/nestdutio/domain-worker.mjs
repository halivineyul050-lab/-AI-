// Install this reviewed file and domain-policy.mjs root-owned outside the application.
// The web process never executes this worker or supplies shell commands or file paths.
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';import {resolve,join} from 'node:path';
import {normalizeDomain,verifyDomainDns} from './domain-policy.mjs';
const directory='/etc/nginx/nestdutio-domains.d',acmeRoot='/var/lib/nikai-acme';
export const certificateName=domain=>'nkcustom-'+createHash('sha256').update(normalizeDomain(domain)).digest('hex').slice(0,24);
export function domainConfiguration(input,tls){const domain=normalizeDomain(input),cert=certificateName(domain);return `server {
 listen 80;
 server_name ${domain};
 location ^~ /.well-known/acme-challenge/ { root ${acmeRoot}; try_files $uri =404; }
 location / { ${tls?'return 301 https://$host$request_uri;':'return 404;'} }
}
${tls?`server {
 listen 443 ssl;
 server_name ${domain};
 ssl_certificate /etc/letsencrypt/live/${cert}/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/${cert}/privkey.pem;
 ssl_protocols TLSv1.2 TLSv1.3;
 location / { proxy_pass http://127.0.0.1:4186; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header Connection ""; proxy_http_version 1.1; proxy_hide_header Set-Cookie; }
}
`:''}`;}
function command(binary,args,timeout=30000){const result=spawnSync(binary,args,{cwd:'/',env:{PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8'},timeout,maxBuffer:1024*1024,encoding:'utf8',windowsHide:true});if(result.status!==0||result.error)throw Error('Infrastructure command failed');return result.stdout;}
function updateConfiguration(domain,content){mkdirSync(directory,{recursive:true,mode:0o755});const path=join(directory,certificateName(domain)+'.conf'),temp=path+'.tmp',previous=existsSync(path)?readFileSync(path):null;
 const replace=bytes=>{if(bytes===null){if(existsSync(path))unlinkSync(path);}else{writeFileSync(temp,bytes,{mode:0o640});renameSync(temp,path);}};
 try{replace(content);command('/usr/sbin/nginx',['-t']);command('/usr/bin/systemctl',['reload','nginx']);}catch(error){replace(previous);try{command('/usr/sbin/nginx',['-t']);command('/usr/bin/systemctl',['reload','nginx']);}catch{}throw error;}
}
async function provision(job){const domain=normalizeDomain(job.domain),cert=certificateName(domain),path=join(directory,cert+'.conf');mkdirSync(join(acmeRoot,'.well-known','acme-challenge'),{recursive:true,mode:0o755});
 if(!existsSync(path))updateConfiguration(domain,domainConfiguration(domain,false));
 command('/usr/bin/certbot',['certonly','--webroot','--webroot-path',acmeRoot,'--cert-name',cert,'-d',domain,'--non-interactive','--agree-tos','--no-eff-email','--register-unsafely-without-email','--keep-until-expiring'],180000);
 updateConfiguration(domain,domainConfiguration(domain,true));const expiry=command('/usr/bin/openssl',['x509','-enddate','-noout','-in','/etc/letsencrypt/live/'+cert+'/fullchain.pem']).trim().replace(/^notAfter=/,'');const time=Date.parse(expiry);if(!Number.isFinite(time))throw Error('Certificate expiry unavailable');return new Date(time).toISOString();
}
export async function runDomainWorker({api,verify=(domain,txt)=>verifyDomainDns(domain,txt,['47.93.245.219']),provision:issue=provision,remove=domain=>updateConfiguration(domain,null)}={}){
 const jobs=await api('/queue');if(!Array.isArray(jobs)||jobs.length>3)throw Error('Invalid work queue');let handled=0;
 for(const item of jobs){if(typeof item.id!=='string'||!/^[A-Za-z0-9-]{1,64}$/.test(item.id))continue;let job;
  try{job=await api('/'+item.id+'/begin',{});normalizeDomain(job.domain);
   if(job.action==='remove'){await remove(job.domain);await api('/'+item.id+'/complete',{success:true});handled++;continue;}
   if(job.action==='none'){await api('/'+item.id+'/complete',{success:true});handled++;continue;}
   if(job.action!=='provision'||typeof job.txtValue!=='string'||!await verify(job.domain,job.txtValue,job.addresses)){await api('/'+item.id+'/complete',{success:false,reason:'dns_failed'});continue;}
   const expiresAt=await issue(job);await api('/'+item.id+'/complete',{success:true,expiresAt});handled++;
  }catch{if(job)try{await api('/'+item.id+'/complete',{success:false,reason:'certificate_failed'});}catch{}}
 }return handled;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const key=process.env.NIKAI_NESTDUTIO_DOMAIN_WORKER_KEY;if(!/^[a-f0-9]{64}$/.test(key??'')){console.error('Domain worker authentication is not configured');process.exit(1);}
 const api=async(path,body)=>{const response=await fetch('http://127.0.0.1:4174/api/internal/v1/nestdutio/domains'+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{Connection:'close',Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(!response.ok)throw Error('Domain worker request failed');return (await response.json()).data;};
 console.log(JSON.stringify({handled:await runDomainWorker({api})}));
}
