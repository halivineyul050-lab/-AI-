import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';

const safe = (name) => { if(!/^[a-z_][a-z0-9_]*$/i.test(name))throw new Error('unsafe name'); return `\`${name}\``; };
export async function verify({sqlitePath, env=process.env}) {
  const sqlite=new DatabaseSync(sqlitePath,{readOnly:true});
  const maria=await mysql.createConnection({socketPath:env.NIKAI_DB_SOCKET||'/var/lib/mysql/mysql.sock',host:env.NIKAI_DB_HOST||undefined,user:env.NIKAI_DB_USER,password:env.NIKAI_DB_PASSWORD,database:env.NIKAI_DB_NAME||'nikai_ai'});
  const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const counts={}; let pass=true;
  try {
    for(const table of tables){const source=Number(sqlite.prepare(`SELECT COUNT(*) count FROM ${safe(table)}`).get().count);const [rows]=await maria.query(`SELECT COUNT(*) count FROM ${safe(table)}`);const target=Number(rows[0].count);counts[table]={source,target,match:source===target};if(source!==target)pass=false;}
    const critical={articles:counts.articles,tools:counts.tools,users:counts.users,analytics_events:counts.analytics_events};
    return {pass,tables:tables.length,counts,critical};
  } finally {sqlite.close();await maria.end();}
}
if(import.meta.url===`file://${process.argv[1]?.replaceAll('\\','/')}`){const sqlitePath=process.argv[process.argv.indexOf('--sqlite')+1];verify({sqlitePath}).then(r=>{console.log(JSON.stringify(r,null,2));if(!r.pass)process.exitCode=1}).catch(e=>{console.error(e);process.exitCode=1});}
