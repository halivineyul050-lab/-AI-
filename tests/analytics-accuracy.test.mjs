import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {getMonitoringSnapshot} from '../backend/monitoring.mjs';
import {translateMariaSql} from '../backend/mariadb-compat.mjs';

test('MariaDB JSON strings are unquoted before grouping, joining and Chinese label lookup',()=>{
 const sql=translateMariaSql("SELECT CAST(json_extract(properties_json, '$.source_type') AS TEXT)");
 assert.match(sql,/CAST\(JSON_UNQUOTE\(json_extract\(properties_json, '\$\.source_type'\)\) AS CHAR\)/i);
});

test('daily UV averages daily distinct visitors; dimension UV uses the whole-window denominator',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 try {
  const insert=db.prepare("INSERT INTO analytics_events(event_id,event_name,visitor_id,session_id,page_type,path,properties_json,client_time,received_at,ip_hash) VALUES (?,'page_view',?,?,'news','/news',?,?,?,'test')");
  const rows=[['a','one','s1','2026-10-18T02:00:00.000Z','desktop'],['b','one','s2','2026-10-19T02:00:00.000Z','mobile'],['c','two','s3','2026-10-19T03:00:00.000Z','desktop']];
  for(const [id,visitor,session,time,device] of rows)insert.run(id,visitor,session,JSON.stringify({device_type:device,source_type:'direct'}),time,time);
  const result=getMonitoringSnapshot(db,{range:'custom',startDate:'2026-10-18',endDate:'2026-10-19',now:'2026-10-20T04:00:00.000Z'});
  assert.equal(result.kpis.uniqueVisitors,2);assert.equal(result.kpis.averageDailyUv,1.5);
  assert.equal(result.deviceStats.find(x=>x.key==='desktop').uvShare,100);
  assert.equal(result.deviceStats.find(x=>x.key==='mobile').uvShare,50);
  assert.equal(result.pagePerformance[0].pageName,'AI 资讯');
 } finally {db.close();}
});

test('today compares with yesterday at the same Beijing clock time',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 try {const {window}=getMonitoringSnapshot(db,{range:'today',now:'2026-10-20T06:00:00.000Z'});
 assert.equal(window.compareStartAt,'2026-10-18T16:00:00.000Z');assert.equal(window.compareEndAt,'2026-10-19T06:00:00.000Z');
 }finally{db.close();}
});

for(const [now,expectedEnd] of [['2026-10-19T16:15:00.000Z','2026-10-18T16:15:00.000Z'],['2026-10-19T16:00:00.000Z','2026-10-18T16:00:00.000Z']])test(`today compares exact elapsed time even at ${now}`,()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 try {const {window}=getMonitoringSnapshot(db,{range:'today',now});assert.equal(window.compareStartAt,'2026-10-18T16:00:00.000Z');assert.equal(window.compareEndAt,expectedEnd);}finally{db.close();}
});

test('missing and malformed dimensions stay visible as unknown and keep all page views in shares',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 try {
 const q=db.prepare("INSERT INTO analytics_events(event_id,event_name,visitor_id,session_id,page_type,path,properties_json,client_time,received_at,ip_hash) VALUES (?,'page_view','one','session','news','/news',?,'2026-10-20T02:00:00.000Z','2026-10-20T02:00:00.000Z','test')");
 q.run('valid',JSON.stringify({device_type:'desktop',source_type:'direct'}));q.run('missing','{}');q.run('malformed','{broken');
 const result=getMonitoringSnapshot(db,{range:'today',now:'2026-10-20T04:00:00.000Z'});
 assert.equal(result.deviceStats.reduce((sum,x)=>sum+x.pageViews,0),3);assert.equal(result.sourceStats.find(x=>x.key==='unknown').pageViews,2);
 assert.equal(result.deviceStats.find(x=>x.key==='unknown').pvShare,66.67);
 }finally{db.close();}
});
