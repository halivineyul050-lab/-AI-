import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApplication } from '../server.mjs';
import { registerUser } from '../backend/auth.mjs';

const png=readFileSync(new URL('../public/brand-icon-192.png',import.meta.url));
async function setup(t) {
  const root=mkdtempSync(join(tmpdir(),'nikai-avatar-test-'));
  const app=buildApplication({dbPath:join(root,'test.db'),logger:false,environment:'test',autoSeed:false});
  const address=await app.listen(0,'127.0.0.1');
  const base=`http://127.0.0.1:${address.port}`;
  t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
  const member=await registerUser(app.db,{displayName:'头像测试',email:'avatar@example.test',normalizedEmail:'avatar@example.test',password:'avatar-test-password',consentVersion:'2026-07'});
  const cookie=`nikai_auth=${member.token}`;
  const upload=(bytes=png,type='image/png',headers={})=>fetch(base+'/api/v1/account/avatar',{method:'PUT',body:bytes,headers:{Cookie:cookie,'Content-Type':type,...headers}});
  return {app,base,member,cookie,upload};
}

test('avatar upload persists across login sessions and refreshes its version on replacement',async t=>{
  const {base,cookie,upload}=await setup(t);
  const page=await fetch(base+'/auth.html');
  assert.match(page.headers.get('content-security-policy'),/img-src[^;]*blob:/);
  const result=await upload();assert.equal(result.status,200);
  const first=(await result.json()).data.user.avatarUrl;
  assert.match(first,/^\/api\/v1\/account\/avatar\?v=[a-f0-9-]+$/);
  const image=await fetch(base+first,{headers:{Cookie:cookie}});
  assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
  assert.match(image.headers.get('cache-control'),/no-store/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  const head=await fetch(base+first,{method:'HEAD',headers:{Cookie:cookie}});
  assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(png.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  const me=await fetch(base+'/api/v1/auth/me',{headers:{Cookie:cookie}});
  assert.equal((await me.json()).data.user.avatarUrl,first);
  const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'avatar@example.test',password:'avatar-test-password'})});
  assert.equal((await login.json()).data.user.avatarUrl,first);
  const second=(await (await upload()).json()).data.user.avatarUrl;
  assert.notEqual(second,first);
});

test('avatars are account-private and cannot be overwritten through a supplied user id',async t=>{
  const {app,base,member,cookie,upload}=await setup(t);
  const original=(await (await upload()).json()).data.user.avatarUrl;
  const other=await registerUser(app.db,{displayName:'另一个账号',email:'other@example.test',normalizedEmail:'other@example.test',password:'other-test-password',consentVersion:'2026-07'});
  assert.equal((await fetch(base+'/api/v1/account/avatar')).status,401);
  assert.equal((await fetch(base+'/api/v1/account/avatar',{headers:{Cookie:`nikai_auth=${other.token}`}})).status,404);
  const attempt=await fetch(base+`/api/v1/account/avatar?userId=${member.user.id}`,{method:'PUT',body:png,headers:{Cookie:`nikai_auth=${other.token}`,'Content-Type':'image/png'}});
  assert.equal(attempt.status,200);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM user_avatars').get().n,2);
  assert.equal((await (await fetch(base+'/api/v1/auth/me',{headers:{Cookie:cookie}})).json()).data.user.avatarUrl,original);
});

test('avatar uploads reject unauthenticated, oversized, forged and cross-origin content',async t=>{
  const {base,upload}=await setup(t);
  assert.equal((await fetch(base+'/api/v1/account/avatar',{method:'PUT',body:png,headers:{'Content-Type':'image/png'}})).status,401);
  assert.equal((await upload(Buffer.alloc(2*1024*1024+1))).status,413);
  assert.equal((await upload(Buffer.from('<svg onload="alert(1)"></svg>'),'image/svg+xml')).status,415);
  assert.equal((await upload(Buffer.from('<html>not an image</html>'))).status,422);
  assert.equal((await upload(png,'image/jpeg')).status,422);
  assert.equal((await upload(png,'image/png',{Origin:'https://attacker.example'})).status,403);
});

test('resetting an avatar restores the default and deleting an account cascades avatar data',async t=>{
  const {app,base,member,cookie,upload}=await setup(t);
  await upload();
  const reset=await fetch(base+'/api/v1/account/avatar',{method:'DELETE',headers:{Cookie:cookie}});
  assert.equal(reset.status,200);assert.equal((await reset.json()).data.user.avatarUrl,null);
  assert.equal((await fetch(base+'/api/v1/account/avatar',{headers:{Cookie:cookie}})).status,404);
  await upload();
  app.db.prepare('DELETE FROM users WHERE id = ?').run(member.user.id);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM user_avatars').get().n,0);
});
