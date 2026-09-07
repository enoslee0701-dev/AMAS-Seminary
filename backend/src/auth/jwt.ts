/**
 * AUTH-M7（2026-09-07）：本模块曾是后端的 legacy user token 签发与验签实现。
 *
 * ★ 全部运行时代码已删除，只剩一个类型。
 *
 * 原先这里有：
 *   issueTokens()             签发 access + refresh 对
 *   verifyAccess()            校验自签 HS256 access token
 *   verifyRefresh()           校验 refresh token
 *   revokeRefresh()           按 jti 撤销
 *   revokeAllRefreshForUser()
 *   _resetSessions()
 *
 * 它们随 AUTH-M7 一并移除 —— 后端**不再是 user token 的签发方**。
 * 注册 / 登录 / 会话刷新 / 改密 / 登出全部由 Supabase Auth 负责。
 *
 * 目标态不是「legacy 默认关闭」，而是 **legacy path absent**：
 * 留一份没有调用者的签发实现，等于给下一个人一个现成的第二套认证入口。
 *
 * 保留 `AccessPayload` 的唯一原因：`middleware/auth.ts` 用它作为
 * `principal.payload` 的结构类型。它是**类型**，编译期擦除，
 * 不产生任何运行时 legacy 代码路径。
 *
 * 数据库里的 `refresh_jti` 表未删除 —— 删表属 destructive migration，
 * 本轮明令禁止。它现在没有写入方，可在后续独立迁移中清理。
 */
import type { JWTPayload } from 'jose';

/**
 * 访问令牌载荷的结构类型。
 *
 * AUTH-M7 之后实际 token 由 Supabase 签发（ES256），载荷字段比这里丰富；
 * `middleware/auth.ts` 只是把它收敛成这个形状供 `principal.payload` 使用。
 * **不要**据此重新实现任何签发逻辑。
 */
export interface AccessPayload extends JWTPayload {
  sub: string;
  email: string;
  role: 'student' | 'admin';
  type: 'access';
}
