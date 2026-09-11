/**
 * DB-13C · 房间 realtime 事件日志的 Postgres 数据层
 * （`public.app_room_realtime_events`）。
 *
 * ── live schema 实测（不是照 SQLite 猜的）──────────────────────────
 * ```
 * id               bigint  GENERATED ALWAYS AS IDENTITY   NOT NULL  (PK)
 * room_id          text    FK -> app_rooms.id             NOT NULL
 * event_type       enum app_room_event_type               NOT NULL
 *                  ['session.changed','prayer.changed','theme.changed','moderation.changed']
 * entity_id        text                                   nullable
 * entity_revision  integer                                nullable
 * created_at       timestamptz                            NOT NULL
 * ```
 *
 * 三处与 SQLite 时期不同、必须照 schema 处理的地方：
 *
 * 1. **`id` 是 owned sequence 的 IDENTITY 列**。绝不自己算 `max+1`，
 *    也绝不传自造 id —— INSERT 时不带这一列，由 Postgres 分配，
 *    再从返回的行里取真实 id 当 `eventId`。这也是跨实例 id 单调的来源。
 *
 * 2. **`room_id` 有外键到 `app_rooms.id`**（SQLite 版本没有任何外键）。
 *    因此只能为**真实存在的房间**发事件。调用方都在业务写成功之后才发，
 *    那时房间必然存在；但发事件失败绝不能反过来让业务请求失败
 *    —— 见 `emitRoomEvent` 的吞异常策略。
 *
 * 3. **时间是 timestamptz**，而 App 对外的线协议一直是 **epoch 毫秒 number**。
 *    两个方向都显式转换，客户端协议一个字节不变。
 */
import {
  countRows, deleteRows, insertRow, selectRows, toEpochMs, fromEpochMs,
} from './pgData.js';

const TABLE = 'app_room_realtime_events';

/** `app_room_event_type` 的合法取值（与 live 枚举逐字一致）。 */
export type RoomEventType =
  'session.changed' | 'prayer.changed' | 'theme.changed' | 'moderation.changed';

export const ROOM_EVENT_TYPES: RoomEventType[] =
  ['session.changed', 'prayer.changed', 'theme.changed', 'moderation.changed'];

export interface RoomEvent {
  /** Postgres IDENTITY 分配的真实 id —— 也是断线续传的游标。 */
  eventId: number;
  roomId: string;
  type: RoomEventType;
  entityId?: string;
  revision?: number;
  /** 对外始终是 epoch 毫秒，与切换前逐字一致。 */
  createdAt: number;
}

interface Row {
  id: number | string;
  room_id: string;
  event_type: RoomEventType;
  entity_id: string | null;
  entity_revision: number | null;
  created_at: string;
}

/**
 * `bigint` 经 PostgREST 回来可能是字符串。事件 id 远不会触及 2^53，
 * 但类型必须显式收敛 —— 否则 `id > since` 会变成字符串比较，
 * 第 10 个事件会排在第 9 个前面（'10' < '9'）。
 */
const asId = (v: number | string): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toEvent = (r: Row): RoomEvent => ({
  eventId: asId(r.id),
  roomId: r.room_id,
  type: r.event_type,
  entityId: r.entity_id ?? undefined,
  revision: r.entity_revision ?? undefined,
  createdAt: toEpochMs(r.created_at),
});

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

/**
 * 写一个事件，返回带**真实 Postgres id** 的事件。
 *
 * 刻意不传 `id` —— 它是 `GENERATED ALWAYS AS IDENTITY`，传了会被拒绝。
 */
export async function insertEvent(input: {
  roomId: string;
  type: RoomEventType;
  entityId?: string;
  revision?: number;
  at?: number;
}): Promise<RoomEvent> {
  const row = await insertRow<Row>(TABLE, {
    room_id: input.roomId,
    event_type: input.type,
    entity_id: input.entityId ?? null,
    entity_revision: input.revision ?? null,
    created_at: fromEpochMs(input.at ?? Date.now()),
  });
  return toEvent(row);
}

/**
 * 某房间 `since` 之后的事件（断线续传）。按 id 升序。
 *
 * 房间过滤放在查询里而不是取回后再筛 —— Room A 的事件绝不能进入
 * Room B 的续传结果（§24 房间隔离）。
 */
export async function eventsSinceForRoom(
  roomId: string, since: number, limit = 200,
): Promise<RoomEvent[]> {
  const rows = await selectRows<Row>(
    TABLE,
    `select=*&room_id=${eq(roomId)}&id=gt.${encodeURIComponent(String(since))}`
    + `&order=id.asc&limit=${limit}`,
  );
  return rows.map(toEvent);
}

/** 全局轮询用：**跨房间**取 `since` 之后的新事件，按 id 升序。 */
export async function eventsSinceGlobal(
  since: number, limit = 500,
): Promise<RoomEvent[]> {
  const rows = await selectRows<Row>(
    TABLE,
    `select=*&id=gt.${encodeURIComponent(String(since))}&order=id.asc&limit=${limit}`,
  );
  return rows.map(toEvent);
}

/**
 * 当前最大 event id（SSE 建连时的起始游标）。
 *
 * PostgREST 没有聚合函数，因此用 `order=id.desc&limit=1` 取最后一行 ——
 * 有 PK 索引，代价与 `MAX(id)` 相当。空表返回 0，与 SQLite 时期一致。
 */
export async function maxEventId(): Promise<number> {
  const rows = await selectRows<Row>(TABLE, 'select=id&order=id.desc&limit=1');
  return rows[0] ? asId(rows[0].id) : 0;
}

/**
 * 保留期裁剪：删掉 `before` 之前创建的事件，返回删除条数。
 *
 * ── 为什么用 count=exact 而不是「先 SELECT 再数长度」──────────────
 * PostgREST 的 DELETE 默认不回传被删的行，所以条数要单独取。
 * 但**不能**先 `select=id` 再数数组长度：那个查询受 max-rows 限制
 * （Supabase 默认 1000），过期事件多于上限时会**少报**，
 * 启动日志里的「swept N」就成了一个偏小的假数字。
 * `countRows` 走 `limit=0` + `Prefer: count=exact`，总数取自
 * `Content-Range`，不受该上限影响。
 *
 * 两步之间新插入的事件不会被误删：删除条件用的是同一个时间上界，
 * 不是「删掉刚才查到的那些 id」。反过来，若在这个间隙里恰好又有事件
 * 过期，DELETE 会把它一并删掉而计数里没有它 —— 计数因此是
 * 「本次至少删除的条数」，不是强一致的精确值。这对一行启动日志足够，
 * 且方向是**少报而非多报**，不会造成误导性的乐观。
 */
export async function sweepBefore(before: number): Promise<number> {
  const cutoff = encodeURIComponent(fromEpochMs(before));
  const filter = `created_at=lt.${cutoff}`;
  const n = await countRows(TABLE, `select=id&${filter}`);
  if (n === 0) return 0;
  await deleteRows(TABLE, filter);
  return n;
}
