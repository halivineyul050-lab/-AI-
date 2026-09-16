import { parentPort, workerData } from 'node:worker_threads';
import mysql from 'mysql2/promise';

let connection;
const encode = new TextEncoder();

async function handle(type, payload) {
  connection ||= await mysql.createConnection({ ...workerData, supportBigNumbers: true, bigNumberStrings: false, multipleStatements: true });
  if (type === 'ping') { await connection.ping(); return { ready: 1 }; }
  if (type === 'close') { await connection.end(); return { closed: true }; }
  if (type === 'exec') { await connection.query(payload.sql); return { changes: 0 }; }
  const [rows] = await connection.query(payload.sql, payload.params);
  if (payload.mode === 'get') return Array.isArray(rows) ? (rows[0] || undefined) : undefined;
  if (payload.mode === 'all') return Array.isArray(rows) ? rows : [];
  return { changes: Number(rows.affectedRows || 0), lastInsertRowid: rows.insertId || 0 };
}

parentPort.on('message', async ({ type, payload, buffer }) => {
  const state = new Int32Array(buffer, 0, 3);
  const target = new Uint8Array(buffer, 12);
  let failed = 0;
  let result;
  try { result = await handle(type, payload); }
  catch (error) {
    failed = 1;
    const constraint = ['ER_DUP_ENTRY','ER_NO_REFERENCED_ROW_2','ER_ROW_IS_REFERENCED_2'].includes(error.code);
    result = { message: error.message, code: constraint ? 'ERR_SQLITE_CONSTRAINT' : error.code };
  }
  const output = encode.encode(JSON.stringify(result ?? null));
  if (output.length > target.length) {
    failed = 1;
    result = encode.encode(JSON.stringify({ message: 'MariaDB response exceeds compatibility buffer', code: 'ERR_DB_RESPONSE_SIZE' }));
    target.set(result); Atomics.store(state, 1, result.length);
  } else { target.set(output); Atomics.store(state, 1, output.length); }
  Atomics.store(state, 2, failed);
  Atomics.store(state, 0, 1);
  Atomics.notify(state, 0);
});
