/**
 * DB-13C · realtime 游标与去重的竞态回归
 *
 * 这一组针对的是「事件日志从**独占的本地 SQLite** 变成**共享的 Postgres**」
 * 之后才存在的四类竞态。它们都无法靠真实时序碰运气来测 ——
 * 每一条都用注入延迟 / 手动驱动轮询做成**确定性**的。
 *
 * 四条各自对应一个曾经真实存在的缺陷（修复前必然失败）：
 *
 *   1. **远端较小 id 被永久跳过**
 *      `emitRoomEvent` 曾把全局轮询游标抬到自己那条的 id。
 *      远端提交 #10 尚未被本地读到时，本地 emit 拿到 #11 并把游标推到 11，
 *      下一轮 `id > 11` 就再也看不到 #10 —— 永久丢失，不是延迟。
 *
 *   2. **插入响应慢于轮询 → 重复投递**
 *      轮询器先读到本地刚写的行并投递，随后 INSERT 的响应才返回，
 *      `emitRoomEvent` 再投递一次。客户端收到两条同 id 事件。
 *
 *   3. **启动期游标未就绪 → 历史全量重放**
 *      起始游标是异步取的；在它返回之前轮询器若开跑，会从 0 开始
 *      把表里所有历史事件重新投递给订阅者。
 *
 *   4. **stop 之后在途轮询仍然投递 / 污染重启后的游标**
 *      停掉轮询器时已经发出的那次查询仍会返回，若不作废，
 *      既会在停止后继续分发，也会用上一代的结果覆盖重启后的新游标。
 *
 * 这里直接驱动 `realtime/roomEvents.ts` 的测试钩子，不经 HTTP ——
 * 竞态要的是对时序的精确控制，绕一圈 SSE 反而测不准。
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeSupabase, type FakeSupabase } from './helpers/supabaseHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(BACKEND_ROOT, '.tmp-test');
const DB_PATH = path.join(TMP, `db13c-cursor-${process.pid}-${Date.now()}.sqlite`);

const TABLE = 'app_room_realtime_events';
const ROOM = 'prayer_room';
const ROOM_B = 'praise_room';

let sb: FakeSupabase;
let bus: typeof import('../realtime/roomEvents.js');

/**
 * 直接往 Postgres 侧塞一行「**远端实例写的**」事件。
 *
 * 关键在于它**不经过本地 `emitRoomEvent`**：没有本地直发、
 * 没有去重标记，本实例只可能通过轮询看见它 —— 这正是要测的路径。
 */
function remoteInsert(id: number, roomId = ROOM, at = Date.now()): void {
  sb.seedTable(TABLE, [
    ...sb.tableRows(TABLE),
    {
      id, room_id: roomId, event_type: 'prayer.changed',
      entity_id: `remote-${id}`, entity_revision: null,
      created_at: new Date(at).toISOString(),
    },
  ]);
}

before(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  sb = await startFakeSupabase();
  sb.seedTable('app_rooms', [ROOM, ROOM_B].map(id => ({
    id, host_type: 'system', host_user_id: null, host_orphaned_at: null,
    password_hash: null, password_salt: null, created_at: new Date(1000).toISOString(),
  })));
  process.env.DB_PATH = DB_PATH;           // DB-13A 守卫要求显式给
  process.env.SUPABASE_URL = sb.origin;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'db13c-cursor-key';
  bus = await import('../realtime/roomEvents.js');
});

after(async () => {
  bus?.stopEventPoller();
  await sb?.stop();
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
});

beforeEach(() => {
  bus.stopEventPoller();
  sb.seedTable(TABLE, []);
  bus.__testing.clearDedupe();
  bus.__testing.primeCursor(0);
});

/** 收集某房间收到的全部 eventId。 */
function collect(roomId: string): { ids: number[]; off: () => void } {
  const ids: number[] = [];
  const off = bus.subscribeRoom(roomId, e => ids.push(e.eventId));
  return { ids, off };
}

describe('DB-13C · 游标与去重竞态', () => {
  test('★ 1 远端较小 id 不会被本地 emit 挤掉（修复前：永久跳过）', async () => {
    // 远端实例已提交 #10 并且可见，但本地游标还停在 9。
    remoteInsert(10);
    bus.__testing.primeCursor(9);

    const sub = collect(ROOM);
    try {
      // 本地发一条 —— 它会拿到比 10 更大的 id。
      const local = await bus.emitRoomEvent(ROOM, 'session.changed', 'local-one');
      assert.ok(local);
      assert.ok(local!.eventId > 10, '前置条件：本地事件的 id 应大于远端那条');

      // 修复前：emit 把游标抬到 local.eventId，下一轮 id > 11 永远看不到 #10。
      assert.equal(bus.__testing.cursor(), 9,
        'emitRoomEvent 不得推进全局轮询游标 —— 那会永久跳过远端较小 id');

      const delivered = await bus.__testing.pollOnce();
      assert.ok(delivered >= 1, '轮询应补上远端事件');
      assert.ok(sub.ids.includes(10), '远端 #10 必须被投递（修复前会被永久跳过）');
      assert.ok(sub.ids.includes(local!.eventId), '本地事件也应已投递');
      // 本地那条由 emit 直发过，轮询再读到时必须去重，不能出现两次。
      assert.equal(sub.ids.filter(id => id === local!.eventId).length, 1);
    } finally { sub.off(); }
  });

  test('★ 2 插入响应慢于轮询时不重复投递（修复前：同一 id 投两次）', async () => {
    bus.__testing.primeCursor(0);
    const sub = collect(ROOM);
    try {
      // 让 INSERT 的响应延迟 200ms 返回。行在延迟**之前**就已写进表里
      // （harness 是先执行再延迟响应），因此轮询器能先看到它。
      sb.delayTable(TABLE, 200, 1);
      const emitting = bus.emitRoomEvent(ROOM, 'prayer.changed', 'slow-insert');

      // 等一小会儿让那一行落库，然后在 emit 的响应回来之前跑一轮轮询。
      await new Promise(r => setTimeout(r, 60));
      await bus.__testing.pollOnce();
      const afterPoll = [...sub.ids];
      assert.equal(afterPoll.length, 1, '轮询应已投递这条事件');

      const e = await emitting;
      assert.ok(e);
      // 修复前：emit 在响应返回后又 dispatch 一次 → 同一 id 出现两次。
      assert.equal(sub.ids.filter(id => id === e!.eventId).length, 1,
        '同一 eventId 只能被投递一次，无论来自直发还是轮询');
      assert.deepEqual(sub.ids, afterPoll, 'emit 返回后不得再多发一条');
    } finally { sub.off(); }
  });

  test('★ 3 启动期游标未就绪时不重放历史（修复前：从 0 全量重发）', async () => {
    // 表里已有一批历史事件。
    for (const id of [101, 102, 103]) remoteInsert(id);

    const sub = collect(ROOM);
    try {
      // 让「取当前最大 id」这次查询慢下来，制造出「启动了但游标还没就绪」的窗口。
      sb.delayTable(TABLE, 150, 1);
      bus.startEventPoller(10_000);   // 间隔调大，本用例只手动驱动

      // 就绪之前：轮询必须空转，一条历史都不能发。
      assert.equal(bus.__testing.isReady(), false, '前置条件：此刻游标应尚未就绪');
      assert.equal(await bus.__testing.pollOnce(), 0,
        '游标未就绪时轮询必须空转 —— 否则会从 0 开始重放全部历史');
      assert.deepEqual(sub.ids, [], '未就绪期间不得投递任何历史事件');

      // 就绪之后：游标应对齐到当前最大 id，历史仍然不重发。
      await new Promise(r => setTimeout(r, 250));
      assert.equal(bus.__testing.isReady(), true);
      assert.equal(bus.__testing.cursor(), 103, '起始游标应对齐到当前最大 id');
      await bus.__testing.pollOnce();
      assert.deepEqual(sub.ids, [], '启动后不得重放启动前就存在的事件');

      // 新事件照常能收到。
      remoteInsert(104);
      await bus.__testing.pollOnce();
      assert.deepEqual(sub.ids, [104], '启动后的新事件应正常投递');
    } finally {
      sub.off();
      bus.stopEventPoller();
    }
  });

  test('★ 4 stop 之后在途轮询不再投递，也不污染重启后的游标', async () => {
    for (const id of [201, 202]) remoteInsert(id);
    bus.__testing.primeCursor(200);

    const sub = collect(ROOM);
    try {
      // 发一轮会延迟返回的轮询，然后在它返回之前 stop。
      sb.delayTable(TABLE, 200, 1);
      const inflight = bus.__testing.pollOnce();
      await new Promise(r => setTimeout(r, 30));
      bus.stopEventPoller();

      assert.equal(await inflight, 0, 'stop 之后返回的轮询结果必须作废');
      assert.deepEqual(sub.ids, [], 'stop 之后不得再投递任何事件');
      assert.equal(bus.__testing.cursor(), 200,
        '作废的那一轮不得推进游标');

      // 重启：游标重新对齐到当前最大 id，不受上一代影响，也不重放历史。
      bus.startEventPoller(10_000);
      await new Promise(r => setTimeout(r, 80));
      assert.equal(bus.__testing.isReady(), true);
      assert.equal(bus.__testing.cursor(), 202, '重启后游标应重新对齐到最大 id');
      await bus.__testing.pollOnce();
      assert.deepEqual(sub.ids, [], '重启不得重放历史事件');
    } finally {
      sub.off();
      bus.stopEventPoller();
    }
  });

  test('回看窗口能补上窗口内迟到提交的较小 id', async () => {
    // 模拟「拿到较小 id 的事务提交得更晚」：先让 #310 可见并被读到，
    // 之后 #305 才出现在表里。
    remoteInsert(310);
    bus.__testing.primeCursor(300);
    const sub = collect(ROOM);
    try {
      await bus.__testing.pollOnce();
      assert.deepEqual(sub.ids, [310]);
      assert.equal(bus.__testing.cursor(), 310);

      // 迟到提交：id 比游标小，但落在回看窗口内。
      remoteInsert(305);
      await bus.__testing.pollOnce();
      assert.ok(sub.ids.includes(305),
        '回看窗口内的迟到提交应能被补上');
      assert.equal(sub.ids.filter(id => id === 310).length, 1,
        '回看不得导致已投递事件重复');
    } finally { sub.off(); }
  });

  test('★ 超出回看窗口的迟到提交会丢 —— 这是已声明的限制，不是意外', async () => {
    // 这条**故意断言限制本身**。它存在的意义是：如果哪天有人把
    // POLL_OVERLAP 改大/改小或换了投递机制，这条会立刻提醒他
    // 「无损投递」这个说法的边界在哪里，而不是让文档和实现悄悄分叉。
    const overlap = bus.__testing.overlap;
    remoteInsert(1000);
    bus.__testing.primeCursor(990);
    const sub = collect(ROOM);
    try {
      await bus.__testing.pollOnce();
      assert.equal(bus.__testing.cursor(), 1000);

      // 迟到提交的 id 远在窗口之外。
      const tooOld = 1000 - overlap - 10;
      remoteInsert(tooOld);
      await bus.__testing.pollOnce();
      assert.equal(sub.ids.includes(tooOld), false,
        `超出 ${overlap} id 回看窗口的迟到提交确实会丢 —— ` +
        '因此不得声称事件投递无损；客户端侧的周期性 REST 刷新才是兜底');
    } finally { sub.off(); }
  });

  test('房间隔离在轮询路径上同样成立', async () => {
    remoteInsert(401, ROOM);
    remoteInsert(402, ROOM_B);
    bus.__testing.primeCursor(400);
    const a = collect(ROOM);
    const b = collect(ROOM_B);
    try {
      await bus.__testing.pollOnce();
      assert.deepEqual(a.ids, [401], 'Room A 只应收到自己的事件');
      assert.deepEqual(b.ids, [402], 'Room B 只应收到自己的事件');
    } finally { a.off(); b.off(); }
  });
});

// ═══════════════════ 保留期计数不得少报 ═══════════════════

describe('DB-13C · 保留期裁剪的计数正确性', () => {
  test('★ 过期事件多于 PostgREST 行数上限时不得少报（修复前：按上限截断）', async () => {
    bus.stopEventPoller();
    // 造 250 条过期事件，并把单次查询上限压到 100 —— 复刻
    // 「过期行数 > max-rows」的情形。
    const old = Date.now() - bus.REALTIME_RETENTION_MS - 60_000;
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 250; i++) {
      rows.push({
        id: 5000 + i, room_id: ROOM, event_type: 'prayer.changed',
        entity_id: `old-${i}`, entity_revision: null,
        created_at: new Date(old).toISOString(),
      });
    }
    // 一条没过期的，用来确认不会被误删。
    rows.push({
      id: 9000, room_id: ROOM, event_type: 'prayer.changed',
      entity_id: 'fresh', entity_revision: null,
      created_at: new Date().toISOString(),
    });
    sb.seedTable(TABLE, rows);

    const swept = await bus.sweepRealtimeEvents();
    // 修复前用「先 select=id 再数数组长度」，会被行数上限截断而少报。
    assert.equal(swept, 250, `应报告 250 条，实际 ${swept} —— 计数被行数上限截断了`);
    const left = sb.tableRows(TABLE);
    assert.equal(left.length, 1, '只应剩下那条未过期的');
    assert.equal(left[0]!.entity_id, 'fresh');
  });
});
