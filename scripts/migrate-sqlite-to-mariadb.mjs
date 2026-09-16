import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';

export const safeName = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `\`${name}\``;
};

const targetOptions = (env = process.env) => ({
  socketPath: env.NIKAI_DB_SOCKET || '/var/lib/mysql/mysql.sock',
  host: env.NIKAI_DB_HOST || undefined,
  port: Number(env.NIKAI_DB_PORT || 3306),
  user: env.NIKAI_DB_USER,
  password: env.NIKAI_DB_PASSWORD,
  database: env.NIKAI_DB_NAME || 'nikai_ai',
  charset: 'utf8mb4_unicode_ci',
  multipleStatements: true,
});

function tableMetadata(db, table) {
  const columns = db.prepare(`PRAGMA table_info(${safeName(table)})`).all();
  const indexes = db.prepare(`PRAGMA index_list(${safeName(table)})`).all().map((index) => ({
    ...index,
    columns: db.prepare(`PRAGMA index_info(${safeName(index.name)})`).all().map((item) => item.name),
  }));
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${safeName(table)})`).all();
  const constrained = new Set([
    ...columns.filter((column) => column.pk).map((column) => column.name),
    ...indexes.flatMap((index) => index.columns),
    ...foreignKeys.flatMap((key) => [key.from]),
  ]);
  return { columns, indexes, foreignKeys, constrained };
}

function defaultSql(value) {
  if (value === null || value === undefined) return '';
  if (/strftime/i.test(value) || /CURRENT_TIMESTAMP/i.test(value)) return " DEFAULT (DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ'))";
  if (/^[-+]?\d+(?:\.\d+)?$/.test(String(value))) return ` DEFAULT ${value}`;
  if (/^'.*'$/.test(String(value))) return ` DEFAULT ${value}`;
  return '';
}

function columnSql(column, constrained) {
  const declared = String(column.type || 'TEXT').toUpperCase();
  let type = 'LONGTEXT';
  if (declared.includes('INT')) type = 'BIGINT';
  else if (declared.includes('REAL') || declared.includes('FLOA') || declared.includes('DOUB')) type = 'DOUBLE';
  else if (declared.includes('BLOB')) type = 'LONGBLOB';
  else if (constrained.has(column.name)) type = 'VARCHAR(191)';
  else if (/(?:_at|_date|status|kind|role|source|category|email|url|path|slug|name|title|icon|actor|action|type|code|placement|family|version)$/i.test(column.name)) type = 'VARCHAR(1024)';
  return `${safeName(column.name)} ${type}${column.notnull || column.pk ? ' NOT NULL' : ''}${defaultSql(column.dflt_value)}`;
}

export function createTableSql(table, metadata) {
  const primary = metadata.columns.filter((column) => column.pk).sort((a,b) => a.pk-b.pk);
  const parts = metadata.columns.map((column) => columnSql(column, metadata.constrained));
  if (primary.length) parts.push(`PRIMARY KEY (${primary.map((column) => safeName(column.name)).join(', ')})`);
  return `CREATE TABLE ${safeName(table)} (\n  ${parts.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

function checksum(rows) {
  return createHash('sha256').update(rows.map((row) => JSON.stringify(row)).join('\n')).digest('hex');
}

export async function migrate({ sqlitePath, reset = false, env = process.env, logger = console }) {
  if (!sqlitePath) throw new Error('--sqlite is required');
  const source = new DatabaseSync(sqlitePath, { readOnly: true });
  const target = await mysql.createConnection(targetOptions(env));
  const tables = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
  try {
    const [existing] = await target.query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()");
    if (existing.length && !reset) throw new Error('Target database is not empty; use --reset-empty-target only for an approved reset');
    await target.query('SET FOREIGN_KEY_CHECKS=0');
    if (reset) for (const row of existing) await target.query(`DROP TABLE ${safeName(row.TABLE_NAME || row.table_name)}`);
    const metadata = new Map();
    for (const table of tables) {
      const info = tableMetadata(source, table); metadata.set(table, info);
      await target.query(createTableSql(table, info));
    }
    await target.beginTransaction();
    try {
      for (const table of tables) {
        const info = metadata.get(table);
        const names = info.columns.map((column) => column.name);
        const order = info.columns.filter((column) => column.pk).sort((a,b)=>a.pk-b.pk).map((column)=>safeName(column.name)).join(', ');
        const rows = source.prepare(`SELECT * FROM ${safeName(table)}${order ? ` ORDER BY ${order}` : ''}`).all();
        for (let offset=0; offset<rows.length; offset+=200) {
          const batch = rows.slice(offset, offset+200);
          const placeholders = batch.map(() => `(${names.map(()=>'?').join(',')})`).join(',');
          await target.query(`INSERT INTO ${safeName(table)} (${names.map(safeName).join(',')}) VALUES ${placeholders}`, batch.flatMap((row)=>names.map((name)=>row[name])));
        }
        logger.log(`${table}: ${rows.length} rows ${checksum(rows).slice(0,12)}`);
      }
      await target.commit();
    } catch (error) { await target.rollback(); throw error; }
    for (const table of tables) {
      const info = metadata.get(table);
      for (const index of info.indexes.filter((item) => item.origin !== 'pk')) {
        const unique = index.unique ? 'UNIQUE ' : '';
        await target.query(`CREATE ${unique}INDEX ${safeName(index.name)} ON ${safeName(table)} (${index.columns.map(safeName).join(',')})`);
      }
    }
    for (const table of tables) {
      const grouped = Map.groupBy(metadata.get(table).foreignKeys, (key) => key.id);
      for (const [id, keys] of grouped) {
        const ordered = keys.sort((a,b)=>a.seq-b.seq);
        const constraint = `fk_${table}_${id}`.slice(0,60);
        await target.query(`ALTER TABLE ${safeName(table)} ADD CONSTRAINT ${safeName(constraint)} FOREIGN KEY (${ordered.map((key)=>safeName(key.from)).join(',')}) REFERENCES ${safeName(ordered[0].table)} (${ordered.map((key)=>safeName(key.to)).join(',')}) ON UPDATE ${ordered[0].on_update || 'NO ACTION'} ON DELETE ${ordered[0].on_delete || 'NO ACTION'}`);
      }
    }
    await target.query('SET FOREIGN_KEY_CHECKS=1');
    return { tables: tables.length };
  } finally { source.close(); await target.end(); }
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\','/')}`) {
  const sqlitePath = process.argv[process.argv.indexOf('--sqlite')+1];
  migrate({ sqlitePath, reset: process.argv.includes('--reset-empty-target') }).then((result)=>console.log(JSON.stringify(result))).catch((error)=>{ console.error(error); process.exitCode=1; });
}
