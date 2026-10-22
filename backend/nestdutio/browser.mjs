import {chromium} from 'playwright-core';import {spawn} from 'node:child_process';import {mkdtemp,mkdir,copyFile,chmod,chown,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const environment=()=>Object.fromEntries(['PATH','LANG','SystemRoot','WINDIR','USERPROFILE','LOCALAPPDATA','TEMP','TMP','TMPDIR','LD_LIBRARY_PATH','FONTCONFIG_PATH'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
// Generated pages always run inside Chromium's sandbox and never inherit provider credentials.
export async function launchSandboxedBrowser(executablePath,timeout){
 const env=environment();
 if(process.platform!=='linux'||process.getuid?.()!==0)return {browser:await chromium.launch({executablePath,headless:true,chromiumSandbox:true,timeout,env}),cleanup:async()=>{}};
 // Production runs as nikai. The existing release preflight runs as root: launch only
 // the browser as nobody, rather than disabling its sandbox or changing release scripts.
 const directory=await mkdtemp(join(tmpdir(),'nestdutio-browser-')),binary=join(directory,'chromium'),profile=join(directory,'profile');let child;
 const cleanup=async()=>{if(child&&!child.killed){child.kill('SIGKILL');await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('exit',resolve);});}await rm(directory,{recursive:true,force:true});};
 try{await chmod(directory,0o755);await copyFile(executablePath,binary);await chmod(binary,0o755);await mkdir(profile,{mode:0o700});await chown(profile,65534,65534);
  const address=await new Promise((resolve,reject)=>{let text='',settled=false;const timer=setTimeout(()=>{settled=true;reject(Error('Sandboxed browser startup timed out'));},timeout);child=spawn(binary,['--headless','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{uid:65534,gid:65534,env:{...env,HOME:profile},stdio:['ignore','ignore','pipe']});child.once('error',()=>{clearTimeout(timer);reject(Error('Sandboxed browser process failed'));});child.stderr.on('data',chunk=>{text=(text+chunk).slice(-10000);const match=text.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-zA-Z0-9-]+)/);if(match&&!settled){settled=true;clearTimeout(timer);resolve(match[1]);}});child.once('exit',()=>{if(!settled){settled=true;clearTimeout(timer);reject(Error('Sandboxed browser exited before startup'));}});});
  return {browser:await chromium.connectOverCDP(address,{timeout}),cleanup};
 }catch(error){await cleanup();throw error;}
}
