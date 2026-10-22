import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runMariaDbCi, assertMariaDbCiEnvironment } from '../scripts/verify-mariadb-ci.mjs';
const env={NIKAI_MARIADB_CI:'1',MARIADB_CI_HOST:'127.0.0.1',MARIADB_CI_PORT:'33307',MARIADB_CI_USER:'root',MARIADB_CI_PASSWORD:'fixture-only'};
test('CI runner rejects production, default ports, sockets and inherited database settings before connect',async()=>{
  assert.doesNotThrow(()=>assertMariaDbCiEnvironment(env));
  for(const patch of [{NIKAI_MARIADB_CI:undefined},{MARIADB_CI_HOST:'47.93.245.219'},{MARIADB_CI_PORT:'3306'},{MARIADB_CI_PORT:'65536'},{MARIADB_CI_PASSWORD:''},{NIKAI_DB_ENGINE:'mariadb'},{NIKAI_DB_PASSWORD:'fixture-only'},{NIKAI_DB_SOCKET:'/var/lib/mysql/mysql.sock'}])await assert.rejects(()=>runMariaDbCi({...env,...patch},{connect:()=>{throw Error('must not connect');}}),/isolated CI/);
});
for(const fail of [false,true])test('CI fixture cleanup runs after verification '+(fail?'failure':'success'),async()=>{
  const queries=[];let ended=false,created;
  const connection={async query(sql){queries.push(sql);},async end(){ended=true;}};
  const work=runMariaDbCi(env,{connect:async()=>connection,verify:async fixture=>{created=fixture;assert.match(fixture.NIKAI_DB_NAME,/^nikai_verify_[a-f0-9]{16}$/);assert.equal(fixture.NIKAI_DB_HOST,'127.0.0.1');if(fail)throw Error('fixture verification failed');return {pass:true};}});
  if(fail)await assert.rejects(()=>work,/fixture verification failed/);else assert.equal((await work).pass,true);
  assert.ok(queries[0].startsWith('CREATE DATABASE'));assert.ok(queries.at(-1).startsWith('DROP DATABASE'));assert.ok(queries.at(-1).includes(created.NIKAI_DB_NAME));assert.equal(ended,true);
});
test('CI refuses success when dropping the fixture database fails and still closes connection',async()=>{
  let ended=false;await assert.rejects(()=>runMariaDbCi(env,{connect:async()=>({query:async sql=>{if(sql.startsWith('DROP'))throw Error('fixture drop failed');},end:async()=>{ended=true;}}),verify:async()=>({pass:true})}),/fixture drop failed/);assert.equal(ended,true);
});

test('CI never drops an existing schema when CREATE fails and still closes the connection',async()=>{
  const statements=[];let ended=false;
  await assert.rejects(()=>runMariaDbCi(env,{connect:async()=>({query:async sql=>{statements.push(sql);throw Error('fixture create failed');},end:async()=>{ended=true;}}),verify:async()=>{throw Error('must not verify');}}),/fixture create failed/);
  assert.equal(statements.length,1);assert.ok(statements[0].startsWith('CREATE DATABASE'));assert.equal(ended,true);
});
