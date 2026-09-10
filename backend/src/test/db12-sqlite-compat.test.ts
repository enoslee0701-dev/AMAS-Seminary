/**
 * DB-12 · 旧 SQLite 库升级兼容性
 *
 * db.ts 的建表语句已经去掉了 `prayer_sessions.room_id → rooms(room_id)` 与
 * `room_reading_state.room_id → rooms(room_id)`，但 `CREATE TABLE IF NOT
 * EXISTS` **不会改动已经存在的表**。所以「新装能跑」不等于「旧装能跑」——
 * 升级安装里那两条外键还在，而房间已经由 Postgres 拥有，
 * SQLite 的 `rooms` 里没有那一行，一开祷告会就 FOREIGN KEY constraint failed。
 *
 * 这里证三件事：
 *   1. 旧格式库 → 迁移执行 → 数据一条不丢、其余约束全在、外键检查干净；
 *   2. 新格式库（或已升级库）→ NO-OP，schema 一个字节都不变；
 *   3. **行为层**：一个只存在于 Postgres、SQLite 没有对应 rooms 行的房间，
 *      走仍属遗留的 prayer_sessions / room_reading_state 路径不再报外键错误。
 *
 * 第 3 条才是那个 release blocker 的真实复现路径，
 * 它必须经真实路由（含 requireRoomExists）而不是直接操作数据库。
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { dropObsoleteRoomForeignKeys } from '../migrations/db12RoomFkCompat.js';
import {
  startFakeSupabase, provisionUser, freePort,
  type FakeSupabase, type ProvisionedUser,
} from './helpers/supabaseHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(BACKEND_ROOT, '.tmp-test');

/**
 * DB-12 之前的真实 DDL —— 逐字取自 backend/data/amas.sqlite
 * （`SELECT sql FROM sqlite_master`），不是按 db.ts 现状回写的近似版本。
 * `title TEXT` 紧跟在 updated_at 同一行，是历史 ALTER TABLE ADD COLUMN 的痕迹；
 * 列顺序也是被保全对象之一，所以照抄。
 */
const LEGACY_DDL = [
  `CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  )`,
  `CREATE TABLE rooms (
    room_id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    password_hash TEXT,
    salt TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE prayer_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('scheduled','active','ended')),
    created_by TEXT NOT NULL,
    facilitator_user_id TEXT,
    started_at INTEGER,
    ended_at INTEGER,
    current_item_id TEXT,
    -- 乐观并发控制：每次成功的 manager 命令 +1。
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, title TEXT,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (facilitator_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX idx_sessions_room ON prayer_sessions(room_id, status)`,
  `CREATE UNIQUE INDEX uniq_active_session_per_room
    ON prayer_sessions(room_id) WHERE status = 'active'`,
  `CREATE TABLE prayer_session_items (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES prayer_sessions(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE prayer_session_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES prayer_sessions(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE room_reading_state (
    room_id TEXT PRIMARY KEY,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE room_members (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX idx_room_members_user ON room_members(user_id)`,
];

function rm(p: string): void {
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(p + s, { force: true }); } catch { /* 尽力而为 */ }
  }
}

/** 造一个 DB-12 之前形状的库；`withData` 时再塞入有业务意义的行。 */
function makeLegacyDb(file: string): void {
  rm(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new Database(file);
  d.pragma('foreign_keys = ON');
  for (const sql of LEGACY_DDL) d.exec(sql);
  d.exec('BEGIN');
  d.prepare('INSERT INTO users (id,email,name) VALUES (?,?,?)').run('u1', 'a@x.test', '甲');
  d.prepare('INSERT INTO users (id,email,name) VALUES (?,?,?)').run('u2', 'b@x.test', '乙');
  const room = d.prepare(
    'INSERT INTO rooms (room_id,host_id,password_hash,salt,created_at) VALUES (?,?,?,?,?)',
  );
  room.run('legacy_room', 'u1', null, null, 1000);
  room.run('bible_reading', 'system', null, null, 1000);
  const session = d.prepare(
    `INSERT INTO prayer_sessions
      (id,room_id,status,created_by,facilitator_user_id,started_at,ended_at,
       current_item_id,revision,created_at,updated_at,title)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  session.run('s-active', 'legacy_room', 'active', 'u1', 'u2', 111, null, 'i-1', 7, 100, 200, '旧祷告会');
  session.run('s-ended', 'bible_reading', 'ended', 'u2', null, 50, 60, null, 3, 10, 20, null);
  d.prepare(
    'INSERT INTO prayer_session_items (id,session_id,position,title,created_at) VALUES (?,?,?,?,?)',
  ).run('i-1', 's-active', 1, '为教会祷告', 100);
  d.prepare(
    `INSERT INTO prayer_session_events (id,session_id,actor_user_id,event_type,created_at)
      VALUES (?,?,?,?,?)`,
  ).run('e-1', 's-active', 'u1', 'created', 100);
  d.prepare(
    `INSERT INTO room_reading_state (room_id,book,chapter,verse,revision,updated_by,updated_at)
      VALUES (?,?,?,?,?,?,?)`,
  ).run('bible_reading', '约翰福音', 3, 16, 5, 'u1', 300);
  d.prepare(
    'INSERT INTO room_members (room_id,user_id,joined_at,updated_at,role) VALUES (?,?,?,?,?)',
  ).run('legacy_room', 'u1', 1, 1, 'moderator');
  d.exec('COMMIT');
  d.close();
}

interface PragmaFk {
  from: string; table: string; to: string; on_delete: string; on_update: string;
}

const fkRows = (d: Database.Database, t: string): PragmaFk[] =>
  d.prepare(`PRAGMA foreign_key_list("${t}")`).all() as PragmaFk[];

const fkTargets = (d: Database.Database, t: string): string[] =>
  fkRows(d, t).map(f => f.table.toLowerCase());

/** 外键指纹：含删除/更新动作，与 PRAGMA 返回顺序无关。 */
const fkSig = (d: Database.Database, t: string): string =>
  fkRows(d, t)
    .map(f => `${f.from}->${f.table}.${f.to}:${f.on_delete}:${f.on_update}`)
    .sort().join('|');

const DATA_TABLES = ['users', 'rooms', 'prayer_sessions', 'prayer_session_items',
  'prayer_session_events', 'room_reading_state', 'room_members'];

const snapshot = (d: Database.Database): Record<string, unknown[]> => {
  const out: Record<string, unknown[]> = {};
  for (const t of DATA_TABLES) out[t] = d.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all();
  return out;
};

const schemaOf = (d: Database.Database): unknown[] =>
  d.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name').all();

const countOf = (d: Database.Database, sql: string, ...args: unknown[]): number =>
  (d.prepare(sql).get(...args) as { n: number }).n;

// ═══════════════════════ A. 旧格式库升级 ═══════════════════════

describe('DB-12 兼容迁移 · 旧格式库', () => {
  const FILE = path.join(TMP, `db12-compat-legacy-${process.pid}.sqlite`);
  let d: Database.Database;
  let baseline: Record<string, unknown[]>;
  let rebuilt: string[];

  before(() => {
    makeLegacyDb(FILE);
    d = new Database(FILE);
    d.pragma('foreign_keys = ON');
    baseline = snapshot(d);
    // 前置条件：那两条失效外键确实在册，否则这组断言毫无意义。
    assert.ok(fkTargets(d, 'prayer_sessions').includes('rooms'));
    assert.ok(fkTargets(d, 'room_reading_state').includes('rooms'));
    rebuilt = dropObsoleteRoomForeignKeys(d);
  });

  after(() => { d?.close(); rm(FILE); });

  test('两张目标表被重建', () => {
    assert.deepEqual(rebuilt.slice().sort(), ['prayer_sessions', 'room_reading_state']);
  });

  test('指向 rooms 的失效外键已移除', () => {
    assert.ok(!fkTargets(d, 'prayer_sessions').includes('rooms'));
    assert.ok(!fkTargets(d, 'room_reading_state').includes('rooms'));
  });

  test('其余外键连删除动作一起原样保留', () => {
    assert.equal(
      fkSig(d, 'prayer_sessions'),
      'created_by->users.id:CASCADE:NO ACTION|facilitator_user_id->users.id:SET NULL:NO ACTION',
    );
    assert.equal(fkSig(d, 'room_reading_state'), '');
  });

  test('数据逐行完全一致，一条不丢也一处不改', () => {
    assert.deepEqual(snapshot(d), baseline);
  });

  test('子表关系（prayer_session_items / events）不受影响', () => {
    // 重建父表时若外键未关闭，DROP TABLE 会把子行级联删掉。
    assert.equal(countOf(d, 'SELECT COUNT(*) n FROM prayer_session_items'), 1);
    assert.equal(countOf(d, 'SELECT COUNT(*) n FROM prayer_session_events'), 1);
  });

  test('索引全部复原，含部分唯一索引的 WHERE 子句', () => {
    const idx = d.prepare(
      `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='prayer_sessions'
        AND sql IS NOT NULL ORDER BY name`,
    ).all() as { name: string; sql: string }[];
    assert.deepEqual(idx.map(i => i.name), ['idx_sessions_room', 'uniq_active_session_per_room']);
    assert.match(idx[1]!.sql, /WHERE\s+status\s*=\s*'active'/i);
    // 真的还在生效：同房间第二个 active session 必须被拦下。
    assert.throws(() => d.prepare(
      `INSERT INTO prayer_sessions (id,room_id,status,created_by,revision,created_at,updated_at)
        VALUES ('dup','legacy_room','active','u1',1,1,1)`,
    ).run(), /UNIQUE/);
  });

  test('CHECK 约束仍生效', () => {
    assert.throws(() => d.prepare(
      `INSERT INTO prayer_sessions (id,room_id,status,created_by,revision,created_at,updated_at)
        VALUES ('bad','legacy_room','不合法','u1',1,1,1)`,
    ).run(), /CHECK/);
  });

  test('users 外键仍生效（悬空 created_by 被拒）', () => {
    assert.throws(() => d.prepare(
      `INSERT INTO prayer_sessions (id,room_id,status,created_by,revision,created_at,updated_at)
        VALUES ('bad2','legacy_room','scheduled','no-such-user',1,1,1)`,
    ).run(), /FOREIGN KEY/);
  });

  test('room_members 未被触碰（DB-12 §12 保留作回滚参考）', () => {
    assert.ok(fkTargets(d, 'room_members').includes('rooms'));
    assert.equal(countOf(d, 'SELECT COUNT(*) n FROM room_members'), 1);
  });

  test('foreign_key_check 零违规，foreign_keys 已恢复为 ON', () => {
    assert.deepEqual(d.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(d.pragma('foreign_keys', { simple: true }), 1);
  });

  test('不留临时表', () => {
    assert.deepEqual(
      d.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%__db12_compat%'").all(), [],
    );
  });

  test('迁移后可以为「SQLite 没有 rooms 行」的房间写祷告会与阅读位置', () => {
    // 这正是修复前会 FOREIGN KEY constraint failed 的那条路径。
    assert.equal(countOf(d, 'SELECT COUNT(*) n FROM rooms WHERE room_id=?', 'pg_only_room'), 0);
    d.prepare(
      `INSERT INTO prayer_sessions (id,room_id,status,created_by,revision,created_at,updated_at)
        VALUES ('pg-1','pg_only_room','scheduled','u1',1,1,1)`,
    ).run();
    d.prepare(
      `INSERT INTO room_reading_state (room_id,book,chapter,verse,revision,updated_by,updated_at)
        VALUES ('pg_only_room','创世记',1,1,1,'u1',1)`,
    ).run();
    assert.deepEqual(d.prepare('PRAGMA foreign_key_check').all(), []);
    // 清掉本条断言自己造的行，不影响后面的幂等快照比较。
    d.prepare("DELETE FROM prayer_sessions WHERE id='pg-1'").run();
    d.prepare("DELETE FROM room_reading_state WHERE room_id='pg_only_room'").run();
  });

  test('重复执行是 NO-OP，schema 与数据都不再变化', () => {
    const s1 = schemaOf(d);
    assert.deepEqual(dropObsoleteRoomForeignKeys(d), []);
    assert.deepEqual(schemaOf(d), s1);
    assert.deepEqual(snapshot(d), baseline);
  });
});

// ═══════════════════════ B. 新格式库 = NO-OP ═══════════════════════

describe('DB-12 兼容迁移 · 新格式库', () => {
  const FILE = path.join(TMP, `db12-compat-fresh-${process.pid}.sqlite`);

  after(() => rm(FILE));

  test('由 db.ts 新建的库不含目标外键，迁移是 NO-OP 且 schema 零变化', async () => {
    rm(FILE);
    fs.mkdirSync(TMP, { recursive: true });
    // 用子进程加载 db.ts：它在模块加载期就按 DB_PATH 建库，
    // 在本进程里 import 会污染整个测试文件的 db 单例。
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        process.execPath,
        [path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
          path.join(BACKEND_ROOT, 'src', 'test', 'helpers', 'createFreshDb.ts')],
        {
          cwd: BACKEND_ROOT,
          env: { ...process.env, NODE_ENV: 'test', DB_PATH: FILE },
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      let err = '';
      p.stderr?.on('data', c => { err += c.toString(); });
      p.on('exit', code => code === 0 ? resolve() : reject(new Error(`db.ts 建库失败：${err}`)));
    });

    const d = new Database(FILE);
    try {
      d.pragma('foreign_keys = ON');
      assert.ok(!fkTargets(d, 'prayer_sessions').includes('rooms'), '新库不该有 rooms 外键');
      assert.ok(!fkTargets(d, 'room_reading_state').includes('rooms'));
      const s1 = schemaOf(d);
      assert.deepEqual(dropObsoleteRoomForeignKeys(d), [], '新库上迁移必须是 NO-OP');
      assert.deepEqual(schemaOf(d), s1, 'NO-OP 却改了 schema');
      assert.deepEqual(d.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { d.close(); }
  });
});

// ═══════════════════════ C. 行为层：走真实路由 ═══════════════════════

describe('DB-12 兼容迁移 · Postgres 房间 + 遗留祷告/读经路径', () => {
  const DB_PATH = path.join(TMP, `db12-compat-http-${process.pid}.sqlite`);
  const APP_SECRET = 'db12-compat-secret';
  const SYSTEM_ROOMS = ['prayer_room', 'praise_room', 'bible_reading',
    'preaching_room', 'fellowship_room'];
  let sb: FakeSupabase;
  let proc: ChildProcess | null = null;
  let baseUrl = '';
  let host: ProvisionedUser;

  function request(
    method: string, pathname: string, body?: unknown, headers: Record<string, string> = {},
  ): Promise<{ status: number; json: any; text: string }> {
    const url = new URL(pathname, baseUrl);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const r = http.request({
        hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
        headers: {
          ...(payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      }, res => {
        let text = '';
        res.on('data', c => { text += c; });
        res.on('end', () => {
          let json: any = null;
          try { json = JSON.parse(text); } catch { /* 非 JSON */ }
          resolve({ status: res.statusCode ?? 0, json, text });
        });
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }

  /** 只读打开运行中服务器的库 —— 断言绝不写它。 */
  function readonly<T>(fn: (d: Database.Database) => T): T {
    const d = new Database(DB_PATH, { readonly: true });
    try { return fn(d); } finally { d.close(); }
  }

  before(async () => {
    // ★ 关键前置：服务器启动前，DB_PATH 上就是一个**旧格式**库。
    //   users / 子表刻意不预建 —— 由 db.ts 自己建，避免与真实 schema 不一致。
    rm(DB_PATH);
    fs.mkdirSync(TMP, { recursive: true });
    {
      const d = new Database(DB_PATH);
      for (const sql of LEGACY_DDL) {
        if (/CREATE TABLE users|room_members|prayer_session_(items|events)/.test(sql)) continue;
        d.exec(sql);
      }
      d.close();
    }
    assert.ok(
      readonly(d => fkTargets(d, 'prayer_sessions').includes('rooms')),
      '前置条件不成立：fixture 不是旧格式',
    );

    sb = await startFakeSupabase();
    // 内置公共房间只存在于 Postgres 侧 —— SQLite 的 rooms 里没有它们。
    sb.seedTable('app_rooms', SYSTEM_ROOMS.map(id => ({
      id, host_type: 'system', host_user_id: null, host_orphaned_at: null,
      password_hash: null, password_salt: null, created_at: new Date(1000).toISOString(),
    })));

    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    proc = spawn(
      process.execPath,
      [path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/server.ts'],
      {
        cwd: BACKEND_ROOT,
        env: {
          ...process.env,
          PORT: String(port),
          APP_SECRET,
          GEMINI_API_KEY: 'dummy-gemini-key-for-tests',
          LIVEKIT_URL: 'wss://dummy.livekit.cloud',
          LIVEKIT_API_KEY: 'dummy-livekit-api-key',
          LIVEKIT_API_SECRET: 'dummy-livekit-api-secret-must-be-32-chars-long-xxxx',
          AGORA_APP_ID: 'dummy-agora-app-id',
          AGORA_APP_CERTIFICATE: 'dummy-agora-app-certificate',
          CORS_ORIGINS: '*',
          NODE_ENV: 'test',
          DB_PATH,
          SUPABASE_URL: sb.origin,
          SUPABASE_SERVICE_ROLE_KEY: 'db12-compat-service-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stderr = '';
    proc.stderr?.on('data', c => { stderr += c.toString(); });
    const t0 = Date.now();
    for (;;) {
      if (Date.now() - t0 > 20_000) throw new Error(`server 未就绪：\n${stderr}`);
      try { if ((await request('GET', '/api/health')).status === 200) break; } catch { /* 等 */ }
      await new Promise(r => setTimeout(r, 150));
    }

    host = await provisionUser(DB_PATH, sb, {
      email: 'db12-compat-host@example.test', name: '兼容测试房主', role: 'student',
    });
  });

  after(async () => {
    proc?.kill();
    await sb?.stop();
    rm(DB_PATH);
  });

  const bearer = (u: ProvisionedUser) => ({ authorization: `Bearer ${u.accessToken}` });

  test('后端启动即在旧格式库上完成兼容迁移', () => {
    assert.ok(!readonly(d => fkTargets(d, 'prayer_sessions').includes('rooms')),
      'prayer_sessions 仍带着指向 rooms 的失效外键');
    assert.ok(!readonly(d => fkTargets(d, 'room_reading_state').includes('rooms')));
    assert.deepEqual(readonly(d => d.prepare('PRAGMA foreign_key_check').all()), []);
  });

  test('Postgres 建房 → 开祷告会：不再触发 SQLite 外键错误', async () => {
    const roomId = 'db12_compat_pg_room';
    const created = await request('POST', '/api/rooms', { roomId }, bearer(host));
    assert.equal(created.status, 200, created.text);
    // 房间只存在于 Postgres；SQLite 的 rooms 表没有这一行。
    assert.ok(sb.tableRows('app_rooms').some(r => r.id === roomId));
    assert.equal(readonly(d =>
      countOf(d, 'SELECT COUNT(*) n FROM rooms WHERE room_id=?', roomId)), 0);

    const r = await request('POST', `/api/rooms/${roomId}/prayer-sessions`,
      { title: '兼容验证', items: [{ title: '为学院祷告' }, { title: '为同学祷告' }] },
      bearer(host));
    assert.equal(r.status, 201, `开祷告会失败（升级路径未修好）：${r.text}`);
    assert.equal(readonly(d =>
      countOf(d, 'SELECT COUNT(*) n FROM prayer_sessions WHERE room_id=?', roomId)), 1);
  });

  test('Postgres 内置读经室 → 写共享阅读位置：不再触发 SQLite 外键错误', async () => {
    // moderator 只能由服务端授予（客户端无提升接口），这里直接在 Postgres 侧预置。
    sb.seedTable('app_room_members', [{
      room_id: 'bible_reading', user_id: host.supabaseUserId, role: 'moderator',
      joined_at: new Date(1000).toISOString(), updated_at: new Date(1000).toISOString(),
    }]);
    assert.equal(
      readonly(d => countOf(d, 'SELECT COUNT(*) n FROM rooms WHERE room_id=?', 'bible_reading')),
      0, 'bible_reading 不该存在于 SQLite rooms',
    );

    const r = await request('PUT', '/api/rooms/bible_reading/reading-position',
      { book: '创世记', chapter: 1, verse: 1 }, bearer(host));
    assert.equal(r.status, 200, `写阅读位置失败（升级路径未修好）：${r.text}`);
    const row = readonly(d => d.prepare(
      "SELECT book, chapter FROM room_reading_state WHERE room_id='bible_reading'",
    ).get()) as { book: string; chapter: number };
    assert.equal(row.book, '创世记');
    assert.equal(row.chapter, 1);
  });

  test('切换域的 SQLite 写入仍为 0，没有回写影子房间', () => {
    for (const t of ['rooms', 'room_members', 'room_presence',
      'course_files', 'cooperation_submissions']) {
      assert.equal(
        readonly(d => countOf(d, `SELECT COUNT(*) n FROM "${t}"`)), 0,
        `${t} 出现了 SQLite 写入 —— 迁移域不得双写`,
      );
    }
  });
});
