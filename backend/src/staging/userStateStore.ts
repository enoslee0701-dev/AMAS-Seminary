/**
 * DB-13B · 「每用户一份 JSON 状态」类表的 Postgres 数据层。
 *
 * 两张表形状相同，共用这一份实现：
 *   growth_state → `public.app_christian_profile`   （信仰成长档案）
 *   pt_state     → `public.app_practice_training_state`（Pocket Theology）
 *
 * ── SQLite → Postgres 的形状适配（不是机械翻译）──────────────────────
 * SQLite 存的是 `state_json TEXT`（一段 JSON 字符串），
 * Postgres 存的是 `state jsonb`（结构化 JSON）。因此：
 *   写：把**对象本身**交给 PostgREST，不要再 JSON.stringify 一层，
 *       否则会存成「一个恰好是 JSON 的字符串」，jsonb 类型不同、查询也不同。
 *   读：拿回来就是对象，不需要 JSON.parse。
 *
 * ── 刻意不填的两列 ──────────────────────────────────────────────────
 * `app_christian_profile` 另有 `source_raw_hash` 与
 * `canonical_semantic_hash` 两列（均可空）。App 运行时**没有**能产出这两个
 * 值的权威定义 —— 它们属于 Website 侧的语义指纹口径。
 * 猜着填会制造一份看起来可信、实际无依据的数据，因此这里**一列都不写**，
 * 保持 NULL，等有明确口径时再由拥有该口径的一侧回填。
 */
import { selectOne, upsertRow, toEpochMs, fromEpochMs } from './pgData.js';

/** 支持的状态表。 */
export const STATE_TABLES = {
  growth: 'app_christian_profile',
  pt: 'app_practice_training_state',
} as const;

export type StateKind = keyof typeof STATE_TABLES;

export interface UserState {
  state: unknown;
  updatedAt: number;
}

interface Row {
  user_id: string;
  state: unknown;
  updated_at: string;
}

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

/** 读某用户的状态。没有行返回 undefined（不是空对象 —— 语义不同）。 */
export async function getUserState(
  kind: StateKind, userUuid: string,
): Promise<UserState | undefined> {
  const row = await selectOne<Row>(
    STATE_TABLES[kind], `select=state,updated_at&user_id=${eq(userUuid)}`,
  );
  return row ? { state: row.state ?? null, updatedAt: toEpochMs(row.updated_at) } : undefined;
}

/**
 * 写某用户的状态（整份替换，与 SQLite 时期的 upsert 语义一致）。
 *
 * `state` 直接作为 jsonb 写入。注意**不写** `source_raw_hash` /
 * `canonical_semantic_hash`（见文件头说明）—— upsert 是 merge，
 * 不写就保留该行原有值，也不会把已有值清成 null。
 */
export async function putUserState(
  kind: StateKind, userUuid: string, state: unknown, at = Date.now(),
): Promise<void> {
  await upsertRow<Row>(STATE_TABLES[kind], {
    user_id: userUuid,
    state,
    updated_at: fromEpochMs(at),
  });
}
