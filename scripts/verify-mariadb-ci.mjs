import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { verifyNewsEventsMariaDb } from './verify-news-events-mariadb.mjs';

export function assertMariaDbCiEnvironment(env) {
  const port = Number(env.MARIADB_CI_PORT);
  if (env.NIKAI_MARIADB_CI !== '1' || env.MARIADB_CI_HOST !== '127.0.0.1' || !Number.isInteger(port)
    || port < 1024 || port > 65535 || port === 3306 || !env.MARIADB_CI_USER || !env.MARIADB_CI_PASSWORD
    || Object.keys(env).some(key => key.startsWith('NIKAI_DB_') && env[key])) throw Error('Explicit isolated CI MariaDB settings are required');
}
export async function runMariaDbCi(env, { connect = mysql.createConnection, verify = verifyNewsEventsMariaDb } = {}) {
  assertMariaDbCiEnvironment(env);
  const database = 'nikai_verify_' + randomBytes(8).toString('hex');
  const connection = await connect({host:env.MARIADB_CI_HOST,port:Number(env.MARIADB_CI_PORT),user:env.MARIADB_CI_USER,password:env.MARIADB_CI_PASSWORD});
  let created = false;
  try {
    await connection.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); created = true;
    const result = await verify({ NIKAI_MARIADB_ISOLATED:'1',NIKAI_DB_HOST:'127.0.0.1',NIKAI_DB_PORT:env.MARIADB_CI_PORT,
      NIKAI_DB_USER:env.MARIADB_CI_USER,NIKAI_DB_PASSWORD:env.MARIADB_CI_PASSWORD,NIKAI_DB_NAME:database });
    if (result?.pass !== true) throw Error('MariaDB CI verification did not pass');
    const { database: _fixtureName, ...publicResult } = result;
    return { ...publicResult, fixtureDropped: true };
  } finally {
    try { if (created) await connection.query('DROP DATABASE `' + database + '`'); }
    finally { await connection.end(); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runMariaDbCi(process.env);
    const out = process.argv[2];
    if (out) writeFileSync(out, JSON.stringify(result,null,2)+'\n', {flag:'wx'});
    console.log(JSON.stringify(result));
  } catch (error) { console.error('MariaDB CI failed: ' + (error.code || error.message).replaceAll(process.env.MARIADB_CI_PASSWORD || '\0', '[redacted]')); process.exitCode = 1; }
}
