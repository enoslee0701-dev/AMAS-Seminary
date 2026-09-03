import type { Express, Request, Response } from 'express';
import {
  createUser,
  findByEmail,
  findById,
  setPassword,
  updateProfile,
  verifyPassword,
  toPublicUser,
} from '../auth/users.js';
import {
  issueTokens,
  verifyAccess,
  verifyRefresh,
  revokeRefresh,
} from '../auth/jwt.js';
import { authLimiter } from '../middleware/rateLimit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RegisterBody {
  email?: string;
  password?: string;
  name?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

interface RefreshBody {
  refreshToken?: string;
}

interface LogoutBody {
  refreshToken?: string;
}

function validateRegister(body: RegisterBody): string | null {
  if (!body.email || typeof body.email !== 'string') return 'Email is required.';
  if (!EMAIL_RE.test(body.email)) return 'Invalid email format.';
  if (!body.password || typeof body.password !== 'string') return 'Password is required.';
  if (body.password.length < 8) return 'Password must be at least 8 characters.';
  if (body.password.length > 256) return 'Password is too long.';
  if (!body.name || typeof body.name !== 'string') return 'Name is required.';
  const trimmedName = body.name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 64) return 'Name must be 1-64 characters.';
  return null;
}

function bearer(req: Request): string | null {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/**
 * Register all `/api/auth/*` routes. These are intentionally registered
 * BEFORE any service-secret middleware so that signup/login don't need
 * the shared APP_SECRET (registration is public).
 *
 * `authLimiter` (10/min/IP) is applied to register + login to slow brute
 * force. /refresh, /logout, /me are protected by token validity itself.
 */
export function registerAuthRoutes(app: Express): void {
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const body = (req.body ?? {}) as RegisterBody;
    const err = validateRegister(body);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
    try {
      const user = createUser({
        email: body.email!,
        password: body.password!,
        name: body.name!.trim(),
      });
      const tokens = await issueTokens({ id: user.id, email: user.email, role: user.role });
      res.status(200).json({
        user: toPublicUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      });
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === 'EMAIL_TAKEN') {
        res.status(409).json({ error: 'Email already registered.' });
        return;
      }
      console.error('[auth/register]', e);
      res.status(500).json({ error: 'Registration failed.' });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const body = (req.body ?? {}) as LoginBody;
    if (!body.email || !body.password || typeof body.email !== 'string' || typeof body.password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const user = findByEmail(body.email);
    if (!user || !verifyPassword(user, body.password)) {
      // Identical error message on missing-user vs wrong-password to avoid
      // user enumeration via timing/response differences.
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }
    try {
      const tokens = await issueTokens({ id: user.id, email: user.email, role: user.role });
      res.status(200).json({
        user: toPublicUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      });
    } catch (e) {
      console.error('[auth/login]', e);
      res.status(500).json({ error: 'Login failed.' });
    }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    const body = (req.body ?? {}) as RefreshBody;
    if (!body.refreshToken || typeof body.refreshToken !== 'string') {
      res.status(400).json({ error: 'refreshToken is required.' });
      return;
    }
    let payload;
    try {
      payload = await verifyRefresh(body.refreshToken);
    } catch {
      res.status(401).json({ error: 'Invalid or revoked refresh token.' });
      return;
    }
    const user = findById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }
    // Rotation: revoke the old jti, mint a new pair. The new refresh token's
    // jti is automatically registered by issueTokens.
    revokeRefresh(payload.sub, payload.jti);
    try {
      const tokens = await issueTokens({ id: user.id, email: user.email, role: user.role });
      res.status(200).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      });
    } catch (e) {
      console.error('[auth/refresh]', e);
      res.status(500).json({ error: 'Token refresh failed.' });
    }
  });

  app.post('/api/auth/change-password', async (req, res) => {
    // Requires a valid access token. Verifies the old password (constant-time)
    // before swapping the hash. Does NOT auto-revoke other sessions; if the
    // user wants every device kicked, they should call /logout per session.
    const token = bearer(req);
    if (!token) {
      res.status(401).json({ error: 'Missing bearer access token.' });
      return;
    }
    let payload;
    try {
      payload = await verifyAccess(token);
    } catch {
      res.status(401).json({ error: 'Invalid access token.' });
      return;
    }
    const body = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    const oldPw = body.oldPassword;
    const newPw = body.newPassword;
    if (!oldPw || typeof oldPw !== 'string' || !newPw || typeof newPw !== 'string') {
      res.status(400).json({ error: 'oldPassword and newPassword are required.' });
      return;
    }
    if (newPw.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    const user = findById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }
    if (!verifyPassword(user, oldPw)) {
      res.status(401).json({ error: 'Old password is incorrect.' });
      return;
    }
    setPassword(user, newPw);
    res.status(200).json({ ok: true });
  });

  app.post('/api/auth/logout', async (req, res) => {
    // Requires a valid access token (Bearer) to authorize the logout — so
    // a stolen refresh token alone can't revoke arbitrary sessions.
    const token = bearer(req);
    if (!token) {
      res.status(401).json({ error: 'Missing bearer access token.' });
      return;
    }
    try {
      await verifyAccess(token);
    } catch {
      res.status(401).json({ error: 'Invalid access token.' });
      return;
    }
    const body = (req.body ?? {}) as LogoutBody;
    if (body.refreshToken && typeof body.refreshToken === 'string') {
      try {
        const payload = await verifyRefresh(body.refreshToken);
        revokeRefresh(payload.sub, payload.jti);
      } catch {
        // Token already invalid — idempotent success.
      }
    }
    res.status(200).json({ ok: true });
  });

  // POST /api/auth/_promote 已于 AUTH-M3 移除（2026-09-03）。
  //
  // 原实现由 APP_SECRET 把关，可把任意账号提升为 admin。Supabase roles 成为
  // 授权的唯一 Source of Truth 之后，这条旧路径就是**第二套权限入口**——
  // 即便只在开发/测试中使用，也不得在生产代码里保留隐藏开关。
  // 测试构造管理员改为直接给测试自己的 fixture 数据库播种，不经任何 HTTP 端点。

  app.get('/api/auth/me', async (req, res) => {
    const token = bearer(req);
    if (!token) {
      res.status(401).json({ error: 'Missing bearer access token.' });
      return;
    }
    let payload;
    try {
      payload = await verifyAccess(token);
    } catch {
      res.status(401).json({ error: 'Invalid access token.' });
      return;
    }
    const user = findById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }
    res.status(200).json({ user: toPublicUser(user) });
  });

  /**
   * PATCH /api/auth/me — update the authed user's profile.
   *
   * Body (all optional): { name?, degree?, bio?, avatar? }. Only those four
   * fields can be changed here; email/role/password are intentionally NOT
   * mutable through this endpoint (use /change-password for password, and
   * APP_SECRET-gated tools for role).
   *
   * Validation is delegated to `updateProfile` so the rules are colocated
   * with the storage layer. Validation failures surface as a thrown Error
   * with `code = 'INVALID_PROFILE'`, which we map to 400.
   */
  app.patch('/api/auth/me', async (req, res) => {
    const token = bearer(req);
    if (!token) {
      res.status(401).json({ error: 'Missing bearer access token.' });
      return;
    }
    let payload;
    try {
      payload = await verifyAccess(token);
    } catch {
      res.status(401).json({ error: 'Invalid access token.' });
      return;
    }
    const body = (req.body ?? {}) as {
      name?: unknown;
      degree?: unknown;
      bio?: unknown;
      avatar?: unknown;
    };
    // Build a typed patch with only the fields explicitly present in the
    // request body. `undefined` means "leave it alone", so we must not
    // forward keys the client didn't send.
    const patch: { name?: string; degree?: string; bio?: string; avatar?: string } = {};
    if ('name' in body) patch.name = body.name as string;
    if ('degree' in body) patch.degree = body.degree as string;
    if ('bio' in body) patch.bio = body.bio as string;
    if ('avatar' in body) patch.avatar = body.avatar as string;
    try {
      const updated = updateProfile(payload.sub, patch);
      if (!updated) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.status(200).json({ user: toPublicUser(updated) });
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === 'INVALID_PROFILE') {
        res.status(400).json({ error: (e as Error).message });
        return;
      }
      console.error('[auth/patch-me]', e);
      res.status(500).json({ error: 'Profile update failed.' });
    }
  });
}
