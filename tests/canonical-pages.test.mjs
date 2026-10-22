import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApplication} from '../server.mjs';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const pages=[['auth','auth'],['index',''],['admin','admin'],['creator','creator'],['skills','skills'],['video-pricing','video-pricing'],['image-generation','image-generation'],['utilities','utilities'],['games','games'],['game-2048','games/2048'],['memory-game','games/memory'],['breakout','games/breakout'],['snake','games/snake'],['gomoku','games/gomoku'],['flight','games/flight'],['never-retreat','games/never-retreat'],['video-gif','utilities/video-to-gif'],['video-crop','utilities/video-crop'],['video-mask','utilities/video-mask'],['link-extract','utilities/link-extract'],['image-erase','utilities/image-erase'],['image-edit','utilities/image-edit'],['image-background','utilities/image-background'],['image-enhance','utilities/image-enhance']];
test('first-party pages use canonical paths and preserve legacy query strings for GET and HEAD',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'canonical-pages-'));const app=buildApplication({dbPath:join(dir,'test.db'),autoSeed:false,environment:'test',logger:false});await app.listen(0,'127.0.0.1');t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});const base=`http://127.0.0.1:${app.server.address().port}`;
 for(const [file,path]of pages){
  const target='/'+path;const response=await fetch(base+target);assert.equal(response.status,200,target);
  for(const method of ['GET','HEAD']){const old=await fetch(`${base}/${file}.html?next=%2Fimage-generation&mode=login`,{method,redirect:'manual'});assert.equal(old.status,308,file);assert.equal(old.headers.get('location'),`${target}?next=%2Fimage-generation&mode=login`);assert.match(old.headers.get('cache-control'),/no-store/);if(method==='HEAD')assert.equal((await old.arrayBuffer()).byteLength,0);}
  if(path){const slash=await fetch(base+target+'/?x=1',{redirect:'manual'});assert.equal(slash.status,308,path);assert.equal(slash.headers.get('location'),target+'?x=1');}
 }
 const auth=await fetch(base+'/auth');const html=await auth.text();assert.match(html,/id="login-form"/);assert.match(html,/href="https:\/\/ontimo.cn\/auth"/);assert.match(auth.headers.get('content-security-policy'),/img-src 'self' data: blob:/);
 for(const name of ['ironfront','yiren-buche','tank-air-war','free-city-3d']){const old=await fetch(`${base}/games/${name}/index.html?play=1`,{redirect:'manual'});assert.equal(old.status,308,name);assert.equal(old.headers.get('location'),`/games/${name}?play=1`);assert.equal((await fetch(`${base}/games/${name}`)).status,200,name);}
 assert.equal((await fetch(base+'/baidu_verify_codeva-FSh1NIJkcR.html')).status,200);
 assert.equal((await fetch(base+'/unknown.html')).status,404);
});
test('first-party UI account links consistently use /auth',()=>{
 for(const name of readdirSync(new URL('../public/',import.meta.url))){if(!/\.(html|js|mjs)$/.test(name)||name==='lucide.min.js')continue;const text=readFileSync(new URL('../public/'+name,import.meta.url),'utf8');assert.doesNotMatch(text,/\/auth\.html/,name);}
});
