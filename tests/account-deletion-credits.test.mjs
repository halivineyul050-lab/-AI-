import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, deleteUserAccount } from '../backend/database.mjs';
import { createCreditStore } from '../backend/credits.mjs';

function setup(t, foreignKeys = true) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  if (!foreignKeys) db.exec('PRAGMA foreign_keys = OFF');
  for (const id of ['member', 'other', 'protected']) {
    db.prepare(`INSERT INTO users(id,email,normalized_email,display_name,password_hash,password_salt,consent_version,is_super_admin)
      VALUES(?,?,?,?,?,?,?,?)`).run(id, `${id}@example.com`, `${id}@example.com`, id, 'hash', 'salt', '2026-10', id === 'protected' ? 1 : 0);
    db.prepare('INSERT INTO user_email_verifications VALUES(?,?)').run(id, 'now');
  }
  const credits = createCreditStore(db);
  for (const id of ['member', 'other', 'protected']) {
    credits.wallet(id);
    credits.grant({ userId: id, credits: 20, reason: 'test', requestId: `grant-${id}` }, 'admin');
  }
  return { db, credits };
}

for (const foreignKeys of [true, false]) {
  test(`account deletion removes credit records with foreign keys ${foreignKeys ? 'enabled' : 'absent'}`, t => {
    const { db, credits } = setup(t, foreignKeys);
    const [code] = credits.createCodes({ credits: 10 }, 'member');
    credits.redeem('member', code.code);
    db.prepare(`INSERT INTO credit_reservations(id,user_id,request_id,count,unit_credits,reserved_credits,created_at)
      VALUES('reservation','member','request',1,1,1,'now')`).run();
    db.prepare(`INSERT INTO image_generation_jobs(id,user_id,reservation_id,created_at,expires_at)
      VALUES('job','member','reservation','now',9999999999)`).run();
    db.prepare("INSERT INTO credit_purchase_claims VALUES('member','order','now')").run();

    assert.equal(deleteUserAccount(db, 'member'), true);
    for (const table of ['users', 'credit_grants', 'credit_wallets', 'credit_ledger', 'credit_gift_claims', 'credit_purchase_claims', 'credit_reservations', 'image_generation_jobs']) {
      const column = table === 'users' ? 'id' : 'user_id';
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`).get('member').n, 0, table);
    }
    assert.equal(credits.wallet('other').balance, 80);
    assert.equal(credits.listGrants().some(row => row.user_id === 'other'), true);
    assert.throws(() => credits.redeem('other', code.code), error => error.code === 'credit_code_invalid');
    assert.equal(db.prepare('SELECT redeemed_by FROM credit_codes WHERE id=?').get(code.id).redeemed_by, null);
    assert.equal(db.prepare('SELECT created_by FROM credit_codes WHERE id=?').get(code.id).created_by, null);
    assert.equal(deleteUserAccount(db, 'member'), false);
  });
}

test('a verified account with only its registration gift leaves no wallet or ledger', t => {
  const { db } = setup(t);
  db.prepare("DELETE FROM credit_grants WHERE user_id='member'").run();
  db.prepare("DELETE FROM credit_ledger WHERE user_id='member' AND kind='admin_grant'").run();
  db.prepare("UPDATE credit_wallets SET balance=60 WHERE user_id='member'").run();
  assert.equal(deleteUserAccount(db, 'member'), true);
  for (const table of ['credit_wallets', 'credit_ledger', 'credit_gift_claims']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id='member'`).get().n, 0, table);
  }
});

test('protected and missing accounts never lose credit data', t => {
  const { db, credits } = setup(t);
  assert.equal(deleteUserAccount(db, 'protected'), false);
  assert.equal(deleteUserAccount(db, 'missing'), false);
  assert.equal(credits.wallet('protected').balance, 80);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM credit_grants WHERE user_id='protected'").get().n, 1);
});

test('a deletion failure rolls back account and credit cleanup together', t => {
  const { db } = setup(t);
  db.exec("CREATE TRIGGER fail_account_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'forced delete failure'); END");
  assert.throws(() => deleteUserAccount(db, 'member'), /forced delete failure/);
  for (const table of ['credit_grants', 'credit_wallets', 'credit_ledger', 'credit_gift_claims']) {
    assert.ok(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id='member'`).get().n > 0, table);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE id='member'").get().n, 1);
});
