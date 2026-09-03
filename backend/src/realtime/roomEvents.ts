import { db } from '../db.js';

/**
 * 房间 Realtime 事件总线（Phase 3）。
 *
 * ## 核心原则：Realtime 不是第二个 State Store
 *
 * 唯一真相源仍是 数据库 + REST + revision。本模块只回答一件事：
 * **「这个房间有东西变了」**。客户端收到后回 REST 拿 canonical state。
 * 因此事件 payload 里**没有任何业务对象**，也没有任何敏感字段
 * （代祷正文 / 匿名作者 / 姓名 / email / 举报人 / hidden_by / JWT）。
 *
 * ## 投递路径（两条，互为补充）
 *
 * 1. **进程内直发**：写事件后立刻 fan-out 给本进程的订阅者 → 亚秒级。
 * 2. **数据库轮询**：一个**全局**轮询器（250ms）扫 `id > lastSeen` 的新行。
 *    它保证两件事：
 *      - 跨实例：若将来多实例部署，其他实例写的事件也能被本实例看到；
 *      - 断线续传：客户端带 `since` 重连时可从表里补齐。
 *
 * 全局只有一个轮询器（不是每连接一个），因此 250ms 一条查询，成本可忽略。
 *
 * ## 单实例限制（§25 要求明确检测与声明）
 * 当前 SQLite 是本地文件（`backend/data/amas.sqlite`），数据模型本身就决定了
 * 只能单实例部署。数据库轮询路径让跨实例在**技术上**可行，但只要还用本地
 * SQLite，多实例就会各写各的库——这一点在启动日志里明确打出来，不假装支持。
 */

export type RoomEventType = 'session.changed' | 'prayer.changed' | 'theme.changed' | 'moderation.changed';

export interface RoomEvent {
  eventId: number;
  roomId: string;
  type: RoomEventType;
  entityId?: string;
  revision?: number;
  createdAt: number;
}

const stmtInsert = db.prepare<[string, string, string | null, number | null, number]>(
  `INSERT INTO room_realtime_events (room_id, event_type, entity_id, entity_revision, created_at)
   VALUES (?, ?, ?, ?, ?)`,
);
const stmtSince = db.prepare<[number], {
  id: number; room_id: string; event_type: RoomEventType;
  entity_id: string | null; entity_revision: number | null; created_at: number;
}>('SELECT * FROM room_realtime_events WHERE id > ? ORDER BY id ASC LIMIT 500');
const stmtSinceRoom = db.prepare<[string, number], {
  id: number; room_id: string; event_type: RoomEventType;
  entity_id: string | null; entity_revision: number | null; created_at: number;
}>('SELECT * FROM room_realtime_events WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT 200');
const stmtMaxId = db.prepare<[], { m: number | null }>('SELECT MAX(id) AS m FROM room_realtime_events');
const stmtSweep = db.prepare<[number]>('DELETE FROM room_realtime_events WHERE created_at < ?');

const toEvent = (r: { id: number; room_id: string; event_type: RoomEventType; entity_id: string | null; entity_revision: number | null; created_at: number }): RoomEvent => ({
  eventId: r.id,
  roomId: r.room_id,
  type: r.event_type,
  entityId: r.entity_id ?? undefined,
  revision: r.entity_revision ?? undefined,
  createdAt: r.created_at,
});

// ---------- 订阅 ----------

type Listener = (e: RoomEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeRoom(roomId: string, fn: Listener): () => void {
  let set = listeners.get(roomId);
  if (!set) { set = new Set(); listeners.set(roomId, set); }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(roomId);
  };
}

/** 严格按 roomId 分发——Room A 的事件绝不会到达 Room B 的订阅者（§24）。 */
function dispatch(e: RoomEvent): void {
  const set = listeners.get(e.roomId);
  if (!set) return;
  for (const fn of set) { try { fn(e); } catch { /* 单个订阅者异常不影响其他人 */ } }
}

// ---------- 写入 ----------

/**
 * 记录一个变更事件。
 *
 * **必须在业务事务成功提交之后调用**（§6）——绝不能出现
 * 「已经通知客户端，数据库随后回滚」。调用方的写法是：
 *   db.transaction(...)();   // 提交成功
 *   emitRoomEvent(...);      // 才发事件
 * revision 冲突（changes===0）时调用方直接 return，不会走到这里。
 */
export function emitRoomEvent(
  roomId: string, type: RoomEventType, entityId?: string, revision?: number,
): RoomEvent {
  const at = Date.now();
  const info = stmtInsert.run(roomId, type, entityId ?? null, revision ?? null, at);
  const e: RoomEvent = { eventId: Number(info.lastInsertRowid), roomId, type, entityId, revision, createdAt: at };
  lastPolled = Math.max(lastPolled, e.eventId);   // 本进程已投递，避免轮询重复发一次
  dispatch(e);
  return e;
}

/** 断线续传：取该房间 `since` 之后的事件。 */
export const eventsSince = (roomId: string, since: number): RoomEvent[] =>
  stmtSinceRoom.all(roomId, since).map(toEvent);

export const currentEventId = (): number => stmtMaxId.get()?.m ?? 0;

// ---------- 全局轮询器 ----------

let lastPolled = currentEventId();
let poller: NodeJS.Timeout | null = null;

/** 每 250ms 扫一次新事件。跨实例可见性 + 兜底。全局一个，不是每连接一个。 */
export function startEventPoller(intervalMs = 250): void {
  if (poller) return;
  poller = setInterval(() => {
    try {
      const rows = stmtSince.all(lastPolled);
      for (const r of rows) {
        lastPolled = Math.max(lastPolled, r.id);
        dispatch(toEvent(r));
      }
    } catch { /* 数据库瞬时不可用时静默跳过，下一轮再试 */ }
  }, intervalMs);
  poller.unref();
}

export function stopEventPoller(): void {
  if (poller) { clearInterval(poller); poller = null; }
}

/**
 * 保留期裁剪（§7）。这是 transport 基础设施，不需要永久保存；
 * 业务历史在 prayer_session_events，两者不要混淆。
 */
export const REALTIME_RETENTION_MS = 48 * 60 * 60 * 1000;   // 48 小时
export function sweepRealtimeEvents(): number {
  return stmtSweep.run(Date.now() - REALTIME_RETENTION_MS).changes;
}

/**
 * 多实例检测（§25）：本地文件 SQLite 无法跨实例共享，必须明说。
 * 返回一段在启动日志里打印的说明。
 */
export function realtimeDeploymentNote(dbPath: string): string {
  const shared = dbPath === ':memory:' ? false : /^(\/mnt|\/data|\/\/|[a-zA-Z]:\\\\)/.test(dbPath) === false;
  void shared;
  return dbPath === ':memory:'
    ? '[amas-backend] realtime: in-memory DB — single process only.'
    : `[amas-backend] realtime: SSE over authenticated fetch; durable events in SQLite (${dbPath}). `
      + 'NOTE: local-file SQLite means this service is SINGLE-INSTANCE. '
      + 'Running multiple instances would give each its own database — realtime and data would both diverge.';
}
