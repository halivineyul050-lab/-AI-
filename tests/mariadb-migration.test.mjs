import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTableSql } from '../scripts/migrate-sqlite-to-mariadb.mjs';

test('migration schema maps SQLite keys and defaults to MariaDB',()=>{
  const sql=createTableSql('example',{columns:[{name:'id',type:'TEXT',notnull:1,pk:1,dflt_value:null},{name:'created_at',type:'TEXT',notnull:1,pk:0,dflt_value:"strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"},{name:'body',type:'TEXT',notnull:0,pk:0,dflt_value:null}],constrained:new Set(['id'])});
  assert.match(sql,/`id` VARCHAR\(191\) NOT NULL/);assert.match(sql,/PRIMARY KEY \(`id`\)/);assert.match(sql,/UTC_TIMESTAMP/);assert.match(sql,/`body` LONGTEXT/);
});

test('migration source can enumerate a real SQLite fixture',()=>{
  const dir=mkdtempSync(join(tmpdir(),'nikai-maria-'));const path=join(dir,'test.db');const db=new DatabaseSync(path);db.exec('CREATE TABLE x(id TEXT PRIMARY KEY, value TEXT); INSERT INTO x VALUES (\'a\',\'b\')');assert.equal(db.prepare('SELECT COUNT(*) count FROM x').get().count,1);db.close();rmSync(dir,{recursive:true,force:true});
});
