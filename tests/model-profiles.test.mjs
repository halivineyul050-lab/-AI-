import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../backend/database.mjs';
import {createSecretBox} from '../backend/image-provider-secrets.mjs';
import {createModelProfileStore} from '../backend/model-profiles.mjs';

const input={name:'工作聊天',kind:'chat',endpoint:'https://example.com/v1',model:'model-1',apiKey:'test-only-sensitive-profile-secret-12345'};
const box=createSecretBox(Buffer.alloc(32,7));
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'nikai-profiles-'));const path=join(dir,'test.db');let db=openDatabase(path);try{fn({db,path,reopen(){db.close();db=openDatabase(path);return db;}});}finally{db.close();rmSync(dir,{recursive:true,force:true});}}

test('profiles encrypt secrets, expose only public fields, persist and delete independently',()=>fixture(({db,path,reopen})=>{
 const store=createModelProfileStore(db,box),saved=store.create(input);
 assert.match(saved.id,/^[a-f0-9-]{36}$/);assert.equal(saved.endpoint,'https://example.com/v1/chat/completions');
 assert.deepEqual(Object.keys(saved).sort(),['id','name','kind','endpoint','model','hasKey','createdAt','updatedAt'].sort());
 assert.equal(saved.hasKey,true);assert.equal(store.key(saved.id),input.apiKey);
 const image=store.create({...input,name:'图片',kind:'image',endpoint:'https://example.com/custom/images'});
 assert.equal(image.endpoint,'https://example.com/custom/images');assert.equal(store.list('chat').length,1);assert.equal(store.list('image').length,1);
 assert.deepEqual(store.get(saved.id),saved);assert.equal(JSON.stringify(store.list()).includes(input.apiKey),false);
 db.exec('PRAGMA wal_checkpoint(TRUNCATE)');assert.equal(readFileSync(path).includes(Buffer.from(input.apiKey)),false);
 const restored=createModelProfileStore(reopen(),box);assert.equal(restored.key(saved.id),input.apiKey);assert.equal(restored.list().length,2);
 assert.deepEqual(restored.remove(saved.id),{deleted:true});assert.equal(restored.list().length,1);
 for(const method of ['get','key','remove'])assert.throws(()=>restored[method](saved.id),{status:404});
}));

test('profiles reject missing encryption, invalid inputs and duplicate names',()=>fixture(({db})=>{
 const store=createModelProfileStore(db,box);
 assert.throws(()=>createModelProfileStore(db,null).create(input),{status:503});
 const invalid=[null,{}, {...input,kind:'video'}, {...input,name:''}, {...input,name:'x'.repeat(81)}, {...input,model:''}, {...input,model:'x'.repeat(121)}, {...input,apiKey:''}, {...input,apiKey:'x'.repeat(4097)}, {...input,apiKey:'a\nb'}, {...input,apiKey:'a\rb'}, {...input,endpoint:'https://example.com/'+ 'x'.repeat(2049)}];
 for(const endpoint of ['http://example.com','https://a:b@example.com','https://example.com?token=a','https://example.com/#a'])for(const kind of ['chat','image'])invalid.push({...input,endpoint,kind});
 for(const value of invalid)assert.throws(()=>store.create(value),{status:422});
 store.create(input);assert.throws(()=>store.create(input),{status:409});assert.throws(()=>store.list('video'),{status:422});
}));

test('profiles enforce a maximum of 100 rows without overwriting others',()=>fixture(({db})=>{
 const store=createModelProfileStore(db,box);
 for(let i=0;i<100;i++)store.create({...input,name:`配置${i}`});
 assert.throws(()=>store.create({...input,name:'第101套'}),{status:409});assert.equal(store.list().length,100);
}));

test('image profiles may omit model selection while chat profiles require a model',()=>fixture(({db})=>{
 const store=createModelProfileStore(db,box);
 const image=store.create({...input,name:'图片自动模型',kind:'image',model:''});
 assert.equal(image.model,'');assert.equal(store.get(image.id).model,'');
 assert.throws(()=>store.create({...input,name:'无聊天模型',model:''}),{status:422});
 for(const model of [undefined,null,123,'x'.repeat(121),'a\nb'])assert.throws(()=>store.create({...input,name:'无效图片模型',kind:'image',model}),{status:422});
}));
