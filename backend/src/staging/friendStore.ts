/**
 * DB-13B · 好友请求与好友关系的 Postgres 数据层。
 *
 *   请求   `public.app_friend_requests`  （id uuid, from/to_user_id → profiles.id）
 *   关系   `public.app_friendships`      （user_a / user_b → profiles.id）
 *
 * ── 切换前它在内存里 ────────────────────────────────────────────────
 * `routes/friends.ts` 用两个进程内 `Map` 存请求与关系，重启即全丢 ——
 * 一次「加好友」在服务器重启后就不存在了。切到 Postgres 是这个域
 * 第一次真正持久化，没有历史数据需要迁移。
 *
 * ── 关系行的规范化 ──────────────────────────────────────────────────
 * 一段好友关系是**无向**的，但表里是两列。沿用 SQLite 时期
 * `pairKey = min:max` 的思路：写入前把两个 UUID 按字典序排好，
 * 小的进 `user_a`、大的进 `user_b`。这样同一段关系只有一行，
 * 不会因为「谁发起的」而产生两条互为镜像的记录。
 *
 * 查「我的好友」因此要查两列（`user_a=me` 或 `user_b=me`）。
 */
import {
  deleteRows, insertRow, selectOne, selectRows, toEpochMs, fromEpochMs,
} from './pgData.js';

const REQUESTS = 'app_friend_requests';
const FRIENDSHIPS = 'app_friendships';

export interface FriendRequestRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt: number;
}

interface RequestRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string;
}

interface FriendshipRow {
  user_a: string;
  user_b: string;
  created_at: string;
}

const toRequest = (r: RequestRow): FriendRequestRecord => ({
  id: r.id,
  fromUserId: r.from_user_id,
  toUserId: r.to_user_id,
  createdAt: toEpochMs(r.created_at),
});

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 无向关系的规范化列顺序。 */
const ordered = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

// ──────────────────────────── 好友关系 ────────────────────────────

export async function areFriends(a: string, b: string): Promise<boolean> {
  const [x, y] = ordered(a, b);
  return Boolean(await selectOne<FriendshipRow>(
    FRIENDSHIPS, `select=user_a&user_a=${eq(x)}&user_b=${eq(y)}`,
  ));
}

export async function addFriendship(a: string, b: string, at = Date.now()): Promise<void> {
  const [x, y] = ordered(a, b);
  await insertRow<FriendshipRow>(FRIENDSHIPS, {
    user_a: x, user_b: y, created_at: fromEpochMs(at),
  });
}

export async function removeFriendship(a: string, b: string): Promise<void> {
  const [x, y] = ordered(a, b);
  await deleteRows(FRIENDSHIPS, `user_a=${eq(x)}&user_b=${eq(y)}`);
}

/** 某用户的全部好友 UUID。要查两列，因为关系行是规范化存的。 */
export async function friendUuidsOf(userUuid: string): Promise<string[]> {
  // PostgREST 的 `or=` 里嵌套过滤条件用 `(col.op.value,...)` 形式。
  // UUID 只含 [0-9a-f-]，不含逗号或括号，因此无需额外转义。
  if (!UUID_RE.test(userUuid)) return [];
  const rows = await selectRows<FriendshipRow>(
    FRIENDSHIPS,
    `select=user_a,user_b&or=(user_a.eq.${userUuid},user_b.eq.${userUuid})`,
  );
  return rows.map(r => (r.user_a === userUuid ? r.user_b : r.user_a));
}

// ──────────────────────────── 好友请求 ────────────────────────────

export async function getRequest(id: string): Promise<FriendRequestRecord | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const row = await selectOne<RequestRow>(REQUESTS, `select=*&id=${eq(id)}`);
  return row ? toRequest(row) : undefined;
}

/** 两人之间是否已有待处理请求（任一方向）。 */
export async function pendingBetween(
  a: string, b: string,
): Promise<FriendRequestRecord | undefined> {
  if (!UUID_RE.test(a) || !UUID_RE.test(b)) return undefined;
  const rows = await selectRows<RequestRow>(
    REQUESTS,
    'select=*&or=('
    + `and(from_user_id.eq.${a},to_user_id.eq.${b}),`
    + `and(from_user_id.eq.${b},to_user_id.eq.${a})`
    + ')',
  );
  return rows[0] ? toRequest(rows[0]) : undefined;
}

export async function insertRequest(
  id: string, fromUuid: string, toUuid: string, at = Date.now(),
): Promise<FriendRequestRecord> {
  const row = await insertRow<RequestRow>(REQUESTS, {
    id, from_user_id: fromUuid, to_user_id: toUuid, created_at: fromEpochMs(at),
  });
  return toRequest(row);
}

export async function deleteRequest(id: string): Promise<void> {
  await deleteRows(REQUESTS, `id=${eq(id)}`);
}

/** 发给我的待处理请求，最新在前。 */
export async function incomingRequests(userUuid: string): Promise<FriendRequestRecord[]> {
  const rows = await selectRows<RequestRow>(
    REQUESTS, `select=*&to_user_id=${eq(userUuid)}&order=created_at.desc`,
  );
  return rows.map(toRequest);
}

/** 我发出的待处理请求，最新在前。 */
export async function outgoingRequests(userUuid: string): Promise<FriendRequestRecord[]> {
  const rows = await selectRows<RequestRow>(
    REQUESTS, `select=*&from_user_id=${eq(userUuid)}&order=created_at.desc`,
  );
  return rows.map(toRequest);
}
