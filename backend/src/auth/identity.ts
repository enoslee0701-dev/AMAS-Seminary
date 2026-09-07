/**
 * AUTH-M7 · Runtime Identity Resolution
 *
 * Supabase UUID → legacy_user_map → canonical SQLite user。
 *
 * 为什么必须有这一层：Supabase 登录成功只证明「这是一个真实的 Supabase 账号」，
 * **不证明** 这个人是 AMAS 的学员。此前 requireAuth 的 Supabase 分支直接拿
 * payload.sub 当 principal.user.id，从头到尾不碰 SQLite，于是一个只存在于
 * Supabase 的身份可以写 growth_state / pt_state / posts / course_progress /
 * library_favorites / push_tokens —— 19 张用户相关表里 16 张没有外键，
 * 数据库层根本挡不住。
 *
 * 产品决策（已定，不得在代码里放宽）：
 *   **FAIL CLOSED。不得自动 provision。**
 *   AMAS 身份只能来自正式业务流程：申请 → 审核/录取 → canonical user →
 *   identity mapping → App access。Supabase 注册 ≠ AMAS 学生身份。
 *
 * 边界（R-2，不可动摇）：
 *   Supabase   → 认证 + 授权身份（角色现查用 authId）
 *   SQLite users → AMAS 业务身份与展示资料（id / name / avatar / email）
 *   本模块只解析**身份**，不产出任何授权结论；调用方拿到 PublicUser 后，
 *   其中的 `role` 字段在 Supabase 路径下只能展示，**不得**用于权限判定。
 */
import { db } from '../db.js';
import { findById, toPublicUser, type PublicUser } from './users.js';

/** 允许通过认证的 mapping_status。其余一律拒绝（含未知值与 NULL）。 */
const ALLOWED_MAPPING_STATUS = new Set(['mapped', 'provisioned']);

/**
 * 拒绝原因。**只用于服务端日志**，不下发给客户端——
 * 区分「没有映射」与「映射被禁用」会把 Supabase 账号是否已登记的信息
 * 泄漏给任何持有有效 token 的人。对外统一 403 IDENTITY_NOT_PROVISIONED。
 */
export type IdentityDenialReason =
  | 'MAPPING_MISSING'
  | 'MAPPING_STATUS_NOT_ALLOWED'
  | 'MAPPING_INCOMPLETE'
  | 'CANONICAL_USER_MISSING'
  | 'MAPPING_MISMATCH';

/**
 * 刻意用「单一形状 + 可选字段」，不用判别联合。
 *
 * 仓库根 tsconfig 未开 strict，判别联合在根配置下无法按 `ok` 收窄，
 * 前端 tsc 会报 "Property 'reason' does not exist on type '{ ok: true; ... }'"。
 * P1-2 的 validateLocation 踩过同一个坑并采用了同样的解法（见 ACCEPTANCE_HISTORY）。
 * 调用方按 `if (!r.ok || !r.user)` 判定。
 */
export interface IdentityResolution {
  ok: boolean;
  /** ok 为 true 时必有。 */
  user?: PublicUser;
  /** ok 为 false 时必有。只进服务端日志，不下发客户端。 */
  reason?: IdentityDenialReason;
  detail?: string;
}

interface MapRow {
  legacy_user_id: string | null;
  supabase_user_id: string | null;
  mapping_status: string | null;
}

// 懒编译：模块加载顺序不应依赖表已经建好（db.ts 建表在前，但保持解耦）。
let stmt: ReturnType<typeof db.prepare<[string], MapRow>> | null = null;
function lookup(authId: string): MapRow | undefined {
  if (!stmt) {
    stmt = db.prepare<[string], MapRow>(
      `SELECT legacy_user_id, supabase_user_id, mapping_status
         FROM legacy_user_map
        WHERE supabase_user_id = ?
        LIMIT 1`,
    );
  }
  return stmt.get(authId);
}

/**
 * 把一个已验签的 Supabase UUID 解析成 canonical AMAS 用户。
 *
 * 解析链：
 *   Supabase UUID → legacy_user_map.supabase_user_id → mapping_status 门禁
 *                 → legacy_user_id → users.id → PublicUser
 *
 * 全部拒绝路径都是 fail closed，**绝不**在任何分支创建用户或映射。
 * 真正的数据库/代码异常照常抛出（由上层变成 500）——「没有资格」与
 * 「系统坏了」必须是两种可分辨的状态。
 */
export function resolveCanonicalUserFromSupabase(authId: string): IdentityResolution {
  if (!authId) return { ok: false, reason: 'MAPPING_MISSING' };

  const row = lookup(authId);
  if (!row) return { ok: false, reason: 'MAPPING_MISSING' };

  // 白名单，不是黑名单：未知状态、NULL、将来新增的状态一律拒绝。
  // 尤其 skipped_test_account —— 迁移脚本断言过「测试账号未映射到任何
  // Supabase 真实身份」，运行时放行等于亲手推翻它。
  const status = row.mapping_status;
  if (!status || !ALLOWED_MAPPING_STATUS.has(status)) {
    return { ok: false, reason: 'MAPPING_STATUS_NOT_ALLOWED', detail: status ?? 'NULL' };
  }

  // 唯一部分索引保证 supabase_user_id 不重复，但不保证非空；
  // 也不保证 legacy_user_id 有值（理论上是 PK，防御性再查一次）。
  if (!row.supabase_user_id || !row.legacy_user_id) {
    return { ok: false, reason: 'MAPPING_INCOMPLETE' };
  }

  // 查询条件本身就是 supabase_user_id = authId，这里再核一次是为了防止
  // 将来有人改成 LIKE / COLLATE NOCASE 之类的宽松匹配。
  if (row.supabase_user_id !== authId) {
    return { ok: false, reason: 'MAPPING_MISMATCH' };
  }

  const user = findById(row.legacy_user_id);
  if (!user) {
    // 映射还在但 canonical 用户已被删除。不得凭映射复活身份。
    return { ok: false, reason: 'CANONICAL_USER_MISSING', detail: row.legacy_user_id };
  }

  return { ok: true, user: toPublicUser(user) };
}
