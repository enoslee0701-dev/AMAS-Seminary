/**
 * `/api/auth/*` —— AUTH-M7 之后只剩身份读写。
 *
 * ★ 后端**不再是 user token 的签发方**。注册 / 登录 / 会话刷新 / 改密 / 登出
 *   全部由 Supabase Auth 负责，前端直接对 Supabase 完成，不经本服务。
 *
 * 已移除的端点（AUTH-M7，2026-09-07）：
 *   POST /api/auth/register          -> supabase.auth.signUp()
 *   POST /api/auth/login             -> supabase.auth.signInWithPassword()
 *   POST /api/auth/refresh           -> Supabase 客户端 SDK 自动刷新
 *   POST /api/auth/change-password   -> supabase.auth.updateUser()
 *   POST /api/auth/logout            -> supabase.auth.signOut()
 *   POST /api/auth/_promote          -> 早于 AUTH-M3 已移除（提权后门）
 *
 * 保留的两个端点改由 `requireAuth` 把关：它负责 Supabase 验签 + 运行时身份解析
 * （Supabase UUID -> legacy_user_map -> canonical SQLite user）。
 * 解析不出一律 403 IDENTITY_NOT_PROVISIONED，**绝不自动 provision** ——
 * AMAS 身份只能来自正式业务流程（申请 -> 审核/录取 -> canonical user -> mapping）。
 */
import type { Express } from 'express';
import { updateProfile, toPublicUser, findById } from '../auth/users.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * 注册 `/api/auth/*` 路由。
 *
 * 两个端点都走 requireAuth：身份来自 `req.principal.user`，
 * 本文件不再自行验签，也不再接触任何 token 签发逻辑。
 */
export function registerAuthRoutes(app: Express): void {
  app.get('/api/auth/me', requireAuth, async (req, res) => {
    // requireAuth 已完成验签 + 身份解析；这里拿到的就是 canonical 业务身份。
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      res.status(401).json({ error: 'User authentication required.' });
      return;
    }
    res.status(200).json({ user: principal.user });
  });

  /**
   * PATCH /api/auth/me — 更新当前用户资料。
   *
   * Body（均可选）：{ name?, degree?, bio?, avatar? }。只有这四个字段可改；
   * email / role / password **刻意不可**经此端点变更 —— 密码归 Supabase，
   * 角色归受保护流程。
   *
   * 校验委托给 `updateProfile`，规则与存储层放在一起。校验失败抛出
   * `code = 'INVALID_PROFILE'` 的 Error，映射为 400。
   */
  app.patch('/api/auth/me', requireAuth, async (req, res) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      res.status(401).json({ error: 'User authentication required.' });
      return;
    }
    const body = (req.body ?? {}) as {
      name?: unknown;
      degree?: unknown;
      bio?: unknown;
      avatar?: unknown;
    };
    // 只转发请求体里**显式出现**的字段：undefined 意为"别动它"。
    const patch: { name?: string; degree?: string; bio?: string; avatar?: string } = {};
    if ('name' in body) patch.name = body.name as string;
    if ('degree' in body) patch.degree = body.degree as string;
    if ('bio' in body) patch.bio = body.bio as string;
    if ('avatar' in body) patch.avatar = body.avatar as string;
    try {
      const updated = updateProfile(principal.user.id, patch);
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
