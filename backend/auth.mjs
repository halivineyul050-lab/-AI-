import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./validation.mjs";

export const authCookieName = "nikai_auth";
export const authSessionMaxAgeSeconds = 30 * 24 * 60 * 60;

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

const scrypt = promisify(scryptCallback);

async function passwordDigest(password, salt) {
  return (await scrypt(password, salt, 64)).toString("hex");
}

function serializeUser(row, db) {
  const avatar = db.prepare("SELECT revision FROM user_avatars WHERE user_id = ?").get(row.id);
  return {
    emailVerified: Boolean(db.prepare("SELECT 1 FROM user_email_verifications WHERE user_id = ?").get(row.id)),
    avatarUrl: avatar ? `/api/v1/account/avatar?v=${avatar.revision}` : null,
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    isSuperAdmin: Boolean(row.is_super_admin),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null
  };
}

export function listUsers(db) {
  return db.prepare(`
    SELECT u.id, u.email, u.display_name, u.role, u.is_super_admin, u.status, u.created_at, u.last_login_at,
      COALESCE(w.balance, 0) AS credit_balance, COALESCE(w.frozen, 0) AS credit_frozen
    FROM users u LEFT JOIN credit_wallets w ON w.user_id = u.id
    ORDER BY u.created_at DESC
  `).all().map((row) => {
    const balance = Number(row.credit_balance);
    const frozen = Number(row.credit_frozen);
    return { ...serializeUser(row, db), credits: { balance, frozen, available: balance - frozen } };
  });
}

export function updateUserAccess(db, id, { role, status } = {}) {
  const allowedRoles = new Set(["member", "admin"]);
  const allowedStatuses = new Set(["active", "disabled"]);
  if (!allowedRoles.has(role) || !allowedStatuses.has(status)) return null;
  const result = db.prepare(`
    UPDATE users SET role = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND is_super_admin = 0
  `).run(role, status, id);
  if (!result.changes) return null;
  return serializeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id), db);
}

function createSession(db, userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + authSessionMaxAgeSeconds * 1000).toISOString();
  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(randomUUID(), userId, tokenHash(token), expiresAt);
  return { token, expiresAt };
}

export async function registerUser(db, input, { authorize, emailVerified = false } = {}) {
  const existing = db.prepare("SELECT 1 FROM users WHERE normalized_email = ?").get(input.normalizedEmail);
  if (existing) throw new HttpError(409, "email_registered", "该邮箱已经注册");
  const id = randomUUID();
  const salt = randomBytes(16).toString("hex");
  const digest = await passwordDigest(input.password, salt);
  return authTransaction(db, () => {
  authorize?.();
  db.prepare(`
    INSERT INTO users (
      id, email, normalized_email, display_name, password_hash, password_salt, consent_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.email, input.normalizedEmail, input.displayName, digest, salt, input.consentVersion);
  if (emailVerified) db.prepare("INSERT INTO user_email_verifications (user_id,verified_at) VALUES (?,?)").run(id,new Date().toISOString());
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return { user: serializeUser(row, db), ...createSession(db, id) };
  });
}

function authTransaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try { const result=callback(); db.exec("COMMIT"); return result; }
  catch(error){ db.exec("ROLLBACK"); throw error; }
}

export function markUserEmailVerified(db,userId,authorize) {
  return authTransaction(db,()=>{
    authorize();
    db.prepare("INSERT INTO user_email_verifications (user_id,verified_at) VALUES (?,?) ON CONFLICT(user_id) DO NOTHING").run(userId,new Date().toISOString());
    return serializeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(userId),db);
  });
}

export async function resetUserPassword(db,email,password,authorize) {
  const salt=randomBytes(16).toString("hex"); const hash=await passwordDigest(password,salt);
  return authTransaction(db,()=>{
    authorize();
    const row=db.prepare("SELECT users.id FROM users JOIN user_email_verifications ON users.id = user_email_verifications.user_id WHERE normalized_email = ? AND status = 'active'").get(email);
    if(!row)throw new HttpError(422,"invalid_email_code","验证码错误、已过期或已使用，请重新获取");
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?").run(hash,salt,new Date().toISOString(),row.id);
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(row.id);
    return {reset:true};
  });
}

export async function loginUser(db, input) {
  const row = db.prepare("SELECT * FROM users WHERE normalized_email = ? AND status = 'active'").get(input.normalizedEmail);
  const candidate = await passwordDigest(input.password, row ? row.password_salt : "invalid-user-salt");
  const expected = row?.password_hash || "0".repeat(128);
  const valid = candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
  if (!row || !valid) throw new HttpError(401, "invalid_credentials", "邮箱或密码不正确");
  db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(row.id);
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(row.id);
  return { user: serializeUser(updated, db), ...createSession(db, row.id) };
}

export async function verifyUserPassword(db, userId, password) {
  const row = db.prepare("SELECT password_hash, password_salt FROM users WHERE id = ? AND status = 'active'").get(userId);
  const candidate = await passwordDigest(typeof password === "string" ? password : "", row?.password_salt || "invalid-user-salt");
  const expected = row?.password_hash || "0".repeat(128);
  return Boolean(row && candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)));
}

export function getUserBySession(db, token) {
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(String(token || ""))) return null;
  const row = db.prepare(`
    SELECT users.*, auth_sessions.id AS session_id, auth_sessions.last_seen_at AS session_last_seen_at
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ?
      AND auth_sessions.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND users.status = 'active'
  `).get(tokenHash(token));
  if (!row) return null;
  const lastSeenAt = Date.parse(row.session_last_seen_at || "");
  if (!Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt >= 5 * 60_000) {
    db.prepare("UPDATE auth_sessions SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(row.session_id);
  }
  return serializeUser(row, db);
}

export function logoutUser(db, token) {
  if (!token) return false;
  return Number(db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash(token)).changes) > 0;
}
