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
 * 1. **进程内直发**：本实例写完事件后立刻 fan-out 给本进程订阅者 → 亚秒级。
 * 2. **数据库轮询**：一个**全局**轮询器（250ms）扫新行。
 *    它保证两件事：其他实例写的事件本实例也能看到；以及本地直发漏掉时兜底。
 *
 * 全局只有一个轮询器（不是每连接一个）。
 *
 * ## DB-13C：持久层换成共享 Postgres —— 游标语义必须跟着变
 *
 * 事件日志从 SQLite `room_realtime_events` 换成
 * `public.app_room_realtime_events`。SQLite 时期只有本进程一个写入方，
 * 所以「本地写完就把游标抬到自己这条」是安全的。**共享日志下不成立**：
 *
 * ```
 * 远端实例提交 event#10（已可见，本地尚未轮询到，cursor 还停在 9）
 * 本地 emit → 拿到 event#11 → 若把 cursor 抬到 11
 * 下一轮查 id > 11 → #10 被永久跳过，本地订阅者再也收不到它
 * ```
 *
 * 因此本轮把「去重」和「游标」拆成两件独立的事：
 *
 *   · **游标只由轮询器推进**。`emitRoomEvent` 绝不碰 `lastPolled`。
 *   · **去重靠已投递事件 id 的环形集合**，与游标无关。
 *     本地直发先标记 id；轮询器随后读到同一行时 `dispatch` 直接返回 false。
 *
 * 这样既不会漏远端事件，也不会因为「插入响应比轮询慢」而重复投递。
 *
 * ## ⚠️ 一个无法靠游标消除的固有限制（必须如实声明）
 *
 * Postgres 的 IDENTITY **分配顺序不等于提交顺序**：拿到 id 10 的事务
 * 完全可能在 id 11 已经可见之后才提交。任何「id > cursor」的轮询
 * 都可能永久跳过这种迟到的较小 id。
 *
 * 本模块用一个**有界回看窗口**（`POLL_OVERLAP`）缓解：每轮从
 * `lastPolled - POLL_OVERLAP` 开始扫，重复的由去重集合滤掉。
 * 落在窗口内的迟到提交能被补上；**超出窗口的仍会丢**。
 *
 * 所以：**不得声称事件投递是无损的**。真正的兜底是客户端侧 ——
 * SSE 只是「有东西变了」的提示，客户端收到后回 REST 拿 canonical state，
 * 并且断线重连时会做一次 full refresh（§8）。少收到一条提示，
 * 最坏后果是多等一个轮询周期，不会产生错误状态。
 *
 * ## 多实例：只对事件日志成立，不要 over-claim
 *
 * 事件日志现在是**共享的 Postgres 表**，因此 realtime 这一层跨实例可见。
 * 但 legacy 用户身份（`users` / `legacy_user_map`）仍在本地 SQLite，
 * 所以**整个后端尚未被验证为多实例安全**。启动日志必须精确表达这个区分，
 * 见 `realtimeDeploymentNote()`。
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

// ---------- 去重（与游标彻底解耦） ----------

/**
 * 已投递事件 id 的环形集合。容量必须 **大于** `POLL_OVERLAP`，
 * 否则回看窗口里的旧事件会因为已被淘汰而重复投递一次。
 */
const DEDUPE_CAPACITY = 2000;
const dispatchedIds = new Set<number>();
const dispatchedOrder: number[] = [];

/** 首次见到返回 true；已投递过返回 false。 */
function markDispatched(eventId: number): boolean {
  if (dispatchedIds.has(eventId)) return false;
  dispatchedIds.add(eventId);
  dispatchedOrder.push(eventId);
  if (dispatchedOrder.length > DEDUPE_CAPACITY) {
    const evicted = dispatchedOrder.shift()!;
    dispatchedIds.delete(evicted);
  }
  return true;
}

/**
 * 严格按 roomId 分发——Room A 的事件绝不会到达 Room B 的订阅者（§24）。
 * 同一个 eventId 只会被分发一次，无论它来自本地直发还是轮询器。
 *
 * @returns 是否真的分发了（false = 这条已经发过）
 */
function dispatch(e: RoomEvent): boolean {
  if (!markDispatched(e.eventId)) return false;
  const set = listeners.get(e.roomId);
  if (!set) return true;   // 没人订阅也算「已处理」，不要留给下一轮重发
  for (const fn of set) { try { fn(e); } catch { /* 单个订阅者异常不影响其他人 */ } }
  return true;
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
 * 会因为瞬时网络问题失败。而调用点都在业务写**成功之后** ——
 * 让一个通知失败去把 200 变成 500，会让客户端以为操作没成功而重试，
 * 那比「少收到一次变更提示」糟得多。
 *
 * ⚠️ **INSERT 失败的事件是不存在的事件，不可能靠续传补回来** ——
 * 续传读的是表里的行，没写进去就没有行。唯一的兜底是客户端侧的
 * 周期性刷新（客户端本来就在轮询 canonical state）。这一点不要说成
 * 「replay 可恢复」。
 *
 * ── 为什么这里不碰轮询游标 ──────────────────────────────────────────
 * 见文件头：共享日志下抬高全局游标会永久跳过远端较小 id。
 * 去重由 `dispatch()` 的 id 集合负责，与游标无关。
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
    // 只标记 + 直发；**不动 lastPolled**。
    // 若轮询器在插入响应返回之前已经读到并投递了这一行，
    // 这里的 dispatch 会因为去重返回 false —— 不会重复投递。
    dispatch(e);
    return e;
  } catch (err) {
    console.error(
      `[realtime] emit failed room=${roomId} type=${type}:`, (err as Error).message,
    );
    return null;
  }
}

/**
 * 断线续传：取该房间 `since` 之后的事件。
 *
 * 与轮询器同样受「IDENTITY 分配顺序 ≠ 提交顺序」的限制：客户端的游标
 * 之下若有迟到提交的行，这次续传取不到它。客户端重连后本来就会做一次
 * full refresh（§8），那才是真正的兜底 —— 续传只是减少刷新前的空窗。
 */
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

/**
 * 每轮回看的 id 窗口。用于缓解「IDENTITY 分配顺序 ≠ 提交顺序」：
 * 落在 `lastPolled - POLL_OVERLAP` 之内的迟到提交能被补上。
 *
 * 取值权衡：窗口越大越不容易漏，但每轮要多读这么多行（250ms 一次，
 * 打的是 Supabase pooler）。事件日志是易失的、量很小的 transport 数据，
 * 50 足以覆盖正常的提交抖动；**超出窗口的仍会丢，这是已声明的限制**。
 */
const POLL_OVERLAP = 50;

let lastPolled = 0;
/**
 * 投递基线：**本进程启动时就已存在**的事件 id 上界。
 *
 * 回看窗口会把 `lastPolled - POLL_OVERLAP` 之后的行重新读回来。
 * 没有这个基线的话，进程一启动就会把窗口内的历史事件当成新事件
 * 重发一遍给订阅者。
 *
 * 「≤ 基线」的事件视为**本进程启动前就存在**，不由它投递：
 * 那些事件要么已经被上一个进程发过，要么本来就不属于本进程的订阅者
 * （SSE 客户端是启动之后才连上来的，且带自己的 `since` 走续传）。
 * 代价是：id 小于基线的迟到提交本进程不会主动推送 ——
 * 客户端仍能通过 `eventsSince` 与周期性 REST 刷新拿到它。
 */
let dispatchFloor = 0;
let poller: NodeJS.Timeout | null = null;
/** 上一轮还没跑完就不要再发一轮 —— 否则慢查询会把轮询叠成雪崩。 */
let polling = false;
/**
 * 起始游标是否已就绪。没就绪时不能轮询 —— 否则会从 0 开始
 * 把历史事件全量重放给订阅者。
 */
let ready = false;
/**
 * 每次 start/stop 自增。在途的异步操作用它判断自己是否已经过期：
 * stop 之后返回的轮询结果、或被 stop 打断的初始化，一律丢弃。
 */
let generation = 0;

/** 跑一轮轮询。返回本轮**真正新投递**的事件数。 */
async function pollOnce(): Promise<number> {
  if (!ready || polling || !stagingConfigured()) return 0;
  polling = true;
  const gen = generation;
  try {
    const floor = Math.max(0, lastPolled - POLL_OVERLAP);
    const rows = await eventsSinceGlobal(floor);
    // 期间被 stop / restart 过 —— 结果属于上一代，丢弃，且不得推进新游标。
    if (gen !== generation) return 0;
    let delivered = 0;
    for (const e of rows) {
      lastPolled = Math.max(lastPolled, e.eventId);
      // 启动基线之下的是「本进程启动前就存在的事件」，不重发。
      if (e.eventId <= dispatchFloor) continue;
      if (dispatch(e)) delivered += 1;
    }
    return delivered;
  } catch {
    return 0;   // 瞬时不可用时静默跳过，下一轮再试
  } finally {
    polling = false;
  }
}

/**
 * 每 250ms 扫一次新事件。跨实例可见性 + 兜底。全局一个，不是每连接一个。
 *
 * 起始游标**异步**取自当前最大 id，取到之前 `ready` 为 false，
 * 轮询器空转 —— 否则会把历史事件全量重放一遍。
 */
export function startEventPoller(intervalMs = 250): void {
  if (poller) return;
  const gen = ++generation;
  ready = false;
  void (async () => {
    const id = await currentEventId();
    // 初始化期间被 stop / 又 start 过 → 这个结果已经过期，丢弃。
    if (gen !== generation) return;
    lastPolled = id;
    dispatchFloor = id;   // 启动时已存在的事件不由本进程投递
    ready = true;
  })();
  poller = setInterval(() => { void pollOnce(); }, intervalMs);
  poller.unref();
}

export function stopEventPoller(): void {
  if (poller) { clearInterval(poller); poller = null; }
  // 让在途的初始化与轮询结果全部作废，避免 stop 之后仍然分发、
  // 或 restart 之后被上一代的游标覆盖。
  generation += 1;
  ready = false;
  polling = false;
}

/**
 * 测试专用钩子。**不要在产品代码里用。**
 *
 * 轮询是定时器驱动的，用真实时间等 250ms 会让测试既慢又不确定；
 * 这里把「跑一轮」暴露出来，测试就能确定性地驱动它。
 */
export const __testing = {
  pollOnce,
  cursor: (): number => lastPolled,
  isReady: (): boolean => ready,
  /**
   * 直接设置游标与就绪态，用于构造「远端事件已存在但本地游标落后」的场景。
   * 刻意把投递基线置 0 —— 这些用例要观察的正是「窗口内的事件会不会被投递」。
   */
  primeCursor(at: number): void { lastPolled = at; dispatchFloor = 0; ready = true; },
  floor: (): number => dispatchFloor,
  /** 清空去重集合 —— 用于验证「不去重就会重复投递」的对照。 */
  clearDedupe(): void { dispatchedIds.clear(); dispatchedOrder.length = 0; },
  overlap: POLL_OVERLAP,
};

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
    + 'running multiple instances would give each its own identity store. '
    + 'Event delivery is best-effort, not lossless: identity allocation order '
    + 'is not commit order, so a late-committing lower id beyond the '
    + `${POLL_OVERLAP}-id look-back window can be skipped; clients reconcile `
    + 'via periodic REST refresh.';
}
