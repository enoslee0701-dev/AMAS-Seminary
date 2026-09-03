/**
 * AUTH-M2/M3 · Supabase 身份适配层
 *
 * 决策依据：D-2B-1 批准方案 A —— Supabase 成为 AMAS App / Portal 的统一身份与权限
 * Source of Truth。本模块是**唯一**懂 Supabase 认证细节的地方；
 * 上层 `requireAuth` / `requireAdmin` 的 `req.principal` 契约保持不变，
 * 因此 16 个路由文件与 18 个前端文件都不需要改动（见 AUTH-M1 审计 §10）。
 *
 * 验签方式：本地 JWKS（ES256 非对称）。
 *   - 不需要共享密钥，后端不必持有任何 Supabase secret 即可验证身份
 *   - jose 的 createRemoteJWKSet 内建缓存与轮转，因此**不产生每请求网络往返**
 *
 * 角色查询：只在需要授权判断时才查（requireAdmin），且**每次现查、不缓存**——
 *   角色撤销必须即时生效，这是 Portal 已验收的性质，不得在 App 侧被削弱。
 *   身份验证（requireAuth）不查角色，因此常规学习请求零额外延迟。
 *
 * ★ 普通 student 不要求 MFA：本模块**不检查 aal**。
 *   MFA / AAL2 只用于管理端敏感动作，由那些动作各自强制；
 *   普通学员的学习路径全程不需要 TOTP。
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config.js';

export interface SupabasePayload extends JWTPayload {
  sub: string;
  email?: string;
  aal?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

/** Supabase 项目已配置时为 true；未配置时本模块整体不参与鉴权。 */
export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabase.url);
}

/** Supabase access token 的签发者，用于在迁移期区分两种 token。 */
export function supabaseIssuer(): string {
  return `${config.supabase.url.replace(/\/$/, '')}/auth/v1`;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseIssuer()}/.well-known/jwks.json`));
  }
  return jwks;
}

/**
 * 验证 Supabase access token。失败一律抛错，**绝不回退到 legacy 验签**——
 * 迁移期内两种 token 各验各的，不允许"哪个能过用哪个"。
 */
export async function verifySupabaseAccess(token: string): Promise<SupabasePayload> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: supabaseIssuer(),
    audience: 'authenticated',
  });
  const p = payload as SupabasePayload;
  if (!p.sub) throw new Error('Supabase token has no subject.');
  return p;
}

/** 仅凭 token 头部/载荷的 iss 判断这是不是一张 Supabase token（不代表已验签）。 */
export function looksLikeSupabaseToken(token: string): boolean {
  if (!isSupabaseConfigured()) return false;
  try {
    const seg = token.split('.')[1];
    if (!seg) return false;
    const claims = JSON.parse(
      Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
    ) as { iss?: string };
    return claims.iss === supabaseIssuer();
  } catch {
    return false;
  }
}

/**
 * 现查该用户的有效角色。
 *
 * 直接读 Supabase 的 user_roles（service key，服务端专用），并复刻 Portal 的
 * 有效性判定：revoked_at 为空且未过期。**刻意不缓存**：角色撤销要即时生效。
 * 拿不到结果时返回空数组（fail closed），绝不假设"应该有 student 角色"。
 */
export async function fetchActiveRoles(userId: string): Promise<string[]> {
  if (!config.supabase.url || !config.supabase.serviceKey) return [];
  const url =
    `${config.supabase.url.replace(/\/$/, '')}/rest/v1/user_roles` +
    `?select=role,expires_at&user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null`;
  try {
    const r = await fetch(url, {
      headers: {
        apikey: config.supabase.serviceKey,
        Authorization: `Bearer ${config.supabase.serviceKey}`,
      },
    });
    if (!r.ok) return [];
    const rows = (await r.json()) as Array<{ role: string; expires_at: string | null }>;
    const now = Date.now();
    return rows
      .filter(x => !x.expires_at || Date.parse(x.expires_at) > now)
      .map(x => x.role);
  } catch {
    return [];
  }
}

/** Portal 已验收的管理角色集合（与 is_admin_any 一致）。 */
const ADMIN_ROLES = new Set(['registrar', 'academic_admin', 'super_admin']);
export const isAdminRole = (roles: string[]): boolean => roles.some(r => ADMIN_ROLES.has(r));

/**
 * 取用户显示名。优先用 JWT 里的 user_metadata（零网络开销）；
 * 没有时再回落到 Supabase profiles。**不在 App 侧建第二份人物资料**（AUTH-M5）。
 */
export async function resolveDisplayName(p: SupabasePayload): Promise<string> {
  const meta = p.user_metadata ?? {};
  const fromToken = (meta.display_name ?? meta.name ?? meta.full_name) as string | undefined;
  if (fromToken) return fromToken;

  if (config.supabase.url && config.supabase.serviceKey) {
    try {
      const r = await fetch(
        `${config.supabase.url.replace(/\/$/, '')}/rest/v1/profiles` +
          `?select=display_name&id=eq.${encodeURIComponent(p.sub)}`,
        {
          headers: {
            apikey: config.supabase.serviceKey,
            Authorization: `Bearer ${config.supabase.serviceKey}`,
          },
        },
      );
      if (r.ok) {
        const rows = (await r.json()) as Array<{ display_name: string | null }>;
        if (rows[0]?.display_name) return rows[0].display_name;
      }
    } catch {
      /* 取不到就用邮箱前缀，不阻断请求 */
    }
  }
  return (p.email ?? '').split('@')[0] || 'AMAS';
}
