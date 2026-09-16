import { Worker } from 'node:worker_threads';

const BUFFER_BYTES = 64 * 1024 * 1024;

export function translateMariaSql(sql) {
  let value = String(sql).trim();
  if (/^PRAGMA\s+user_version/i.test(value)) return 'SELECT COALESCE(MAX(version), 0) AS user_version FROM schema_migrations';
  value = value.replace(/BEGIN\s+IMMEDIATE/gi, 'START TRANSACTION');
  value = value.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT IGNORE');
  value = value.replace(/strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\s*\)/gi, "DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')");
  value = value.replace(/strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now',\s*\?\s*\)/gi, "DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL CAST(? AS SIGNED) DAY), '%Y-%m-%dT%H:%i:%s.%fZ')");
  value = value.replace(/strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now',\s*'-(\d+) days'\s*\)/gi, "DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(3), INTERVAL $1 DAY), '%Y-%m-%dT%H:%i:%s.%fZ')");
  value = value.replace(/strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now',\s*'-(\d+) seconds'\s*\)/gi, "DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(3), INTERVAL $1 SECOND), '%Y-%m-%dT%H:%i:%s.%fZ')");
  value = value.replace(/date\('now',\s*'-(\d+) days'\)/gi, 'DATE_SUB(UTC_DATE(), INTERVAL $1 DAY)');
  value = value.replace(/date\('now',\s*'-(\d+) day'\)/gi, 'DATE_SUB(UTC_DATE(), INTERVAL $1 DAY)');
  value = value.replace(/\s+COLLATE\s+NOCASE/gi, ' COLLATE utf8mb4_unicode_ci');
  value = value.replace(/CAST\((json_extract\([^)]*\))\s+AS\s+REAL\)/gi, 'CAST($1 AS DECIMAL(30,8))');
  value = value.replace(/\bMIN\(([^,()]+),\s*([^()]+)\)/gi, 'LEAST($1, $2)');
  value = value.replace(/\bMAX\(([^,()]+),\s*([^()]+)\)/gi, 'GREATEST($1, $2)');
  value = value.replace(/\bexcluded\.([a-z_]+)/gi, 'VALUES($1)');
  value = value.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
  value = value.replace(/ON\s+CONFLICT\s*\(\s*([^)]+)\s*\)\s*DO\s+NOTHING/gi, 'ON DUPLICATE KEY UPDATE $1=$1');
  return value;
}

function connectionOptions(env = process.env) {
  return {
    socketPath: env.NIKAI_DB_SOCKET || '/var/lib/mysql/mysql.sock',
    host: env.NIKAI_DB_HOST || undefined,
    port: Number(env.NIKAI_DB_PORT || 3306),
    user: env.NIKAI_DB_USER,
    password: env.NIKAI_DB_PASSWORD,
    database: env.NIKAI_DB_NAME || 'nikai_ai',
    charset: 'utf8mb4',
  };
}

export class MariaDbCompat {
  constructor(options = connectionOptions()) {
    this.backend = 'mariadb';
    this.worker = new Worker(new URL('./mariadb-worker.mjs', import.meta.url), { workerData: options });
    this.buffer = new SharedArrayBuffer(BUFFER_BYTES);
    this.state = new Int32Array(this.buffer, 0, 3);
    this.bytes = new Uint8Array(this.buffer, 12);
    this.call('ping');
  }

  call(type, payload = {}) {
    Atomics.store(this.state, 0, 0);
    this.worker.postMessage({ type, payload, buffer: this.buffer });
    const wait = Atomics.wait(this.state, 0, 0, 30_000);
    if (wait === 'timed-out') throw new Error('MariaDB operation timed out');
    const length = Atomics.load(this.state, 1);
    const failed = Atomics.load(this.state, 2) === 1;
    const result = JSON.parse(new TextDecoder().decode(this.bytes.subarray(0, length)) || 'null');
    if (failed) {
      const error = new Error(result.message || 'MariaDB operation failed');
      error.code = result.code;
      throw error;
    }
    return result;
  }

  prepare(sql) {
    return {
      get: (...params) => this.call('query', { sql: translateMariaSql(sql), params, mode: 'get' }),
      all: (...params) => this.call('query', { sql: translateMariaSql(sql), params, mode: 'all' }),
      run: (...params) => this.call('query', { sql: translateMariaSql(sql), params, mode: 'run' }),
    };
  }

  exec(sql) { return this.call('exec', { sql: translateMariaSql(sql) }); }
  close() { try { this.call('close'); } finally { this.worker.terminate(); } }
}

export function openMariaDatabase(env = process.env) {
  if (!env.NIKAI_DB_USER || !env.NIKAI_DB_PASSWORD) throw new Error('MariaDB requires NIKAI_DB_USER and NIKAI_DB_PASSWORD');
  return new MariaDbCompat(connectionOptions(env));
}
