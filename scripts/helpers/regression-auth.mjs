/**
 * 回归脚本的身份 provisioning 适配层。
 *
 * ── 为什么存在 ────────────────────────────────────────────────
 * AUTH-M7 删除 legacy user authentication 之后，`POST /api/auth/register`
 * 不再存在。五个应用回归脚本原本全靠它造测试用户，于是**启动即崩，
 * 199 项断言一条都跑不到**，而它们又不在 `npm test` 里，CI 完全无感。
 *
 * ── 唯一 harness 原则 ─────────────────────────────────────────
 * 本文件**不实现**任何 fake Supabase / token signer / JWKS。
 * 它只是把 backend/src/test/helpers/supabaseHarness.ts —— 项目唯一的
 * Supabase 测试身份基础设施 —— 转接给 scripts/ 下的回归执行器。
 * 新写第二套是明令禁止的。
 *
 * ── 为什么这样解析得到依赖 ────────────────────────────────────
 * harness 文件位于 backend/src/test/helpers/，它自己的 better-sqlite3 /
 * jose 依赖按 Node 规则从**文件所在位置**向上找，落到 backend/node_modules，
 * 因此入口脚本待在 scripts/ 下也能用；而 puppeteer-core 由入口脚本自己
 * 从仓库根 node_modules 解析。两边各取所需，不需要搬动任何依赖。
 *
 * 代价：这些脚本必须用 tsx 运行（要即时编译 .ts import），
 * 见 package.json 的 test:regression。
 */
export {
  startFakeSupabase,
  provisionUser,
} from '../../backend/src/test/helpers/supabaseHarness.ts';

/**
 * 起 backend 时要额外注入的环境变量。
 *
 * 指向本地假 Supabase 之后，后端跑的仍是 100% 生产认证路径：
 * jose 远端 JWKS + ES256 验签 + iss/aud 校验 + REST 角色现查。
 * **没有任何 test bypass**：不存在「跳过 requireAuth」的开关，
 * 也不存在信任请求头里 user id 的捷径。
 */
export function supabaseEnv(sb) {
  return {
    SUPABASE_URL: sb.origin,
    SUPABASE_SERVICE_ROLE_KEY: 'regression-service-key',
  };
}

/**
 * 造一个符合 post-legacy 真实模型的回归用户：
 *
 *   fake Supabase identity → SQLite canonical users 行 → legacy_user_map
 *   → mapping_status=provisioned → 真实可验签的 Supabase access token
 *
 * 返回形状与旧的 register 响应兼容（`{ user, accessToken }`），
 * 因此调用点基本不用改。
 *
 * @param dbPath  backend 实际使用的 SQLite 路径（相对仓库根）
 * @param sb      startFakeSupabase() 的返回值
 */
export async function makeRegressionUser(dbPath, sb, name, email, opts = {}) {
  const { provisionUser } = await import('../../backend/src/test/helpers/supabaseHarness.ts');
  return provisionUser(dbPath, sb, { email, name, ...opts });
}
