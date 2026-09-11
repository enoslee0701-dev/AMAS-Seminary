import { stagingConfigured } from '../staging/pgData.js';
import {
  insertEvent, eventsSinceForRoom, eventsSinceGlobal, maxEventId, sweepBefore,
  type RoomEvent, type RoomEventType,
} from '../staging/realtimeStore.js';

/**
 * 房间 Realtime 事件总线（Phase 3）。
 *
 * ## 核心原则：Realtime 不是第二个 State Store
 *
 * 唯一真相源仍是 数据库 + REST + revision。本模块只回答一件事：
 * **「这个房间有东西变了」**。客户端收到后回 REST 拿 canonical state。
 * 因此事件 payload 里**没有任何业务对象**，也没有任何敏感字段
 * （代祷正文 / 匿名作者 / 姓名 / email / 举报人 / hidden_by / JWT）。
 * 字段只有：eventId · roomId · type · entityId · revision · createdAt。
 *
 * ## 投递路径（两条，互为补充）
 *
 * 1. **进程内直发**：写事件后立刻 fan-out 给本进程的订阅者 → 亚秒级。
 * 2. **数据库轮询**：一个**全局**轮询器（250ms）扫 `id > lastSeen` 的新行。
 *    它保证两件事：
 *      - 跨实例：其他实例写的事件也能被本实例看到；
 *      - 断线续传：客户端带 `since` 重连时可从表里补齐。
 *
 * 全局只有一个轮询器（不是每连接一个）。
 *
 * ## DB-13C 切换：持久层换成 Postgres
 *
 * 事件日志从 SQLite `room_realtime_events` 换成
 * `public.app_room_realtime_events`。**语义一条没变**，变的是三件事：
 *
 *   · `eventId` 现在是 Postgres IDENTITY 分配的真实 id
 *     （不再是 SQLite 的 lastInsertRowid），因此跨实例单调且不冲突；
 *   · 写入与读取都变成异步 —— `emitRoomEvent` 因此返回 Promise；
 *   · `room_id` 有外键到 `app_rooms.id`，只能为真实存在的房间发事件。
 *
 * ## 多实例：只对事件日志成立，不要over-claim
 *
 * 事件日志现在是**共享的 Postgres 表**，因此 realtime 这一层
 * 跨实例可见。但 legacy 用户身份（`users` / `legacy_user_map`）仍在本地
 * SQLite，所以**整个后端尚未被验证为多实例安全**。
 * 启动日志必须精确表达这个区分，见 `realtimeDeploymentNote()`。
 */

export type { RoomEvent, RoomEventType };

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
 * **必须在业务写入成功之后调用**（§6）——绝不能出现
 * 「已经通知客户端，数据库随后回滚」。revision 冲突时调用方直接 return，
 * 不会走到这里。
 *
 * ── 为什么失败只记日志、不抛出 ──────────────────────────────────────
 * 切换前这是一次本地 SQLite 写，基本不会失败；现在它是一次网络往返，
 * 会因为瞬时网络问题失败。但业务数据**此时已经写成功了** ——
 * 让一个通知失败去把 200 变成 500，会让客户端以为操作没成功而重试，
 * 那比「少收到一次变更提示」糟得多。少收到的那一次由两条兜底覆盖：
 * 客户端 3s 轮询，以及带 `since` 重连时的续传。
 *
 * 所有调用点都是 fire-and-forget（不消费返回值），因此返回 Promise
 * 不改变它们的写法；调用方用 `void emitRoomEvent(...)` 表明是刻意不等。
 */
export async function emitRoomEvent(
  roomId: string, type: RoomEventType, entityId?: string, revision?: number,
): Promise<RoomEvent | null> {
  if (!stagingConfigured()) return null;
  try {
    const e = await insertEvent({ roomId, type, entityId, revision });
    // 本进程已投递过，避免轮询器再发一次重复事件。
    lastPolled = Math.max(lastPolled, e.eventId);
    dispatch(e);
    return e;
  } catch (err) {
    console.error(
      `[realtime] emit failed room=${roomId} type=${type}:`, (err as Error).message,
    );
    return null;
  }
}

/** 断线续传：取该房间 `since` 之后的事件。 */
export async function eventsSince(roomId: string, since: number): Promise<RoomEvent[]> {
  if (!stagingConfigured()) return [];
  try {
    return await eventsSinceForRoom(roomId, since);
  } catch (e) {
    console.error('[realtime] eventsSince failed:', (e as Error).message);
    return [];
  }
}

/**
 * SSE 建连时的起始游标。
 *
 * 读失败时返回 0 而不是抛出：0 的含义是「从头补」，客户端最多多收到几条
 * 已知事件（它们本来就幂等，收到后回 REST 拿 canonical state）。
 * 让建连失败反而会让客户端彻底收不到实时更新。
 */
export async function currentEventId(): Promise<number> {
  if (!stagingConfigured()) return 0;
  try {
    return await maxEventId();
  } catch (e) {
    console.error('[realtime] currentEventId failed:', (e as Error).message);
    return 0;
  }
}

// ---------- 全局轮询器 ----------

let lastPolled = 0;
let poller: NodeJS.Timeout | null = null;
/** 上一轮还没跑完就不要再发一轮 —— 否则慢查询会把轮询叠成雪崩。 */
let polling = false;

/**
 * 每 250ms 扫一次新事件。跨实例可见性 + 兜底。全局一个，不是每连接一个。
 *
 * 切换后每一轮都是一次网络往返，因此比 SQLite 时期多了两个保护：
 * 起始游标异步初始化（避免从 0 开始把历史事件全重放一遍），
 * 以及 `polling` 重入锁。
 */
export function startEventPoller(intervalMs = 250): void {
  if (poller) return;
  // 先把游标对齐到当前最大 id —— 本实例只关心「从现在起」的新事件。
  void currentEventId().then(id => { lastPolled = Math.max(lastPolled, id); });
  poller = setInterval(() => {
    if (polling || !stagingConfigured()) return;
    polling = true;
    void (async () => {
      try {
        for (const e of await eventsSinceGlobal(lastPolled)) {
          lastPolled = Math.max(lastPolled, e.eventId);
          dispatch(e);
        }
      } catch { /* 瞬时不可用时静默跳过，下一轮再试 */ } finally {
        polling = false;
      }
    })();
  }, intervalMs);
  poller.unref();
}

export function stopEventPoller(): void {
  if (poller) { clearInterval(poller); poller = null; }
  polling = false;
}

/** 测试专用：把轮询游标复位，让下一轮从 `from` 之后重新扫。 */
export function _resetPollCursor(from = 0): void {
  lastPolled = from;
}

/**
 * 保留期裁剪（§7）。这是 transport 基础设施，不需要永久保存；
 * 业务历史在 `app_prayer_session_events`，两者不要混淆。
 */
export const REALTIME_RETENTION_MS = 48 * 60 * 60 * 1000;   // 48 小时
export async function sweepRealtimeEvents(): Promise<number> {
  if (!stagingConfigured()) return 0;
  try {
    return await sweepBefore(Date.now() - REALTIME_RETENTION_MS);
  } catch (e) {
    console.error('[realtime] retention sweep failed:', (e as Error).message);
    return 0;
  }
}

/**
 * 部署形态说明（§25）。**精确表达，不夸大能力。**
 *
 * 切换后事件日志在共享 Postgres 上，所以 realtime 这一层确实跨实例可见。
 * 但 legacy 用户身份仍在本地 SQLite —— 整个后端**尚未**被验证为多实例安全。
 * 这两句必须同时出现，否则读日志的人会得出「可以水平扩容了」的错误结论。
 *
 * @param sqlitePath 仍在使用的本地 SQLite 路径（身份等未迁域）
 */
export function realtimeDeploymentNote(sqlitePath: string): string {
  return '[amas-backend] realtime: SSE over authenticated fetch; '
    + 'durable event log in shared Postgres (public.app_room_realtime_events) — '
    + 'REALTIME EVENT LOG: CROSS-INSTANCE VISIBLE. '
    + 'OVERALL BACKEND MULTI-INSTANCE: NOT YET FULLY VERIFIED — '
    + `legacy user identity still lives in local SQLite (${sqlitePath}); `
    + 'running multiple instances would give each its own identity store.';
}
