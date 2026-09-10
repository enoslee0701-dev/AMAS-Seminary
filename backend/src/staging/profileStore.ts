/**
 * DB-13B · 由 Supabase UUID 解析「用于展示的身份」。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * DB-13B 之前，`routes/friends.ts` 用 `auth/users.ts` 的 `findById()`
 * 从 SQLite `users` 取名字/头像/角色。切换后好友关系的主体是
 * **Supabase UUID**（`app_friendships.user_a/user_b → profiles.id`），
 * 而 SQLite `users.id` 是 canonical 本地 id —— 两者值域不同，
 * `findById(uuid)` 必然查不到。
 *
 * 展示身份的权威来源因此是 `public.profiles`（`display_name` / `avatar_path`）
 * 加 `public.user_roles`（角色）。
 *
 * ── 刻意做成批量 ────────────────────────────────────────────────────
 * 好友列表 / 收到的请求都是「一批 UUID → 一批显示名」。逐个查是 N+1，
 * 所以这里只暴露批量接口，用 PostgREST 的 `id=in.(...)` 一次取回。
 * 单个查询就是 `resolveProfiles([id])`，不额外开一个单查函数，
 * 免得调用方在循环里用它。
 *
 * ── 不做的事 ────────────────────────────────────────────────────────
 * 不回传 email / phone / legal_name 等联系信息 —— 好友接口只需要
 * 名字、头像、角色。多回传的字段迟早会被前端读到并泄漏出去。
 */
import { selectRows } from './pgData.js';

export interface DisplayIdentity {
  id: string;
  name: string;
  avatar?: string;
  role: string;
}

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_path: string | null;
}

interface RoleRow {
  user_id: string;
  role: string;
  revoked_at: string | null;
}

/** PostgREST 的 `in.(...)` 列表。空数组时调用方应直接跳过查询。 */
const inList = (ids: string[]): string =>
  `in.(${ids.map(i => `"${i.replace(/"/g, '')}"`).join(',')})`;

/**
 * 批量解析。返回 Map，**查不到的 UUID 不会出现在结果里** ——
 * 调用方据此把「已不存在的身份」过滤掉（`friends.ts` 原本就是这个语义：
 * `findById` 返回 undefined 的请求会被剔除）。
 */
export async function resolveProfiles(
  uuids: string[],
): Promise<Map<string, DisplayIdentity>> {
  const out = new Map<string, DisplayIdentity>();
  const unique = [...new Set(uuids.filter(Boolean))];
  if (!unique.length) return out;

  const profiles = await selectRows<ProfileRow>(
    'profiles', `select=id,display_name,avatar_path&id=${inList(unique)}`,
  );
  if (!profiles.length) return out;

  // 角色单独一次查询。取当前有效（未撤销）的第一个角色 ——
  // 与运行时授权口径一致（见 auth/supabase.ts 的 fetchActiveRoles）。
  let roles: RoleRow[] = [];
  try {
    roles = await selectRows<RoleRow>(
      'user_roles',
      `select=user_id,role,revoked_at&user_id=${inList(profiles.map(p => p.id))}`,
    );
  } catch (e) {
    // 角色只影响展示，取不到就留空字符串，不让整个好友列表失败。
    console.error('[profileStore] role lookup failed:', (e as Error).message);
  }
  const roleOf = new Map<string, string>();
  for (const r of roles) {
    if (r.revoked_at) continue;
    if (!roleOf.has(r.user_id)) roleOf.set(r.user_id, r.role);
  }

  for (const p of profiles) {
    out.set(p.id, {
      id: p.id,
      name: p.display_name,
      avatar: p.avatar_path ?? undefined,
      role: roleOf.get(p.id) ?? '',
    });
  }
  return out;
}

/** 这个 UUID 是否存在一个 profile。用于「目标用户是否存在」这类前置校验。 */
export async function profileExists(uuid: string): Promise<boolean> {
  return (await resolveProfiles([uuid])).has(uuid);
}
