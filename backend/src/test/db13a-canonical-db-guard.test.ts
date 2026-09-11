/**
 * DB-13A · canonical SQLite 写入守卫
 *
 * ── 要防的事 ────────────────────────────────────────────────────────
 * DB-12 收尾期间，一个以默认 DB_PATH 起来的后端进程在无人察觉的情况下
 * 对 canonical 数据文件 `backend/data/amas.sqlite` 做了一次表重建级迁移。
 * 结果正确，但「隐式改写 canonical 文件」不能继续存在。
 *
 * ── 为什么这组测试必须包含一个真进程 ─────────────────────────────────
 * 纯函数断言只能证明判定逻辑对。真正的风险在**模块加载期** ——
 * `db.ts` 在 import 的那一刻就打开并建表。所以这里除了单测 dbPath.ts，
 * 还 spawn 一个真的加载 db.ts 的进程，证明它在缺 DB_PATH 的测试上下文下
 * **拒绝启动**，并且 canonical 文件在整个过程中一个字节都没变。
 *
 * ── 实测得到的关键事实 ──────────────────────────────────────────────
 * `tsx --test` 下 `NODE_ENV` 是 **undefined**，只有 `NODE_TEST_CONTEXT`
 * 被 node 测试运行器注入。所以只判断 `NODE_ENV === 'test'` 的守卫
 * 一个测试都拦不到 —— 这条断言在下面被显式钉住。
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  resolveDbPath, describeDbPath, isTestContext, canonicalDbPath,
  assertCanonicalSchemaChangeAllowed, CANONICAL_SCHEMA_OPT_IN,
} from '../dbPath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(BACKEND_ROOT, '.tmp-test');
const TSX = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
/** 只 import db.ts 然后退出 —— 用来观察模块加载期的行为。 */
const LOAD_DB = path.join(BACKEND_ROOT, 'src', 'test', 'helpers', 'createFreshDb.ts');
const CANONICAL = canonicalDbPath(BACKEND_ROOT);

const FAKE_ROOT = process.platform === 'win32' ? 'C:\\fake-backend' : '/fake-backend';

function rm(p: string): void {
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(p + s, { force: true }); } catch { /* 尽力而为 */ }
  }
}

/** canonical 文件的指纹。不存在时返回 null —— CI 上本就没有这个文件。 */
function canonicalFingerprint(): string | null {
  try {
    const buf = fs.readFileSync(CANONICAL);
    return `${buf.length}:${crypto.createHash('sha256').update(buf).digest('hex')}`;
  } catch { return null; }
}

interface Ran { code: number | null; stdout: string; stderr: string }

/** 起一个真进程加载 db.ts。`env` 完全替换，不继承调用方的 DB_PATH。 */
function loadDbIn(env: NodeJS.ProcessEnv, script = LOAD_DB): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [TSX, script], {
      cwd: BACKEND_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    p.stdout?.on('data', c => { stdout += c.toString(); });
    p.stderr?.on('data', c => { stderr += c.toString(); });
    p.on('error', reject);
    p.on('exit', code => resolve({ code, stdout, stderr }));
  });
}

/**
 * 干净的子进程 env：保留 PATH 等必需项，**剔除** DB_PATH 与授权开关，
 * 但保留 NODE_TEST_CONTEXT —— 真实场景就是「测试里忘了设 DB_PATH」。
 */
function childEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env };
  delete e.DB_PATH;
  delete e[CANONICAL_SCHEMA_OPT_IN];
  return { ...e, ...extra };
}

/** DB-12 之前形状的 prayer_sessions（带失效的 rooms 外键）。 */
function makeLegacyFixture(file: string): void {
  rm(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new Database(file);
  d.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL)`);
  d.exec(`CREATE TABLE rooms (
    room_id TEXT PRIMARY KEY, host_id TEXT NOT NULL,
    password_hash TEXT, salt TEXT, created_at INTEGER NOT NULL)`);
  d.exec(`CREATE TABLE prayer_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('scheduled','active','ended')),
    created_by TEXT NOT NULL,
    facilitator_user_id TEXT,
    started_at INTEGER, ended_at INTEGER, current_item_id TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, title TEXT,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (facilitator_user_id) REFERENCES users(id) ON DELETE SET NULL)`);
  d.exec(`CREATE TABLE room_reading_state (
    room_id TEXT PRIMARY KEY, book TEXT NOT NULL, chapter INTEGER NOT NULL,
    verse INTEGER, revision INTEGER NOT NULL DEFAULT 1,
    updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE)`);
  d.close();
}

const hasRoomFk = (file: string, table: string): boolean => {
  const d = new Database(file, { readonly: true });
  try {
    return (d.prepare(`PRAGMA foreign_key_list("${table}")`).all() as { table: string }[])
      .some(f => f.table.toLowerCase() === 'rooms');
  } finally { d.close(); }
};

// ═════════════════════ A. 判定逻辑（纯函数） ═════════════════════

describe('DB-13A 守卫 · 路径解析判定', () => {
  test('NODE_TEST_CONTEXT 是识别 tsx --test 的唯一可靠信号', () => {
    // 这条钉住本轮的关键实测结论：只看 NODE_ENV 的守卫抓不到任何测试。
    assert.equal(isTestContext({ NODE_TEST_CONTEXT: 'child-v8' }), true);
    assert.equal(isTestContext({ NODE_ENV: 'test' }), true);
    assert.equal(isTestContext({}), false);
    assert.equal(isTestContext({ NODE_ENV: 'development' }), false);
    // 当前进程本身就在 tsx --test 下，且 NODE_ENV 并未被设为 test。
    assert.equal(isTestContext(process.env), true);
  });

  test('测试上下文缺 DB_PATH → 抛错，且错误里点名 canonical 文件', () => {
    for (const env of [{ NODE_TEST_CONTEXT: 'child-v8' }, { NODE_ENV: 'test' }]) {
      assert.throws(
        () => resolveDbPath(env, FAKE_ROOT),
        (e: Error) => /测试上下文/.test(e.message) && e.message.includes('amas.sqlite'),
      );
    }
  });

  test('DB_PATH 为空串 / 纯空格视同未设置', () => {
    assert.throws(() => resolveDbPath({ NODE_TEST_CONTEXT: '1', DB_PATH: '   ' }, FAKE_ROOT));
  });

  test('显式 DB_PATH → 采用之，且不算 canonical 缺省', () => {
    const r = resolveDbPath({ NODE_TEST_CONTEXT: '1', DB_PATH: '/tmp/x.sqlite' }, FAKE_ROOT);
    assert.equal(r.path, '/tmp/x.sqlite');
    assert.equal(r.source, 'env');
    assert.equal(r.isCanonicalDefault, false);
  });

  test(':memory: 是合法的显式路径', () => {
    const r = resolveDbPath({ NODE_TEST_CONTEXT: '1', DB_PATH: ':memory:' }, FAKE_ROOT);
    assert.equal(r.path, ':memory:');
    assert.equal(r.source, 'env');
  });

  /*
   * 这条原本断言「非测试上下文缺 DB_PATH → 落 canonical」。
   * #26 把开发上下文也改成了 fail closed，所以旧断言不再成立 ——
   * 它描述的正是 #26 要封的那个行为。改为断言新语义，
   * 同时保留 production 一路仍落 canonical（RB-06 语义不得被改动）。
   * 开发上下文的完整覆盖在 issue26-dev-db-containment.test.ts。
   */
  test('production 缺 DB_PATH → 仍落 canonical，交给 RB-06 统一拒绝', () => {
    const r = resolveDbPath({ NODE_ENV: 'production' }, FAKE_ROOT);
    assert.equal(r.path, canonicalDbPath(FAKE_ROOT));
    assert.equal(r.source, 'production');
    assert.equal(r.isCanonicalDefault, true);
  });

  test('开发上下文缺 DB_PATH → 拒绝（#26）', () => {
    assert.throws(() => resolveDbPath({}, FAKE_ROOT), /开发环境/);
  });

  test('显式指到 canonical 文件本身也算显式 —— 操作者自己指的', () => {
    const r = resolveDbPath({ DB_PATH: canonicalDbPath(FAKE_ROOT) }, FAKE_ROOT);
    assert.equal(r.source, 'env');
    assert.equal(r.isCanonicalDefault, false);
  });

  test('日志行同时给出路径与来源', () => {
    const envLine = describeDbPath(resolveDbPath({ DB_PATH: '/tmp/x.sqlite' }, FAKE_ROOT));
    assert.match(envLine, /\/tmp\/x\.sqlite/);
    assert.match(envLine, /DB_PATH/);
    const defLine = describeDbPath(resolveDbPath({ NODE_ENV: 'production' }, FAKE_ROOT));
    assert.match(defLine, /amas\.sqlite/);
    assert.match(defLine, /缺省/);
  });
});

describe('DB-13A 守卫 · canonical 改 schema 授权', () => {
  // #26 之后开发上下文缺 DB_PATH 会抛错，因此这里改用 production 上下文
  // 构造同一个 canonical resolution —— 被测的 isCanonicalDefault 完全一致。
  const canonical = resolveDbPath({ NODE_ENV: 'production' }, FAKE_ROOT);
  const explicit = resolveDbPath({ DB_PATH: '/tmp/x.sqlite' }, FAKE_ROOT);

  test('canonical 缺省 + 无授权 → 抛错，并列出会改哪几张表', () => {
    assert.throws(
      () => assertCanonicalSchemaChangeAllowed(canonical, ['prayer_sessions', 'room_reading_state'], {}),
      (e: Error) => e.message.includes('prayer_sessions')
        && e.message.includes('room_reading_state')
        && e.message.includes(CANONICAL_SCHEMA_OPT_IN),
    );
  });

  test('canonical 缺省 + 显式授权 → 放行', () => {
    assert.doesNotThrow(() => assertCanonicalSchemaChangeAllowed(
      canonical, ['prayer_sessions'], { [CANONICAL_SCHEMA_OPT_IN]: '1' },
    ));
  });

  test('授权开关只认精确的 "1"，不接受 true / yes', () => {
    for (const v of ['true', 'yes', 'TRUE', '0', '']) {
      assert.throws(() => assertCanonicalSchemaChangeAllowed(
        canonical, ['prayer_sessions'], { [CANONICAL_SCHEMA_OPT_IN]: v },
      ), Error, `值 ${JSON.stringify(v)} 不该被当成授权`);
    }
  });

  test('显式 DB_PATH → 无条件放行（不需要授权开关）', () => {
    assert.doesNotThrow(
      () => assertCanonicalSchemaChangeAllowed(explicit, ['prayer_sessions'], {}),
    );
  });
});

// ═════════════════════ B. 真进程行为 ═════════════════════

describe('DB-13A 守卫 · 真进程加载 db.ts', () => {
  const FIXTURE = path.join(TMP, `db13a-legacy-${process.pid}.sqlite`);
  let fingerprintBefore: string | null = null;

  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
    fingerprintBefore = canonicalFingerprint();
  });

  after(() => rm(FIXTURE));

  test('测试上下文缺 DB_PATH → 进程拒绝启动（fail closed）', async () => {
    const r = await loadDbIn(childEnv());
    assert.notEqual(r.code, 0, `本该拒绝启动，却成功了：\n${r.stdout}`);
    assert.match(r.stderr, /测试上下文/);
    assert.match(r.stderr, /DB_PATH/);
  });

  test('显式临时 DB_PATH 正常工作，并打印解析出的路径', async () => {
    const tmpDb = path.join(TMP, `db13a-ok-${process.pid}.sqlite`);
    rm(tmpDb);
    const r = await loadDbIn(childEnv({ DB_PATH: tmpDb }));
    assert.equal(r.code, 0, `${r.stderr}`);
    assert.ok(r.stdout.includes(tmpDb), `启动日志没有打印解析后的路径：\n${r.stdout}`);
    assert.ok(fs.existsSync(tmpDb), '显式路径下没有建库');
    // 建的是完整 schema，不是空文件。
    const d = new Database(tmpDb, { readonly: true });
    try {
      const n = (d.prepare(
        `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
      ).get() as { n: number }).n;
      assert.ok(n > 20, `只建了 ${n} 张表，schema 似乎没跑完`);
    } finally { d.close(); }
    rm(tmpDb);
  });

  test('显式路径下 DB-12 兼容迁移照常执行（守卫没有挡住已授权的路径）', async () => {
    makeLegacyFixture(FIXTURE);
    assert.ok(hasRoomFk(FIXTURE, 'prayer_sessions'), '前置条件：fixture 应为旧格式');
    assert.ok(hasRoomFk(FIXTURE, 'room_reading_state'));

    const r = await loadDbIn(childEnv({ DB_PATH: FIXTURE }));
    assert.equal(r.code, 0, `${r.stderr}`);
    assert.ok(!hasRoomFk(FIXTURE, 'prayer_sessions'), '兼容迁移未执行');
    assert.ok(!hasRoomFk(FIXTURE, 'room_reading_state'));
    assert.match(r.stdout, /兼容迁移/);
  });

  test('canonical 数据文件在本套测试全程未被改动', () => {
    const now = canonicalFingerprint();
    if (fingerprintBefore === null) {
      // CI 上 backend/data/ 被 gitignore，文件本就不存在 ——
      // 那么它**也不该被创建出来**，这比比对哈希更强。
      assert.equal(now, null,
        'canonical 数据文件原本不存在，却在测试过程中被创建了 —— 存在静默写入路径');
    } else {
      assert.equal(now, fingerprintBefore,
        'canonical 数据文件在测试过程中被改动了 —— 守卫失效');
    }
  });
});
