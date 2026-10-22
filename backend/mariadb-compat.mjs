import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';

const BUFFER_BYTES = 64 * 1024 * 1024;
const OPERATION_TIMEOUT_MS = 10_000;
const mariaMigrations = [
  {
    version: 14,
    name: 'image_generation_providers',
    sql: readFileSync(new URL('./mariadb/migrations/014_image_generation_providers.sql', import.meta.url), 'utf8')
  },
  {
    version: 15,
    name: 'image_provider_timeout',
    sql: readFileSync(new URL('./mariadb/migrations/015_image_provider_timeout.sql', import.meta.url), 'utf8')
  },
  {
    version: 16,
    name: 'site_announcements',
    sql: readFileSync(new URL('./mariadb/migrations/016_site_announcements.sql', import.meta.url), 'utf8')
  },
  {
    version: 17,
    name: 'image_provider_edit_path',
    sql: readFileSync(new URL('./mariadb/migrations/017_image_provider_edit_path.sql', import.meta.url), 'utf8')
  },
  {
    version: 18,
    name: 'image_provider_balance',
    sql: readFileSync(new URL('./mariadb/migrations/018_image_provider_balance.sql', import.meta.url), 'utf8')
  },
  {
    version: 19,
    name: 'article_source_links',
    sql: readFileSync(new URL('./mariadb/migrations/019_article_source_links.sql', import.meta.url), 'utf8')
  },
  {
    version: 20,
    name: 'image_cloud_history',
    sql: readFileSync(new URL('./mariadb/migrations/020_image_cloud_history.sql', import.meta.url), 'utf8')
  },
  {
    version: 21,
    name: 'user_avatars',
    sql: readFileSync(new URL('./mariadb/migrations/021_user_avatars.sql', import.meta.url), 'utf8')
  },
  { version: 22, name: 'creator_page', sql: readFileSync(new URL('./mariadb/migrations/022_creator_page.sql', import.meta.url), 'utf8') },
  { version: 23, name: 'skills', sql: readFileSync(new URL('./mariadb/migrations/023_skills.sql', import.meta.url), 'utf8') },
  { version: 24, name: 'news_sync', sql: readFileSync(new URL('./mariadb/migrations/024_news_sync.sql', import.meta.url), 'utf8') },
  { version: 25, name: 'assistant', sql: readFileSync(new URL('./mariadb/migrations/025_assistant.sql', import.meta.url), 'utf8') },
  { version: 26, name: 'email_auth', sql: readFileSync(new URL('./mariadb/migrations/026_email_auth.sql', import.meta.url), 'utf8') },
  { version: 27, name: 'credits', sql: readFileSync(new URL('./mariadb/migrations/027_credits.sql', import.meta.url), 'utf8') },
  { version: 28, name: 'manual_recharge', sql: readFileSync(new URL('./mariadb/migrations/028_manual_recharge.sql', import.meta.url), 'utf8') },
  { version: 29, name: 'first_purchase', sql: readFileSync(new URL('./mariadb/migrations/029_first_purchase.sql', import.meta.url), 'utf8') },
  { version: 30, name: 'image_jobs_runtime', sql: readFileSync(new URL('./mariadb/migrations/030_image_jobs_runtime.sql', import.meta.url), 'utf8') },
  { version: 31, name: 'news_brief_images', sql: readFileSync(new URL('./mariadb/migrations/031_news_brief_images.sql', import.meta.url), 'utf8') },
  { version: 32, name: 'explainer', sql: readFileSync(new URL('./mariadb/migrations/032_explainer.sql', import.meta.url), 'utf8') },
  { version: 33, name: 'nestdutio', sql: readFileSync(new URL('./mariadb/migrations/033_nestdutio.sql', import.meta.url), 'utf8') },
  { version: 34, name: 'nestdutio_publishing', sql: readFileSync(new URL('./mariadb/migrations/034_nestdutio_publishing.sql', import.meta.url), 'utf8') },
  { version: 35, name: 'nestdutio_forms', sql: readFileSync(new URL('./mariadb/migrations/035_nestdutio_forms.sql', import.meta.url), 'utf8') },
  { version: 36, name: 'nestdutio_domains', sql: readFileSync(new URL('./mariadb/migrations/036_nestdutio_domains.sql', import.meta.url), 'utf8') },
  { version: 37, name: 'nestdutio_metering', sql: readFileSync(new URL('./mariadb/migrations/037_nestdutio_metering.sql', import.meta.url), 'utf8') },
  { version: 38, name: 'credit_grants', sql: readFileSync(new URL('./mariadb/migrations/038_credit_grants.sql', import.meta.url), 'utf8') },
  { version: 39, name: 'nestdutio_history', sql: readFileSync(new URL('./mariadb/migrations/039_nestdutio_history.sql', import.meta.url), 'utf8') },
  { version: 40, name: 'nestdutio_progress', sql: readFileSync(new URL('./mariadb/migrations/040_nestdutio_progress.sql', import.meta.url), 'utf8') },
  { version: 41, name: 'nestdutio_checkpoints', sql: readFileSync(new URL('./mariadb/migrations/041_nestdutio_checkpoints.sql', import.meta.url), 'utf8') },
  { version: 42, name: 'model_profiles', sql: readFileSync(new URL('./mariadb/migrations/042_model_profiles.sql', import.meta.url), 'utf8') },
  { version: 43, name: 'nestdutio_request_usage', sql: readFileSync(new URL('./mariadb/migrations/043_nestdutio_request_usage.sql', import.meta.url), 'utf8') },
  { version: 44, name: 'nestdutio_wechat', sql: readFileSync(new URL('./mariadb/migrations/044_nestdutio_wechat.sql', import.meta.url), 'utf8') }
];

export function createMariaResponseBuffer() {
  const buffer = new SharedArrayBuffer(BUFFER_BYTES);
  return { buffer, state: new Int32Array(buffer, 0, 3), bytes: new Uint8Array(buffer, 12) };
}

export function applyMariaMigrations(db) {
  const hasMigration = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const recordMigration = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
  mariaMigrations.forEach((migration) => {
    if (hasMigration.get(migration.version)) return;
    db.exec(migration.sql);
    recordMigration.run(migration.version, migration.name);
  });
}

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
  value = value.replace(/CAST\(\(\(julianday\(([^)]+)\)\s*-\s*julianday\(\?\)\)\s*\*\s*24\.0\)\s*\+\s*0\.0000001\s+AS\s+INTEGER\)/gi, 'TIMESTAMPDIFF(HOUR, ?, $1)');
  value = value.replace(/date\(([^,()]+),\s*'\+8 hours'\)/gi, "DATE_FORMAT(DATE_ADD($1, INTERVAL 8 HOUR), '%Y-%m-%d')");
  value = value.replace(/\s+AS\s+TEXT\b/gi, ' AS CHAR');
  value = value.replace(/CAST\((json_extract\([^)]*\))\s+AS\s+CHAR\)/gi, 'CAST(JSON_UNQUOTE($1) AS CHAR) COLLATE utf8mb4_unicode_ci');
  value = value.replace(/json_type\(([^,()]+),\s*([^()]+)\)\s*=\s*'text'/gi, "JSON_TYPE(JSON_EXTRACT($1, $2)) = 'STRING'");
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
    charset: 'utf8mb4_unicode_ci',
  };
}

export class MariaDbCompat {
  constructor(options = connectionOptions()) {
    this.backend = 'mariadb';
    this.worker = new Worker(new URL('./mariadb-worker.mjs', import.meta.url), { workerData: options });
    Object.assign(this, createMariaResponseBuffer());
    this.call('ping');
  }

  call(type, payload = {}) {
    const { buffer, state, bytes } = this;
    Atomics.store(state, 0, 0);
    this.worker.postMessage({ type, payload, buffer });
    const wait = Atomics.wait(state, 0, 0, OPERATION_TIMEOUT_MS);
    if (wait === 'timed-out') {
      Object.assign(this, createMariaResponseBuffer());
      throw new Error('MariaDB operation timed out');
    }
    const length = Atomics.load(state, 1);
    const failed = Atomics.load(state, 2) === 1;
    const result = JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)) || 'null');
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
