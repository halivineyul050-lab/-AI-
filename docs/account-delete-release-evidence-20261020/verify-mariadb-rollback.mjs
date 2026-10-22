import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteUserAccount } from '/opt/nikai-ai/backend/database.mjs';
import { openMariaDatabase } from '/opt/nikai-ai/backend/mariadb-compat.mjs';

const db = openMariaDatabase();
const id = randomUUID();
let started = false;
try {
  db.exec('BEGIN IMMEDIATE');
  started = true;
  db.prepare(`INSERT INTO users(id,email,normalized_email,display_name,password_hash,password_salt,consent_version)
    VALUES(?,?,?,?,?,?,?)`).run(id, `${id}@example.invalid`, `${id}@example.invalid`, 'transaction-only deletion verification', 'not-a-login-hash', 'not-a-login-salt', 'test');
  db.prepare('INSERT INTO credit_wallets(user_id,balance,frozen) VALUES(?,60,0)').run(id);
  db.prepare('INSERT INTO credit_gift_claims(user_id,created_at) VALUES(?,?)').run(id, '2026-10-20T00:00:00Z');
  db.prepare('INSERT INTO credit_ledger(id,user_id,kind,amount,created_at) VALUES(?,?,?,?,?)').run(randomUUID(), id, 'verification_gift', 60, '2026-10-20T00:00:00Z');
  db.prepare('INSERT INTO credit_grants(id,user_id,credits,reason,actor,request_id,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), id, 1, 'transaction-only verification', 'release-verification', randomUUID(), '2026-10-20T00:00:00Z');
  // Keep deleteUserAccount's transaction real while containing it in an outer rollback.
  const nested = {
    backend: 'mariadb',
    prepare: sql => db.prepare(sql),
    exec(sql) {
      const statements = {
        'BEGIN IMMEDIATE': 'SAVEPOINT account_delete_verification',
        COMMIT: 'RELEASE SAVEPOINT account_delete_verification',
        ROLLBACK: 'ROLLBACK TO SAVEPOINT account_delete_verification'
      };
      return db.exec(statements[sql] || sql);
    }
  };
  assert.equal(deleteUserAccount(nested, id), true);
  for (const table of ['users', 'credit_wallets', 'credit_gift_claims', 'credit_ledger', 'credit_grants']) {
    const key = table === 'users' ? 'id' : 'user_id';
    assert.equal(Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${key}=?`).get(id).n), 0, table);
  }
  console.log('MariaDB account and credit cleanup verified with synthetic rows inside an uncommitted outer transaction');
} finally {
  if (started) db.exec('ROLLBACK');
  db.close();
}
