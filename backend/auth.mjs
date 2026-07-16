import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { HttpError } from "./validation.mjs";

export const authCookieName = "nikai_auth";
export const authSessionMaxAgeSeconds = 30 * 24 * 60 * 60;

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function passwordDigest(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function serializeUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null
  };
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

export function registerUser(db, input) {
  const existing = db.prepare("SELECT 1 FROM users WHERE normalized_email = ?").get(input.normalizedEmail);
  if (existing) throw new HttpError(409, "email_registered", "该邮箱已经注册");
  const id = randomUUID();
  const salt = randomBytes(16).toString("hex");
  db.prepare(`
    INSERT INTO users (
      id, email, normalized_email, display_name, password_hash, password_salt, consent_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.email, input.normalizedEmail, input.displayName, passwordDigest(input.password, salt), salt, input.consentVersion);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return { user: serializeUser(row), ...createSession(db, id) };
}

export function loginUser(db, input) {
  const row = db.prepare("SELECT * FROM users WHERE normalized_email = ? AND status = 'active'").get(input.normalizedEmail);
  const candidate = row ? passwordDigest(input.password, row.password_salt) : passwordDigest(input.password, "invalid-user-salt");
  const expected = row?.password_hash || "0".repeat(128);
  const valid = candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
  if (!row || !valid) throw new HttpError(401, "invalid_credentials", "邮箱或密码不正确");
  db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(row.id);
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(row.id);
  return { user: serializeUser(updated), ...createSession(db, row.id) };
}

export function getUserBySession(db, token) {
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(String(token || ""))) return null;
  const row = db.prepare(`
    SELECT users.*, auth_sessions.id AS session_id
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ?
      AND auth_sessions.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND users.status = 'active'
  `).get(tokenHash(token));
  if (!row) return null;
  db.prepare("UPDATE auth_sessions SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(row.session_id);
  return serializeUser(row);
}

export function logoutUser(db, token) {
  if (!token) return false;
  return Number(db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash(token)).changes) > 0;
}
