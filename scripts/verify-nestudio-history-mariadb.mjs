// Runs only against a newly created temporary schema; never uses production credentials/data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import mysql from 'mysql2/promise';
import {MariaDbCompat} from '../backend/mariadb-compat.mjs';
import {createProjects} from '../backend/nestdutio/projects.mjs';
if(!process.argv.includes('--isolated-test'))throw Error('Explicit --isolated-test required');
const database='nikai_history_verify_'+Date.now(),socketPath='/var/lib/mysql/mysql.sock';
const admin=await mysql.createConnection({socketPath,user:'root'});let db,created=false;
try{
 await admin.query('CREATE DATABASE `'+database+'` CHARACTER SET utf8mb4');created=true;
 db=new MariaDbCompat({socketPath,user:'root',database});
 for(const name of ['033_nestdutio','039_nestdutio_history'])db.exec(readFileSync(new URL('../backend/mariadb/migrations/'+name+'.sql',import.meta.url),'utf8'));
 const p=createProjects(db),own=p.create('a',{name:'100%_计算器'});p.create('b',{name:'其他'});
 assert.equal(p.browse('a',{q:'%_'}).items.length,1);assert.equal(p.browse('b').items.length,1);
 assert.throws(()=>p.update('b',own.id,{name:'越权'}),{status:404});
 const artifact={schemaVersion:1,name:'模型名称',entry:'index.html',files:[{path:'index.html',content:'<h1>test</h1>'}],capabilities:[],acceptance:[{kind:'visible',target:'h1'}]};
 const v=p.saveVersion('a',own.id,artifact,null);p.update('a',own.id,{name:'保留名称',archived:true});assert.equal(p.browse('a').items.length,0);assert.equal(p.browse('a',{archived:true}).items.length,1);p.restore('a',own.id,v.id);assert.equal(p.get('a',own.id).name,'保留名称');p.update('a',own.id,{archived:false});
 for(let i=0;i<3;i++)db.prepare('INSERT INTO nestdutio_tasks(id,user_id,project_id,request_key,prompt,state,error_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('task'+i,'a',own.id,'key'+i,'问题'+i,i===2?'generating':'failed','nestdutio_timeout','2026-10-16T08:00:00.000Z','2026-10-16T08:01:00.000Z');
 const page=p.history('a',own.id,{limit:2});assert.equal(page.activeTaskId,'task2');assert.deepEqual(page.items.map(x=>x.prompt),['问题1','问题2']);assert.deepEqual(p.history('a',own.id,{before:page.before}).items.map(x=>x.prompt),['问题0']);assert.throws(()=>p.history('b',own.id),{status:404});
 console.log(JSON.stringify({pass:true,checks:['migration','literal-search','ownership','archive-restore','rename-persists','history-cursor','active-task']}));
}finally{db?.close();if(created)await admin.query('DROP DATABASE `'+database+'`');await admin.end();}
