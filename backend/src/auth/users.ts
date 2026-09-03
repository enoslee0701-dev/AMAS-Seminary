import crypto from 'node:crypto';
import { db } from '../db.js';

/**
 * Per-user record. Persisted to SQLite via the `users` table; the
 * public API of this module (createUser/findByEmail/…) intentionally
 * matches the original in-memory implementation 1:1 so callers don't
 * need to change. A future Postgres swap can be done by replacing the
 * prepared statements in this file.
 */
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  role: 'student' | 'admin';
  degree?: string;
  avatar?: string;
  bio?: string;
}

/**
 * Public-facing user shape. Strips secrets (`passwordHash`, `salt`) and
 * is what the HTTP layer should return to clients.
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin';
  createdAt: number;
  degree?: string;
  avatar?: string;
  bio?: string;
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

/**
 * Row shape as returned by SQLite. The `?: null` fields come back as
 * `null` (not `undefined`) — we normalize on the way out.
 */
interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  salt: string;
  role: 'student' | 'admin';
  degree: string | null;
  avatar: string | null;
  bio: string | null;
  created_at: number;
}

function rowToRecord(row: UserRow): UserRecord {
  const rec: UserRecord = {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    salt: row.salt,
    createdAt: row.created_at,
    role: row.role,
  };
  if (row.degree !== null) rec.degree = row.degree;
  if (row.avatar !== null) rec.avatar = row.avatar;
  if (row.bio !== null) rec.bio = row.bio;
  return rec;
}

const stmtInsertUser = db.prepare<[
  string, string, string, string, string, 'student' | 'admin',
  string | null, string | null, string | null, number,
]>(`
  INSERT INTO users (id, email, name, password_hash, salt, role, degree, avatar, bio, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtFindByEmail = db.prepare<[string], UserRow>(
  'SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
);
const stmtFindById = db.prepare<[string], UserRow>(
  'SELECT * FROM users WHERE id = ? LIMIT 1',
);
const stmtUpdateRole = db.prepare<[
  'student' | 'admin', string,
]>('UPDATE users SET role = ? WHERE id = ?');
const stmtUpdatePassword = db.prepare<[
  string, string, string,
]>('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?');
const stmtUpdateProfile = db.prepare<[
  string, string | null, string | null, string | null, string,
]>(`UPDATE users SET name = ?, degree = ?, bio = ?, avatar = ? WHERE id = ?`);

function hashPassword(password: string, salt: string): string {
  return crypto
    .scryptSync(password, salt, HASH_BYTES, SCRYPT_PARAMS)
    .toString('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
    degree: u.degree,
    avatar: u.avatar,
    bio: u.bio,
  };
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role?: 'student' | 'admin';
  degree?: string;
  avatar?: string;
}

/**
 * Create a new user. Throws if the email is already registered.
 * Caller is responsible for validating inputs (length, format) — this
 * function only enforces uniqueness and hashes the password.
 */
export function createUser(input: CreateUserInput): UserRecord {
  const email = normalizeEmail(input.email);
  // Pre-check for nicer error semantics; UNIQUE constraint is the
  // ultimate authority but a duplicate insert otherwise throws a
  // SqliteError with code SQLITE_CONSTRAINT_UNIQUE which we'd have to
  // map anyway.
  if (stmtFindByEmail.get(email)) {
    const err = new Error('Email already registered.');
    (err as Error & { code?: string }).code = 'EMAIL_TAKEN';
    throw err;
  }
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const passwordHash = hashPassword(input.password, salt);
  const id = crypto.randomUUID();
  const rec: UserRecord = {
    id,
    email,
    name: input.name.trim(),
    passwordHash,
    salt,
    createdAt: Date.now(),
    role: input.role ?? 'student',
    degree: input.degree,
    avatar: input.avatar,
  };
  stmtInsertUser.run(
    rec.id,
    rec.email,
    rec.name,
    rec.passwordHash,
    rec.salt,
    rec.role,
    rec.degree ?? null,
    rec.avatar ?? null,
    rec.bio ?? null,
    rec.createdAt,
  );
  return rec;
}

export function findByEmail(email: string): UserRecord | null {
  const row = stmtFindByEmail.get(normalizeEmail(email));
  return row ? rowToRecord(row) : null;
}

export function findById(id: string): UserRecord | null {
  const row = stmtFindById.get(id);
  return row ? rowToRecord(row) : null;
}

/**
 * Verify a candidate password against a stored user record using
 * constant-time comparison on the resulting hashes.
 */
export function verifyPassword(user: UserRecord, candidate: string): boolean {
  const candidateHash = hashPassword(candidate, user.salt);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function setPassword(user: UserRecord, newPassword: string): void {
  user.salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  user.passwordHash = hashPassword(newPassword, user.salt);
  stmtUpdatePassword.run(user.passwordHash, user.salt, user.id);
}

export interface UpdateProfileInput {
  name?: string;
  degree?: string;
  bio?: string;
  avatar?: string;
}

/**
 * Possible thrown error codes from `updateProfile`. Surfaced as
 * `(err as Error & { code?: string }).code` so the HTTP layer can map
 * them to 400 responses with the exact validation message.
 */
const AVATAR_PREFIX_RE = /^(https:\/\/|http:\/\/|\/api\/images\/|data:image\/)/;

function validateProfilePatch(patch: UpdateProfileInput): string | null {
  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string') return 'Name must be a string.';
    const trimmed = patch.name.trim();
    if (trimmed.length < 1 || trimmed.length > 64) return 'Name must be 1-64 characters.';
  }
  if (patch.degree !== undefined) {
    if (typeof patch.degree !== 'string') return 'Degree must be a string.';
    if (patch.degree.length > 64) return 'Degree must be ≤ 64 characters.';
  }
  if (patch.bio !== undefined) {
    if (typeof patch.bio !== 'string') return 'Bio must be a string.';
    if (patch.bio.length > 500) return 'Bio must be ≤ 500 characters.';
  }
  if (patch.avatar !== undefined) {
    if (typeof patch.avatar !== 'string') return 'Avatar must be a string.';
    if (!AVATAR_PREFIX_RE.test(patch.avatar)) {
      return 'Avatar must be a URL (http(s)://, /api/images/) or data:image/ URI.';
    }
  }
  return null;
}

/**
 * Apply a partial profile update to a user record. Returns the
 * updated `UserRecord`, or `null` if the id is unknown. Throws an Error with
 * `code = 'INVALID_PROFILE'` and a human-readable message on validation
 * failure — the route handler maps that to HTTP 400.
 *
 * Only the four whitelisted fields (name/degree/bio/avatar) are touched;
 * `email`, `role`, `passwordHash`, etc. are unaffected so this endpoint
 * cannot be abused for privilege escalation or account takeover.
 */
export function updateProfile(id: string, patch: UpdateProfileInput): UserRecord | null {
  const user = findById(id);
  if (!user) return null;
  const err = validateProfilePatch(patch);
  if (err) {
    const e = new Error(err) as Error & { code?: string };
    e.code = 'INVALID_PROFILE';
    throw e;
  }
  if (patch.name !== undefined) user.name = patch.name.trim();
  if (patch.degree !== undefined) user.degree = patch.degree;
  if (patch.bio !== undefined) user.bio = patch.bio;
  if (patch.avatar !== undefined) user.avatar = patch.avatar;
  stmtUpdateProfile.run(
    user.name,
    user.degree ?? null,
    user.bio ?? null,
    user.avatar ?? null,
    user.id,
  );
  return user;
}

/** Test-only: wipe the user store. */
export function _resetUsers(): void {
  db.prepare('DELETE FROM users').run();
}
