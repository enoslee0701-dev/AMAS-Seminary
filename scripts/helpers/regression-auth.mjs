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
import { spawn } from 'node:child_process';

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

/**
 * DB-12：把 5 个内置公共房间预置进假 Supabase 的 `app_rooms`。
 *
 * 以前这 5 个房间是后端启动时**播种进 SQLite** 的，回归脚本因此天然拿得到。
 * DB-12 之后房间的真相源是 Postgres（`public.app_rooms`，staging 里已存在
 * 5 行 `host_type='system'`），SQLite 不再播种——否则就是迁移域的双写。
 *
 * 所以回归脚本必须显式把这 5 行放进假 Supabase，形状与线上逐字一致：
 * `host_type='system'`、`host_user_id=NULL`、`host_orphaned_at=NULL`、无密码。
 * 这不是"造假数据"——它复刻的是 staging 里真实存在的行。
 */
export const SYSTEM_ROOM_IDS = [
  'prayer_room', 'praise_room', 'bible_reading', 'preaching_room', 'fellowship_room',
];

export function seedSystemRooms(sb, at = Date.now()) {
  sb.seedTable('app_rooms', SYSTEM_ROOM_IDS.map(id => ({
    id,
    host_type: 'system',
    host_user_id: null,
    host_orphaned_at: null,
    password_hash: null,
    password_salt: null,
    created_at: new Date(at).toISOString(),
  })));
  // ⚠ 刻意**不**清空 app_room_members / app_room_presence。
  // 这个函数会在后端重启时被再次调用（startBackend 里），清空会把已建立的
  // 成员关系一并抹掉，于是「重启后状态仍在」这类持久化断言会假失败。
  // 房间本身是幂等覆盖，成员与在线状态由测试自己管理。
}

/**
 * DB-12：以**异步** spawn 调用 backend/scripts 下的 CLI。
 *
 * ⚠ 绝对不要在这里用 spawnSync。
 * 假 Supabase 的 HTTP server 跑在**调用方自己的进程**里；spawnSync 会阻塞该进程的
 * 事件循环，于是子进程去打假 Supabase 时服务端根本无法应答 —— 表现为
 * `fetch failed / ECONNABORTED`，看起来像后端崩了，其实是自锁。
 * （本项目在 identity-migration 测试上已经踩过一次同样的坑。）
 */
export function runBackendCli(args, env, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', ...args], {
      cwd: 'backend', env, encoding: 'utf8',
    });
    let out = '';
    child.stdout?.on('data', d => { out += d; });
    child.stderr?.on('data', d => { out += d; });
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, out: out + ' [timeout]' }); }, timeoutMs);
    child.on('close', code => { clearTimeout(timer); resolve({ code, out }); });
    child.on('error', e => { clearTimeout(timer); resolve({ code: -1, out: out + ' ' + e.message }); });
  });
}
