/**
 * DB-13B · 推送令牌的 Postgres 数据层（`public.app_push_tokens`）。
 *
 * 身份口径同 D-42：`user_id` 外键到 `profiles.id`，因此写进去的**只能是
 * Supabase UUID**，绝不是 canonical SQLite id。
 *
 * 主键是 `(user_id, token)` —— 与 SQLite 时期一致，所以：
 *   · 重复 register 是 upsert（幂等，只刷新 registered_at / platform）
 *   · unregister 是一次带双条件的 DELETE
 * 这两条语义逐字保留，切库不改变对外行为。
 */
import {
  deleteRows, selectRows, upsertRow, toEpochMs, fromEpochMs,
} from './pgData.js';

const TABLE = 'app_push_tokens';

/** `app_push_platform` 的合法取值。 */
export type Platform = 'ios' | 'android' | 'web';
export const PLATFORMS: Platform[] = ['ios', 'android', 'web'];

export interface PushToken {
  userId: string;
  token: string;
  platform: Platform;
  registeredAt: number;
}

interface Row {
  user_id: string;
  token: string;
  platform: Platform;
  registered_at: string;
}

const toRecord = (r: Row): PushToken => ({
  userId: r.user_id,
  token: r.token,
  platform: r.platform,
  registeredAt: toEpochMs(r.registered_at),
});

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

/** 注册/刷新一个设备令牌。幂等。 */
export async function upsertToken(
  userUuid: string, token: string, platform: Platform, at = Date.now(),
): Promise<void> {
  await upsertRow<Row>(TABLE, {
    user_id: userUuid,
    token,
    platform,
    registered_at: fromEpochMs(at),
  });
}

export async function deleteToken(userUuid: string, token: string): Promise<void> {
  await deleteRows(TABLE, `user_id=${eq(userUuid)}&token=${eq(token)}`);
}

export async function tokensForUser(userUuid: string): Promise<PushToken[]> {
  const rows = await selectRows<Row>(TABLE, `select=*&user_id=${eq(userUuid)}`);
  return rows.map(toRecord);
}

/**
 * 全部 iOS 令牌（跨用户）。广播用。
 *
 * 连同 `user_id` 一起取回，这样 APNs 报告某个令牌已失效时，
 * 能精确删掉**那一行**，而不是按 token 全表删。
 */
export async function allIosTokens(): Promise<PushToken[]> {
  const rows = await selectRows<Row>(TABLE, `select=*&platform=${eq('ios')}`);
  return rows.map(toRecord);
}
