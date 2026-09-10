/**
 * DB-13B · 共享祷告会的 Postgres 数据层。
 *
 *   会话   `public.app_prayer_sessions`        （id text, room_id → app_rooms.id）
 *   事项   `public.app_prayer_session_items`   （session_id → app_prayer_sessions.id）
 *   事件   `public.app_prayer_session_events`  （session_id → …, actor_user_id → profiles.id）
 *
 * ── 三处需要真正翻译（不是照抄 SQL）的地方 ───────────────────────────
 *
 * 1. **乐观并发**。SQLite 是
 *      `UPDATE ... SET revision = revision + 1 WHERE id=? AND status=? AND revision=?`
 *    再看 `changes === 0`。PostgREST 的 PATCH 不能在赋值里做算术，
 *    所以把 `expected + 1` 算好再发；条件过滤 `revision=eq.<expected>`
 *    保证基线未变，两者严格等价。「影响 0 行」由 `updateRows` 返回空数组表达。
 *    **状态条件也必须留在过滤里**（如 `status=eq.scheduled`）——
 *    §8 的结构冻结就靠它，挪到应用层判断会产生检查与写入之间的竞态。
 *
 * 2. **`current_item_id` 外键到 `app_prayer_session_items.id`**。
 *    因此建会话时它必须是 null（事项还没写），只有 start 时才指向已存在的事项。
 *    PUT 重排事项前会先删旧事项 —— 那一步只在 `status='scheduled'` 下发生，
 *    而 scheduled 会话的 `current_item_id` 恒为 null，所以不会撞外键。
 *
 * 3. **「当前会话」的排序**。SQLite 用
 *      `ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at DESC`
 *    把 active 排在 scheduled 前面。PostgREST 没有 CASE，
 *    因此改成先查 active、没有再查最新的 scheduled —— 两次查询，语义相同。
 *
 * 没有跨请求事务。建会话时若事项写入失败，会把刚建的会话删掉
 * （见 `createSession`），不留一个没有事项的空会话。
 */
import {
  deleteRows, insertRow, selectOne, selectRows, updateRows,
  StagingRequestError, toEpochMs, fromEpochMs,
} from './pgData.js';

const SESSIONS = 'app_prayer_sessions';
const ITEMS = 'app_prayer_session_items';
const EVENTS = 'app_prayer_session_events';

export type SessionStatus = 'scheduled' | 'active' | 'ended';
export type SessionEventType =
  'created' | 'started' | 'item_changed' | 'facilitator_changed' | 'ended';

export interface SessionRecord {
  id: string;
  roomId: string;
  title: string | null;
  status: SessionStatus;
  createdBy: string | null;
  facilitatorUserId: string | null;
  startedAt: number | null;
  endedAt: number | null;
  currentItemId: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface ItemRecord {
  id: string;
  position: number;
  title: string;
  description: string | null;
  scriptureRef: string | null;
  scriptureText: string | null;
}

interface SessionRow {
  id: string;
  room_id: string;
  title: string | null;
  status: SessionStatus;
  created_by: string | null;
  facilitator_user_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  current_item_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  session_id: string;
  position: number;
  title: string;
  description: string | null;
  scripture_ref: string | null;
  scripture_text: string | null;
  created_at: string;
}

const toSession = (r: SessionRow): SessionRecord => ({
  id: r.id,
  roomId: r.room_id,
  title: r.title,
  status: r.status,
  createdBy: r.created_by,
  facilitatorUserId: r.facilitator_user_id,
  startedAt: r.started_at ? toEpochMs(r.started_at) : null,
  endedAt: r.ended_at ? toEpochMs(r.ended_at) : null,
  currentItemId: r.current_item_id,
  revision: r.revision,
  createdAt: toEpochMs(r.created_at),
  updatedAt: toEpochMs(r.updated_at),
});

const toItem = (r: ItemRow): ItemRecord => ({
  id: r.id,
  position: r.position,
  title: r.title,
  description: r.description,
  scriptureRef: r.scripture_ref,
  scriptureText: r.scripture_text,
});

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

/** 本房「当前会话」：优先 active，其次最新的 scheduled。 */
export async function currentSession(roomId: string): Promise<SessionRecord | undefined> {
  const active = await selectOne<SessionRow>(
    SESSIONS, `select=*&room_id=${eq(roomId)}&status=${eq('active')}`,
  );
  if (active) return toSession(active);
  const scheduled = await selectOne<SessionRow>(
    SESSIONS,
    `select=*&room_id=${eq(roomId)}&status=${eq('scheduled')}&order=created_at.desc`,
  );
  return scheduled ? toSession(scheduled) : undefined;
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  const row = await selectOne<SessionRow>(SESSIONS, `select=*&id=${eq(id)}`);
  return row ? toSession(row) : undefined;
}

export async function listItems(sessionId: string): Promise<ItemRecord[]> {
  const rows = await selectRows<ItemRow>(
    ITEMS, `select=*&session_id=${eq(sessionId)}&order=position.asc`,
  );
  return rows.map(toItem);
}

export interface SessionEventRecord {
  eventType: SessionEventType;
  fromItemId: string | null;
  toItemId: string | null;
  createdAt: number;
}

interface EventRow {
  id: string;
  session_id: string;
  actor_user_id: string | null;
  event_type: SessionEventType;
  from_item_id: string | null;
  to_item_id: string | null;
  created_at: string;
}

/**
 * 某场会话的事件日志，按时间正序。
 *
 * SQLite 时期是 `ORDER BY created_at, rowid` —— rowid 用来给同一毫秒内的
 * 事件定序。Postgres 没有 rowid，这里退到 `created_at, id`：
 * id 不承载时间信息，但它稳定且唯一，因此同毫秒事件的顺序是**确定的**
 * （不会在两次查询间跳动），这对 `buildJourney` 逐段闭合已经足够。
 */
export async function listEvents(sessionId: string): Promise<SessionEventRecord[]> {
  const rows = await selectRows<EventRow>(
    EVENTS,
    `select=event_type,from_item_id,to_item_id,created_at&session_id=${eq(sessionId)}`
    + '&order=created_at.asc,id.asc',
  );
  return rows.map(r => ({
    eventType: r.event_type,
    fromItemId: r.from_item_id,
    toItemId: r.to_item_id,
    createdAt: toEpochMs(r.created_at),
  }));
}

/**
 * 已结束会话的一页，按结束时间倒序。
 *
 * `beforeEndedAt` 是上一页最后一条的 endedAt（游标）。取 `limit + 1` 条
 * 由调用方判断「还有下一页」—— 与 SQLite 时期同一套分页协议。
 */
export async function endedSessions(
  roomId: string, beforeEndedAt: number, limit: number,
): Promise<SessionRecord[]> {
  // ★ 首页的游标是 Number.MAX_SAFE_INTEGER（"没有上界"）。
  //   SQLite 时期它直接进 `ended_at < ?` 比较，毫无问题；
  //   但 Postgres 侧要把它格式化成 timestamptz，而
  //   `new Date(9007199254740991)` 是 **Invalid Date**（JS 的 Date 上限是
  //   8.64e15），`toISOString()` 会抛 RangeError —— 整个历史列表 500。
  //   因此超出可表示范围时**不加上界过滤**，语义与"没有上界"完全一致。
  const bounded = Number.isFinite(beforeEndedAt) && Math.abs(beforeEndedAt) <= 8.64e15;
  const filters = [
    'select=*',
    `room_id=${eq(roomId)}`,
    `status=${eq('ended')}`,
    'ended_at=not.is.null',
    `order=ended_at.desc`,
    `limit=${limit}`,
  ];
  if (bounded) {
    filters.push(`ended_at=lt.${encodeURIComponent(fromEpochMs(beforeEndedAt))}`);
  }
  const rows = await selectRows<SessionRow>(SESSIONS, filters.join('&'));
  return rows.map(toSession);
}

export interface ItemInput {
  title: string;
  description: string | null;
  scriptureRef: string | null;
  scriptureText: string | null;
}

/** 写一批事项。position 由**服务器**按数组顺序标准化为 1..n。 */
async function writeItems(
  sessionId: string, items: ItemInput[], idOf: () => string, at: number,
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    await insertRow<ItemRow>(ITEMS, {
      id: idOf(),
      session_id: sessionId,
      position: i + 1,
      title: it.title,
      description: it.description,
      scripture_ref: it.scriptureRef,
      scripture_text: it.scriptureText,
      created_at: fromEpochMs(at),
    });
  }
}

export async function appendEvent(input: {
  id: string;
  sessionId: string;
  actorUuid: string;
  eventType: SessionEventType;
  fromItemId: string | null;
  toItemId: string | null;
  at: number;
}): Promise<void> {
  await insertRow(EVENTS, {
    id: input.id,
    session_id: input.sessionId,
    actor_user_id: input.actorUuid,
    event_type: input.eventType,
    from_item_id: input.fromItemId,
    to_item_id: input.toItemId,
    created_at: fromEpochMs(input.at),
  });
}

/**
 * 建会话 + 写事项 + 记 created 事件。
 *
 * 没有跨请求事务，因此事项写入失败时把刚建的会话删掉 ——
 * 不留一个没有事项的空会话（客户端会把它渲染成一个空祷告会）。
 */
export async function createSession(input: {
  id: string;
  roomId: string;
  title: string | null;
  createdByUuid: string;
  items: ItemInput[];
  idOf: () => string;
  at: number;
}): Promise<SessionRecord> {
  const row = await insertRow<SessionRow>(SESSIONS, {
    id: input.id,
    room_id: input.roomId,
    title: input.title,
    status: 'scheduled',
    created_by: input.createdByUuid,
    // current_item_id 外键到 items，此刻事项还没写 —— 必须是 null。
    current_item_id: null,
    revision: 1,
    created_at: fromEpochMs(input.at),
    updated_at: fromEpochMs(input.at),
  });
  try {
    await writeItems(input.id, input.items, input.idOf, input.at);
    await appendEvent({
      id: input.idOf(), sessionId: input.id, actorUuid: input.createdByUuid,
      eventType: 'created', fromItemId: null, toItemId: null, at: input.at,
    });
  } catch (e) {
    await deleteRows(ITEMS, `session_id=${eq(input.id)}`).catch(() => {});
    await deleteRows(SESSIONS, `id=${eq(input.id)}`).catch(() => {});
    throw e;
  }
  return toSession(row);
}

/** 会话是否已被本房另一个 active 会话占位（唯一约束冲突 → 409）。 */
export const isActiveConflict = (e: unknown): boolean =>
  e instanceof StagingRequestError && e.status === 409;

/**
 * 条件更新会话。`statuses` 是允许的当前状态（对应 SQL 里的 `status IN (...)`），
 * 与 `expectedRevision` 一起进过滤条件 —— 不匹配就一行都不动。
 *
 * 返回 undefined = 冲突（revision 不符，或状态已不在允许集合里）。
 */
async function patchSession(
  id: string, statuses: SessionStatus[], expectedRevision: number,
  patch: Record<string, unknown>, at: number,
): Promise<SessionRecord | undefined> {
  const statusFilter = statuses.length === 1
    ? `status=eq.${statuses[0]}`
    : `status=in.(${statuses.join(',')})`;
  const rows = await updateRows<SessionRow>(
    SESSIONS,
    `id=${eq(id)}&${statusFilter}&revision=eq.${encodeURIComponent(String(expectedRevision))}`,
    { ...patch, revision: expectedRevision + 1, updated_at: fromEpochMs(at) },
  );
  return rows[0] ? toSession(rows[0]) : undefined;
}

/** 开始祷告会。`status` 必须仍是 scheduled。 */
export const startSession = (
  id: string, expectedRevision: number, firstItemId: string | null, at: number,
): Promise<SessionRecord | undefined> => patchSession(
  id, ['scheduled'], expectedRevision,
  { status: 'active', started_at: fromEpochMs(at), current_item_id: firstItemId }, at,
);

/** 切换当前事项。只有 active 会话可以切。 */
export const setCurrentItem = (
  id: string, expectedRevision: number, itemId: string, at: number,
): Promise<SessionRecord | undefined> => patchSession(
  id, ['active'], expectedRevision, { current_item_id: itemId }, at,
);

/** 指定/清除带领者。scheduled 与 active 都允许。 */
export const setFacilitator = (
  id: string, expectedRevision: number, facilitatorUuid: string | null, at: number,
): Promise<SessionRecord | undefined> => patchSession(
  id, ['scheduled', 'active'], expectedRevision,
  { facilitator_user_id: facilitatorUuid }, at,
);

/** 结束祷告会。保留 current_item_id 供历史记录，不清空。 */
export const endSession = (
  id: string, expectedRevision: number, at: number,
): Promise<SessionRecord | undefined> => patchSession(
  id, ['scheduled', 'active'], expectedRevision,
  { status: 'ended', ended_at: fromEpochMs(at) }, at,
);

/**
 * 编辑 **scheduled** 会话的标题与事项（整体替换，非 partial merge）。
 *
 * 先条件更新会话（同时消耗 revision 并确认仍是 scheduled），
 * 成功后才动事项 —— 与 SQLite 版的事务顺序一致：冲突时一行都不写。
 */
export async function replaceScheduled(input: {
  id: string;
  expectedRevision: number;
  title: string | null;
  items: ItemInput[];
  idOf: () => string;
  at: number;
}): Promise<SessionRecord | undefined> {
  const updated = await patchSession(
    input.id, ['scheduled'], input.expectedRevision, { title: input.title }, input.at,
  );
  if (!updated) return undefined;
  await deleteRows(ITEMS, `session_id=${eq(input.id)}`);
  await writeItems(input.id, input.items, input.idOf, input.at);
  return updated;
}
