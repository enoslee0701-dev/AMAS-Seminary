import crypto from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config.js';
import { db } from '../db.js';

/**
 * Token lifetimes. Access tokens are short (15 min) so a leak is contained,
 * refresh tokens are long (30 days) so users don't have to re-enter
 * credentials. Rotation on every /refresh limits replay window.
 */
const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

const HS256 = 'HS256' as const;
const ISS = 'amas-backend';
const AUD = 'amas-app';

let cachedKey: Uint8Array | null = null;
function getKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = config.jwt.secret;
  if (!secret) {
    throw new Error('JWT secret is not configured.');
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export interface AccessPayload extends JWTPayload {
  sub: string;
  email: string;
  role: 'student' | 'admin';
  type: 'access';
}

export interface RefreshPayload extends JWTPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

/**
 * Refresh-token revocation store, now backed by the SQLite `refresh_jti`
 * table. Only tokens whose `(user_id, jti)` row exists are accepted on
 * `/refresh`. On logout (or rotation) we DELETE the row, which
 * invalidates the refresh token even though its signature is still
 * valid until expiry.
 *
 * This survives server restarts — refresh tokens issued before a
 * restart now keep working (previously they were dropped).
 */
const stmtAddJti = db.prepare<[string, string]>(
  'INSERT OR IGNORE INTO refresh_jti (user_id, jti) VALUES (?, ?)',
);
const stmtRemoveJti = db.prepare<[string, string]>(
  'DELETE FROM refresh_jti WHERE user_id = ? AND jti = ?',
);
const stmtRemoveAllJtiForUser = db.prepare<[string]>(
  'DELETE FROM refresh_jti WHERE user_id = ?',
);
const stmtHasJti = db.prepare<[string, string], { x: number }>(
  'SELECT 1 AS x FROM refresh_jti WHERE user_id = ? AND jti = ? LIMIT 1',
);

function addJti(userId: string, jti: string): void {
  stmtAddJti.run(userId, jti);
}

function removeJti(userId: string, jti: string): boolean {
  const info = stmtRemoveJti.run(userId, jti);
  return info.changes > 0;
}

function hasJti(userId: string, jti: string): boolean {
  return stmtHasJti.get(userId, jti) !== undefined;
}

/** Test-only: wipe all sessions. */
export function _resetSessions(): void {
  db.prepare('DELETE FROM refresh_jti').run();
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

/**
 * Issue a fresh access + refresh pair for a user. The refresh token's jti
 * is registered in the `refresh_jti` table so it can be revoked later via
 * `revokeRefresh()`.
 */
export async function issueTokens(user: {
  id: string;
  email: string;
  role: 'student' | 'admin';
}): Promise<IssuedTokens> {
  const now = Math.floor(Date.now() / 1000);
  const key = getKey();

  const accessPayload: AccessPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
  };
  const accessToken = await new SignJWT(accessPayload)
    .setProtectedHeader({ alg: HS256 })
    .setIssuedAt(now)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime(now + ACCESS_TTL_SEC)
    .sign(key);

  const jti = crypto.randomBytes(16).toString('hex');
  const refreshPayload: RefreshPayload = {
    sub: user.id,
    type: 'refresh',
    jti,
  };
  const refreshToken = await new SignJWT(refreshPayload)
    .setProtectedHeader({ alg: HS256 })
    .setIssuedAt(now)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime(now + REFRESH_TTL_SEC)
    .setJti(jti)
    .sign(key);
  addJti(user.id, jti);

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: now + ACCESS_TTL_SEC,
    refreshExpiresAt: now + REFRESH_TTL_SEC,
  };
}

/** Verify an access token's signature, expiry, type, iss, aud. */
export async function verifyAccess(token: string): Promise<AccessPayload> {
  const { payload } = await jwtVerify(token, getKey(), {
    issuer: ISS,
    audience: AUD,
    algorithms: [HS256],
  });
  if (payload.type !== 'access') {
    throw new Error('Wrong token type.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Missing subject.');
  }
  return payload as AccessPayload;
}

/**
 * Verify a refresh token's signature/expiry AND that its jti is still
 * present in the active set. Throws on any failure (caller should map
 * to 401).
 */
export async function verifyRefresh(token: string): Promise<RefreshPayload> {
  const { payload } = await jwtVerify(token, getKey(), {
    issuer: ISS,
    audience: AUD,
    algorithms: [HS256],
  });
  if (payload.type !== 'refresh') {
    throw new Error('Wrong token type.');
  }
  const sub = payload.sub;
  const jti = payload.jti;
  if (typeof sub !== 'string' || typeof jti !== 'string') {
    throw new Error('Missing sub/jti.');
  }
  if (!hasJti(sub, jti)) {
    throw new Error('Refresh token revoked.');
  }
  return payload as RefreshPayload;
}

/** Revoke a specific refresh jti (e.g., on logout or rotation). */
export function revokeRefresh(userId: string, jti: string): boolean {
  return removeJti(userId, jti);
}

/** Revoke ALL refresh tokens for a user (e.g., on password reset). */
export function revokeAllRefreshForUser(userId: string): void {
  stmtRemoveAllJtiForUser.run(userId);
}
