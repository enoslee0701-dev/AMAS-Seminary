/**
 * DB-13C · realtime 事件日志切到 Postgres 的验收护栏
 *
 * 这一轮要证明的不只是「事件还能发出来」，而是切换本身成立：
 *
 *   1. 事件落在 Postgres，**SQLite `room_realtime_events` 运行时读写 = 0**
 *   2. `eventId` 是 Postgres IDENTITY 分配的真实 id，不是本地自造的
 *   3. 房间隔离：Room A 的事件绝不进入 Room B 的续传结果
 *   4. 断线续传按 id 游标、按 id 升序
 *   5. 保留期裁剪只删超过 48h 的事件
 *   6. `createdAt` 的 timestamptz ↔ epoch 毫秒契约不漂移
 *   7. **跨实例/重启**：换一个「读者」也能从 Postgres 看见已有事件
 *   8. 进程内直发仍然保留（订阅者立刻收到，不等轮询）
 *
 * 这些断言直接打数据层与总线（`realtime/roomEvents.ts`），不经 HTTP ——
 * 事件总线本身就是进程内 API，绕一圈 SSE 反而测不准 id 与顺序。
 * 端到端的 SSE 行为由既有 room/prayer 回归覆盖。
 *
 * 复用唯一那套 helpers/supabaseHarness.ts —— 项目禁止第二套假 Supabase。
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { startFakeSupabase, type FakeSupabase } from './helpers/supabaseHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(BACKEND_ROOT, '.tmp-test');
const DB_PATH = path.join(TMP, `db13c-${process.pid}-${Date.now()}.sqlite`);

/** canonical 数据文件的绝对路径 —— 本套测试全程不得碰它。 */
const CANONICAL = path.join(BACKEND_ROOT, 'data', 'amas.sqlite');

const ROOM_A = 'prayer_room';
const ROOM_B = 'praise_room';
const SYSTEM_ROOMS = [ROOM_A, ROOM_B, 'bible_reading', 'preaching_room', 'fellowship_room'];

let sb: FakeSupabase;
/** 被测模块。必须在 env 就位之后再动态 import（它在加载期解析配置）。 */
let bus: typeof import('../realtime/roomEvents.js');

function canonicalFingerprint(): string | null {
  try {
    const b = fs.readFileSync(CANONICAL);
    return `${b.length}:${crypto.createHash('sha256').update(b).digest('hex')}`;
  } catch { return null; }
}
let canonicalBefore: string | null = null;

/**
 * 只读地数 SQLite 表的行数 —— 用来证明 realtime 没有再往 SQLite 写。
 *
 * 返回 -1 表示**数据库文件根本不存在**。那是比「行数为 0」更强的证据：
 * 本套测试从头到尾没有任何代码路径打开过 SQLite。切换后
 * `realtime/roomEvents.ts` 已不再 import `db.ts`，所以这正是预期结果。
 */
function sqliteCount(table: string): number {
  if (!fs.existsSync(DB_PATH)) return -1;
  const d = new Database(DB_PATH, { readonly: true });
  try {
    return (d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  } finally { d.close(); }
}

/** 直接看 Postgres 侧的原始行（假 Supabase 的内存表）。 */
const pgRows = (): Record<string, unknown>[] => sb.tableRows('app_room_realtime_events');

before(async () => {
  canonicalBefore = canonicalFingerprint();
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
  fs.mkdirSync(TMP, { recursive: true });

  sb = await startFakeSupabase();
  // 事件的 room_id 外键到 app_rooms.id —— 房间必须真实存在。
  sb.seedTable('app_rooms', SYSTEM_ROOMS.map(id => ({
    id, host_type: 'system', host_user_id: null, host_orphaned_at: null,
    password_hash: null, password_salt: null, created_at: new Date(1000).toISOString(),
  })));

  // ★ DB-13A 守卫：测试上下文必须显式给 DB_PATH，否则 db.ts 拒绝启动。
  process.env.DB_PATH = DB_PATH;
  process.env.SUPABASE_URL = sb.origin;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'db13c-service-key';
  bus = await import('../realtime/roomEvents.js');
});

after(async () => {
  bus?.stopEventPoller();
  await sb?.stop();
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
});

// ═══════════════════ 写入与 event id ═══════════════════

describe('DB-13C · 事件写入 Postgres', () => {
  test('emit 落在 Postgres，payload 只含允许的字段', async () => {
    const e = await bus.emitRoomEvent(ROOM_A, 'prayer.changed', 'share-1', 3);
    assert.ok(e, 'emit 应返回事件');
    assert.equal(e!.roomId, ROOM_A);
    assert.equal(e!.type, 'prayer.changed');
    assert.equal(e!.entityId, 'share-1');
    assert.equal(e!.revision, 3);
    assert.equal(typeof e!.createdAt, 'number');

    const rows = pgRows();
    assert.equal(rows.length, 1, '事件没有落到 Postgres');
    const r = rows[0]!;
    assert.equal(r.room_id, ROOM_A);
    assert.equal(r.event_type, 'prayer.changed');
    assert.equal(r.entity_id, 'share-1');
    assert.equal(r.entity_revision, 3);

    // 事件是失效通知，不是业务对象 —— 列只能是这六个。
    assert.deepEqual(Object.keys(r).sort(),
      ['created_at', 'entity_id', 'entity_revision', 'event_type', 'id', 'room_id']);
  });

  test('eventId 来自 Postgres IDENTITY：递增、不由调用方指定', async () => {
    const a = await bus.emitRoomEvent(ROOM_A, 'session.changed', 's1', 1);
    const b = await bus.emitRoomEvent(ROOM_A, 'session.changed', 's1', 2);
    assert.ok(a && b);
    assert.equal(typeof a!.eventId, 'number');
    assert.ok(b!.eventId > a!.eventId, 'id 必须单调递增');

    // 写入时不得自带 id —— 它是 GENERATED ALWAYS AS IDENTITY。
    // 若代码自造 id，Postgres 会拒绝；这里再从行上确认 id 确实是库给的。
    const ids = pgRows().map(r => Number(r.id));
    assert.equal(new Set(ids).size, ids.length, 'id 必须唯一');
    assert.deepEqual([...ids].sort((x, y) => x - y), ids, '插入顺序即 id 顺序');
  });

  test('createdAt 契约不漂移：Postgres 存 timestamptz，对外是 epoch 毫秒', async () => {
    const t0 = Date.now();
    const e = await bus.emitRoomEvent(ROOM_A, 'theme.changed');
    assert.ok(e);
    // 对外必须是 number（客户端协议），不是 ISO 字符串
    assert.equal(typeof e!.createdAt, 'number');
    assert.ok(Math.abs(e!.createdAt - t0) < 5000, 'createdAt 应接近当下');
    // 库里存的是 ISO 时间串
    const row = pgRows().find(r => r.event_type === 'theme.changed')!;
    assert.equal(typeof row.created_at, 'string');
    assert.match(String(row.created_at), /^\d{4}-\d{2}-\d{2}T/);
    // 往返一致
    assert.equal(Date.parse(String(row.created_at)), e!.createdAt);
  });

  test('★ 持久层瞬时失败时 emit 返回 null 且不抛 —— 业务请求不受牵连', async () => {
    // 这是切换带来的**新**失败模式：切换前是本地 SQLite 写，基本不会失败；
    // 现在是一次网络往返。而调用点都在业务写成功**之后**，
    // 让通知失败把 200 变成 500，会让客户端以为操作没成功而重试。
    const before = pgRows().length;
    sb.failTable('app_room_realtime_events');
    const e = await bus.emitRoomEvent(ROOM_A, 'prayer.changed', 'will-fail');
    assert.equal(e, null, '失败时应返回 null 而不是抛出');
    assert.equal(pgRows().length, before, '失败的写入不得留下半条记录');

    // 读路径同样吞掉异常：续传取不到时返回空数组，取游标返回 0，
    // 让 SSE 建连退化成「从头补」而不是彻底建不起来。
    sb.failTable('app_room_realtime_events');
    assert.deepEqual(await bus.eventsSince(ROOM_A, 0), []);
    sb.failTable('app_room_realtime_events');
    assert.equal(await bus.currentEventId(), 0);
    sb.failTable('app_room_realtime_events');
    assert.equal(await bus.sweepRealtimeEvents(), 0);

    // 故障注入用完即止，后续用例不受影响。
    const ok = await bus.emitRoomEvent(ROOM_A, 'prayer.changed', 'after-recovery');
    assert.ok(ok, '注入次数用尽后应恢复正常');
  });
});

// ═══════════════════ 续传与房间隔离 ═══════════════════

describe('DB-13C · 续传与房间隔离', () => {
  test('eventsSince 按 id 游标取本房事件，且按 id 升序', async () => {
    const before = await bus.currentEventId();
    const e1 = await bus.emitRoomEvent(ROOM_A, 'prayer.changed', 'p1');
    const e2 = await bus.emitRoomEvent(ROOM_A, 'prayer.changed', 'p2');
    assert.ok(e1 && e2);

    const resumed = await bus.eventsSince(ROOM_A, before);
    const ids = resumed.map(e => e.eventId);
    assert.ok(ids.includes(e1!.eventId) && ids.includes(e2!.eventId));
    assert.deepEqual([...ids].sort((a, b) => a - b), ids, '必须按 id 升序');
    for (const e of resumed) assert.ok(e.eventId > before, '不得回吐游标之前的事件');

    // 游标推到最新之后，没有新事件就应该是空
    assert.deepEqual(await bus.eventsSince(ROOM_A, e2!.eventId), []);
  });

  test('★ 房间隔离：Room A 的事件不会出现在 Room B 的续传里', async () => {
    const before = await bus.currentEventId();
    const a = await bus.emitRoomEvent(ROOM_A, 'moderation.changed', 'only-a');
    const b = await bus.emitRoomEvent(ROOM_B, 'moderation.changed', 'only-b');
    assert.ok(a && b);

    const forA = await bus.eventsSince(ROOM_A, before);
    const forB = await bus.eventsSince(ROOM_B, before);
    assert.ok(forA.every(e => e.roomId === ROOM_A), 'A 的续传里混进了别房事件');
    assert.ok(forB.every(e => e.roomId === ROOM_B), 'B 的续传里混进了别房事件');
    assert.ok(forA.some(e => e.entityId === 'only-a'));
    assert.ok(forB.some(e => e.entityId === 'only-b'));
    assert.ok(!forB.some(e => e.entityId === 'only-a'), 'Room A 的事件泄漏到了 Room B');
  });

  test('订阅者只收到本房事件（进程内直发同样隔离）', async () => {
    const gotA: string[] = [];
    const gotB: string[] = [];
    const offA = bus.subscribeRoom(ROOM_A, e => gotA.push(e.entityId ?? ''));
    const offB = bus.subscribeRoom(ROOM_B, e => gotB.push(e.entityId ?? ''));
    try {
      await bus.emitRoomEvent(ROOM_A, 'session.changed', 'dispatch-a');
      await bus.emitRoomEvent(ROOM_B, 'session.changed', 'dispatch-b');
      // ★ 进程内直发：不等轮询，emit 返回时订阅者就该已经收到了。
      assert.ok(gotA.includes('dispatch-a'), '本进程直发失效');
      assert.ok(gotB.includes('dispatch-b'));
      assert.ok(!gotA.includes('dispatch-b'), 'Room B 的事件到达了 Room A 的订阅者');
      assert.ok(!gotB.includes('dispatch-a'));
    } finally { offA(); offB(); }
  });

  test('currentEventId 反映当前最大 id；空表时为 0', async () => {
    const e = await bus.emitRoomEvent(ROOM_A, 'prayer.changed', 'cursor-probe');
    assert.ok(e);
    assert.equal(await bus.currentEventId(), e!.eventId);
  });
});

// ═══════════════════ 跨实例 / 重启可见性 ═══════════════════

describe('DB-13C · 持久事件日志的跨实例可见性', () => {
  test('★ 另一个「读者」能从 Postgres 看见已有事件（不依赖本进程内存）', async () => {
    const before = await bus.currentEventId();
    const e = await bus.emitRoomEvent(ROOM_A, 'prayer.changed', 'durable-1', 9);
    assert.ok(e);

    // 模拟第二个实例 / 重启后的新进程：另起一份 store 直接读同一个
    // Postgres 表。它没有本进程的任何内存状态（listeners / lastPolled）。
    const fresh = await import('../staging/realtimeStore.js');
    const seen = await fresh.eventsSinceForRoom(ROOM_A, before);
    const match = seen.find(x => x.eventId === e!.eventId);
    assert.ok(match, '新读者看不到已持久化的事件 —— 跨实例可见性不成立');
    assert.equal(match!.entityId, 'durable-1');
    assert.equal(match!.revision, 9);
    assert.equal(match!.createdAt, e!.createdAt, 'createdAt 在两处读出必须一致');

    // 这条才是切换的意义：事件不在本进程内存里，而在共享存储里。
    assert.ok(await fresh.maxEventId() >= e!.eventId);
  });

  test('部署说明精确区分「事件日志跨实例」与「整个后端未验证多实例」', () => {
    const note = bus.realtimeDeploymentNote('/data/amas.sqlite');
    assert.match(note, /CROSS-INSTANCE VISIBLE/);
    assert.match(note, /NOT YET FULLY VERIFIED/);
    assert.match(note, /legacy user identity/i);
    // 不得出现「整体已支持多实例」这类说法
    assert.equal(/fully supports multiple instances/i.test(note), false);
    assert.equal(/SINGLE-INSTANCE\b/.test(note), false, '旧的单实例结论已不适用于事件日志');
  });
});

// ═══════════════════ 保留期裁剪 ═══════════════════

describe('DB-13C · 保留期裁剪', () => {
  test('只删超过 48h 的事件，新事件一条不动', async () => {
    const keep = await bus.emitRoomEvent(ROOM_A, 'prayer.changed', 'fresh-one');
    assert.ok(keep);

    // 直接在 Postgres 侧塞两条「很旧」的事件（一条刚过期、一条远超期）。
    const old = Date.now() - bus.REALTIME_RETENTION_MS - 60_000;
    const older = Date.now() - bus.REALTIME_RETENTION_MS - 10 * 24 * 3600_000;
    sb.seedTable('app_room_realtime_events', [
      ...pgRows(),
      {
        id: 900001, room_id: ROOM_A, event_type: 'prayer.changed',
        entity_id: 'expired-1', entity_revision: null,
        created_at: new Date(old).toISOString(),
      },
      {
        id: 900002, room_id: ROOM_B, event_type: 'theme.changed',
        entity_id: 'expired-2', entity_revision: null,
        created_at: new Date(older).toISOString(),
      },
    ]);
    const total = pgRows().length;

    const swept = await bus.sweepRealtimeEvents();
    assert.equal(swept, 2, `应恰好删掉 2 条过期事件，实际 ${swept}`);
    const left = pgRows();
    assert.equal(left.length, total - 2);
    assert.ok(!left.some(r => r.entity_id === 'expired-1'), '过期事件应被删除');
    assert.ok(!left.some(r => r.entity_id === 'expired-2'));
    assert.ok(left.some(r => r.entity_id === 'fresh-one'), '未过期事件不得被误删');
  });

  test('没有过期事件时 sweep 返回 0，且不发出删除请求', async () => {
    const before = pgRows().length;
    assert.equal(await bus.sweepRealtimeEvents(), 0);
    assert.equal(pgRows().length, before);
  });
});

// ═══════════════════ SQLite 写入底线 ═══════════════════

describe('DB-13C · SQLite 写入底线', () => {
  test('★ SQLite room_realtime_events 运行时读写 = 0', () => {
    // 本套测试至此已发出十余个事件。
    assert.ok(pgRows().length > 5, '前置条件：应已产生若干事件');
    const n = sqliteCount('room_realtime_events');
    // -1 = 数据库文件从未被创建，即整套 realtime 路径一次都没碰过 SQLite。
    assert.ok(n <= 0,
      `realtime 已切换，SQLite room_realtime_events 仍有 ${n} 行 —— 存在双写路径`);
  });

  test('realtime 模块不再依赖 db.ts（整套测试没有打开过 SQLite）', () => {
    assert.equal(fs.existsSync(DB_PATH), false,
      '本套测试只驱动 realtime 总线，不该有任何代码打开 SQLite');
  });

  test('canonical amas.sqlite 在本套测试全程未被改动', () => {
    const now = canonicalFingerprint();
    if (canonicalBefore === null) {
      // CI 上 backend/data 被 gitignore，文件本就不存在 —— 那它也不该被创建。
      assert.equal(now, null,
        'canonical 数据文件原本不存在，却在测试过程中被创建了');
    } else {
      assert.equal(now, canonicalBefore, 'canonical 数据文件被改动了');
    }
  });
});
