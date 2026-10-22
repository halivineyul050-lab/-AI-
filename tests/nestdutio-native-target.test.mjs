import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createProjects} from '../backend/nestdutio/projects.mjs';

test('project target is persisted, defaults legacy web and cannot accept the other artifact kind',()=>{
 const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('a'),('b');");
 db.exec(readFileSync(new URL('../backend/migrations/033_nestdutio.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../backend/migrations/044_nestdutio_wechat.sql',import.meta.url),'utf8'));
 const p=createProjects(db),web=p.create('a',{}),native=p.create('a',{target:'wechat'});
 assert.equal(web.target,'web');assert.equal(p.get('a',native.id).target,'wechat');assert.equal(p.list('a').find(x=>x.id===native.id).target,'wechat');
 assert.throws(()=>p.create('a',{target:'unknown'}),{status:422});
 const artifact={schemaVersion:1,name:'Web',entry:'index.html',files:[{path:'index.html',content:'<h1>Web</h1>'}],capabilities:[],acceptance:[{kind:'visible',target:'h1'}]};
 assert.throws(()=>p.saveVersion('a',native.id,artifact,null),{code:'nestdutio_target_mismatch'});
 assert.throws(()=>p.get('b',native.id),{status:404});db.close();
});
