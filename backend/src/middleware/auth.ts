import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import {
  isSupabaseConfigured, looksLikeSupabaseToken, verifySupabaseAccess,
  fetchActiveRoles, isAdminRole,
} from '../auth/supabase.js';
import { verifyAccess, type AccessPayload } from '../auth/jwt.js';
import { findById, toPublicUser, type PublicUser } from '../auth/users.js';
import { resolveCanonicalUserFromSupabase } from '../auth/identity.js';

let warnedNoSecret = false;

/**
 * Authenticated request principal attached by `requireAuth`.
 * `kind: 'service'` indicates the request was authorized via `APP_SECRET`
 * (machine-to-machine); `kind: 'user'` indicates a valid user JWT and
 * the resolved public user object.
 */
export type AuthPrincipal =
  | { kind: 'service' }
  | {
      kind: 'user';
      /** 这张 token 是哪条链路签发的。授权分支按它判断，**不要**再去重解析请求头。 */
      authSource: 'supabase' | 'legacy';
      /**
       * 认证身份。Supabase 路径下是 Supabase UUID，legacy 路径下是 SQLite users.id。
       *
       * ★ AUTH-M7 / D-1：角色现查（fetchActiveRoles）必须用这个 id，
       *   **不能**用 principal.user.id。Supabase 的 user_roles 按 Supabase UUID
       *   索引，传 canonical SQLite id 会查不到任何行 → roles 恒为空 →
       *   所有管理员静默掉权。方向是 fail closed，但故障完全无声。
       */
      authId: string;
      /**
       * canonical AMAS 业务身份，永远来自 SQLite users。
       * 业务路由只认 user.id / user.name / user.avatar；token 里的 profile
       * （名字、头像、role）不得进入业务数据。
       */
      user: PublicUser;
      payload: AccessPayload;
    };

// Augment Express's Request to carry the resolved principal.
declare module 'express-serve-static-core' {
  interface Request {
    principal?: AuthPrincipal;
  }
}

/**
 * Verify a bearer token against `config.appSecret` using a constant-time
 * comparison. When `APP_SECRET` is unset (dev mode), this is a no-op so local
 * development continues to work — a single warning is printed at startup via
 * `warnIfNoAppSecret()`.
 */
export function requireAppSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = config.appSecret;
  if (!expected) {
    // Dev mode — no auth enforced.
    next();
    return;
  }

  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }
  const presented = match[1].trim();

  if (!constantTimeStringEqual(presented, expected)) {
    res.status(401).json({ error: 'Invalid bearer token.' });
    return;
  }
  next();
}

/**
 * Verify an `?token=...` query string parameter against `config.appSecret`,
 * for endpoints (such as WebSocket upgrades) where the client cannot set
 * arbitrary HTTP headers. Returns true if the request should be allowed.
 */
export function checkWsAuthToken(token: string | null | undefined): boolean {
  const expected = config.appSecret;
  if (!expected) return true; // dev mode
  if (!token) return false;
  return constantTimeStringEqual(token, expected);
}

function constantTimeStringEqual(a: string, b: string): boolean {
  // crypto.timingSafeEqual requires equal-length buffers, so we hash both
  // strings first — this also masks the length of the secret.
  const ah = crypto.createHash('sha256').update(a).digest();
  const bh = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

/** Print a one-time warning at server startup if APP_SECRET is unset. */
export function warnIfNoAppSecret(): void {
  if (config.appSecret) return;
  if (warnedNoSecret) return;
  warnedNoSecret = true;
  console.warn(
    '[amas-backend] WARNING: APP_SECRET is not set — bearer-token auth is DISABLED. ' +
    'This is fine for local development but MUST be set in production.',
  );
}

/** Print a one-time warning at startup if JWT_SECRET wasn't explicitly set. */
let warnedJwt = false;
export function warnIfJwtDerived(): void {
  if (warnedJwt) return;
  warnedJwt = true;
  if (config.jwt.source === 'env') return;
  if (config.jwt.source === 'derived') {
    console.warn(
      '[amas-backend] WARNING: JWT_SECRET is not set — derived from APP_SECRET. ' +
      'Set JWT_SECRET to a dedicated random value in production.',
    );
  } else {
    console.warn(
      '[amas-backend] WARNING: JWT_SECRET is not set and APP_SECRET is also unset — ' +
      'using an ephemeral random secret. All issued tokens become invalid on restart.',
    );
  }
}

/**
 * Authorize a request via either a valid `APP_SECRET` bearer (service /
 * machine clients) OR a valid user access JWT (end users). On success the
 * resolved principal is attached to `req.principal` and the next handler
 * is invoked. On failure responds 401.
 *
 * Note: in dev mode (APP_SECRET unset) we still try the JWT path; if no
 * Authorization header is present at all, the request is allowed through
 * as `service` so existing dev workflows continue to work.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const presented = match ? match[1].trim() : '';

  // ★ AUTH-M2 修复：原实现在「无 Authorization 头且未配置 APP_SECRET」时
  //   把请求当作 service principal 放行。一旦部署时忘记设 APP_SECRET，
  //   任何匿名请求都会拿到机器权限。改为 fail closed —— 没有凭据一律 401。
  if (!presented) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }

  // 1) APP_SECRET（机器对机器），常数时间比较
  if (config.appSecret && constantTimeStringEqual(presented, config.appSecret)) {
    req.principal = { kind: 'service' };
    next();
    return;
  }

  // 2) Supabase token（统一身份，D-2B-1 方案 A）
  //    按 iss 分流：是 Supabase 的就只走 Supabase 验签，失败即 401，
  //    **绝不回退到 legacy 验签**——迁移期两条链路互不兜底。
  if (isSupabaseConfigured() && looksLikeSupabaseToken(presented)) {
    let payload;
    try {
      payload = await verifySupabaseAccess(presented);
    } catch {
      // 验签失败 = 认证失败。401。
      res.status(401).json({ error: 'Invalid bearer token.' });
      return;
    }

    // ★ AUTH-M7：验签通过只说明这是一个真实的 Supabase 账号，
    //   **不说明**这个人是 AMAS 学员。必须解析出 canonical AMAS 身份，
    //   解析不出就 fail closed —— 不自动 provision（产品决策，已定）。
    //
    //   这里刻意与「认证失败」分开：token 有效但无 AMAS 身份是 403，
    //   不是 401。客户端据此知道「重新登录没用，你需要走申请/录取流程」。
    const resolved = resolveCanonicalUserFromSupabase(payload.sub);
    if (!resolved.ok || !resolved.user) {
      // 原因只进服务端日志：对外区分「没有映射」与「映射被禁用」，
      // 等于把某个 Supabase 账号是否已登记泄漏给任何持有效 token 的人。
      console.warn(
        `[auth] IDENTITY_NOT_PROVISIONED reason=${resolved.reason}` +
        `${resolved.detail ? ` detail=${resolved.detail}` : ''} authId=${payload.sub}`,
      );
      res.status(403).json({
        error: 'This account is not provisioned for AMAS.',
        code: 'IDENTITY_NOT_PROVISIONED',
      });
      return;
    }

    req.principal = {
      kind: 'user',
      authSource: 'supabase',
      authId: payload.sub,
      user: resolved.user,
      payload: payload as unknown as AccessPayload,
    };
    next();
    return;
  }

  // 3) Legacy 自签 token（AUTH-M7 删除；可用 AUTH_ACCEPT_LEGACY=false 提前演练）
  if (!config.supabase.acceptLegacy) {
    res.status(401).json({ error: 'Legacy tokens are no longer accepted.' });
    return;
  }
  try {
    const payload = await verifyAccess(presented);
    const user = findById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }
    // legacy 自签 token：认证身份与业务身份本来就是同一个 SQLite id。
    req.principal = {
      kind: 'user',
      authSource: 'legacy',
      authId: user.id,
      user: toPublicUser(user),
      payload,
    };
    next();
    return;
  } catch {
    res.status(401).json({ error: 'Invalid bearer token.' });
  }
}

/**
 * Wraps `requireAuth` and additionally enforces that the principal is a
 * logged-in user with `role === 'admin'`. Service-token (APP_SECRET)
 * callers are also accepted as machine-admin so internal tooling can
 * still operate against admin endpoints.
 *
 * Responds 403 if the caller is authenticated but lacks admin role.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await new Promise<void>(resolve => {
    requireAuth(req, res, () => resolve());
  });
  // If requireAuth already sent a response (401), headersSent is true and
  // we must not continue.
  if (res.headersSent) return;

  const principal = req.principal;
  if (!principal) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (principal.kind === 'service') {
    // Service token is treated as machine-admin.
    next();
    return;
  }

  // AUTH-M4：授权以 Supabase 角色为准，**每次现查**（角色撤销即时生效）。
  // 客户端声明的 role / email / userId 一律不可信；JWT 里的 role 只作展示。
  //
  // ★ AUTH-M7 两处改动：
  //   1. 分支条件改用 principal.authSource，不再重新解析 Authorization 头。
  //      重解析既脆弱（与 requireAuth 的判定可能不一致），也没有必要。
  //   2. 角色现查用 principal.authId（Supabase UUID），**不是** principal.user.id
  //      （canonical SQLite id）。user_roles 按 Supabase UUID 索引，传错 id
  //      会静默返回空数组，所有管理员无声掉权。
  if (principal.authSource === 'supabase') {
    const roles = await fetchActiveRoles(principal.authId);
    if (!isAdminRole(roles)) {
      res.status(403).json({ error: 'Admin role required.' });
      return;
    }
    next();
    return;
  }

  // Legacy 路径（AUTH-M7 之后仍保留，直到 legacy token 整体下线）。
  // ★ 只有 legacy principal 才允许用 SQLite users.role 判权限。
  //   Supabase 路径下 principal.user.role 只是展示字段，绝不能到这里来。
  if (principal.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin role required.' });
    return;
  }
  next();
}
