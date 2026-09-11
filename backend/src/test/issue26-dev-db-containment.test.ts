/**
 * OPEN_ISSUES #26 · 开发环境 canonical SQLite 写入围堵
 *
 * ── 在此之前还剩什么 ────────────────────────────────────────────────
 * DB-13A 封掉了两条向量：测试上下文缺 DB_PATH 拒绝启动、在 canonical 缺省库
 * 上隐式改 schema 需要显式 opt-in。#26 因此只剩最后一条残留，原文写得很清楚：
 *
 *   「dev 仍可以对 canonical 库做**行级**写入」
 *
 * 也就是 `npm run dev`（= `tsx watch src/server.ts`，不带 DB_PATH）起来的后端，
 * 会打开 canonical 数据文件 `backend/data/amas.sqlite` 并往里写真实业务行。
 * DB-12 收尾期间正是这条路径在无人察觉时碰了 canonical 资产。
 *
 * ── 这一轮怎么围堵 ──────────────────────────────────────────────────
 *   1. `dbPath.ts`：开发上下文缺 DB_PATH → **抛错**（与测试上下文同样 fail closed），
 *      错误信息给出三条可操作出路，不是一句「拒绝」了事。
 *   2. `scripts/dev.mjs`：`npm run dev` 显式指向一次性库 `<backend>/.tmp-dev/dev.sqlite`，
 *      开发流程照常可用 —— 围堵不能靠让开发流程不可用来达成。
 *   3. 兼容逃生口 `AMAS_ALLOW_CANONICAL_DB=1`：确有旧流程依赖旧行为时原样恢复，
 *      但会在启动日志里标出来，且**不放宽** schema 守卫。
 *
 * ── 刻意不动的两处 ──────────────────────────────────────────────────
 *   · production 语义：仍然落 canonical、仍然由 startupGuard（RB-06）统一
 *     列出缺哪几项后 exit(1)。在 dbPath 里提前抛会把那份清单换成一条模块
 *     加载异常，是退步不是加固。
 *   · users 身份逻辑 / DB-4 / 0027：一个字节都没碰。本轮只改「开哪个文件」。
 *
 * ── 关于 canonical 文件本身 ─────────────────────────────────────────
 * 本文件**不复制、不迁移、不改写**真实 canonical 库，也绝不把它创建出来。
 * 所有真进程用例只用 `.tmp-test/` 下的临时夹具。
 * 「显式 opt-in 会落到 canonical」这条只用纯函数断言 —— 真跑一个进程去验它，
 * 就会在仓库里凭空造出一个 backend/data/amas.sqlite，那正是本条要防的事。
 * 整个文件跑完会复核 canonical 指纹（CI 上该文件不存在 → 断言它也没被创建）。
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  resolveDbPath, describeDbPath, canonicalDbPath, isProductionContext,
  assertCanonicalSchemaChangeAllowed,
  CANONICAL_SCHEMA_OPT_IN, CANONICAL_DEFAULT_OPT_IN,
} from '../dbPath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(BACKEND_ROOT, '.tmp-test');
const TSX = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const LOAD_DB = path.join(BACKEND_ROOT, 'src', 'test', 'helpers', 'createFreshDb.ts');
const DEV_WRAPPER = path.join(BACKEND_ROOT, 'scripts', 'dev.mjs');
const CANONICAL = canonicalDbPath(BACKEND_ROOT);

/** 包装器「不覆盖已设值」那条用的路径 —— 只是个字符串，不会被创建。 */
const FIXTURE_FOR_WRAPPER = path.join(TMP, 'issue26-explicit.sqlite');

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

function run(args: string[], env: NodeJS.ProcessEnv): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, {
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
 * 「像开发机那样」的子进程 env。
 *
 * 关键在于**删掉 NODE_TEST_CONTEXT** —— 留着它就落进 DB-13A 那条旧分支，
 * 测的就不是 #26 新加的开发分支了。同样删掉 NODE_ENV 与两个 opt-in，
 * 让子进程处在货真价实的「开发上下文且什么都没设」状态。
 */
function devEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env };
  delete e.NODE_TEST_CONTEXT;
  delete e.NODE_ENV;
  delete e.DB_PATH;
  delete e[CANONICAL_SCHEMA_OPT_IN];
  delete e[CANONICAL_DEFAULT_OPT_IN];
  return { ...e, ...extra };
}

// ═════════════════ A. 判定逻辑（纯函数，不碰任何文件） ═════════════════

describe('#26 · 开发上下文缺 DB_PATH 必须 fail closed', () => {
  test('★ 开发上下文缺 DB_PATH → 抛错（修复前：静默用 canonical）', () => {
    assert.throws(() => resolveDbPath({}, FAKE_ROOT), Error);
    // NODE_ENV=development 也是同一条路径
    assert.throws(() => resolveDbPath({ NODE_ENV: 'development' }, FAKE_ROOT), Error);
  });

  test('错误信息必须可操作：点名文件 + 三条出路', () => {
    let msg = '';
    try { resolveDbPath({}, FAKE_ROOT); } catch (e) { msg = (e as Error).message; }
    assert.match(msg, /开发环境/);
    assert.ok(msg.includes(canonicalDbPath(FAKE_ROOT)), '要点名会落到哪个文件');
    assert.match(msg, /npm run dev/, '要给出常规开发怎么走');
    assert.match(msg, /DB_PATH=/, '要给出自己指定库怎么写');
    assert.ok(msg.includes(CANONICAL_DEFAULT_OPT_IN), '要给出兼容逃生口');
    assert.ok(msg.includes(CANONICAL_SCHEMA_OPT_IN), '要说明逃生口不放宽 schema 守卫');
  });

  test('显式 DB_PATH 在开发上下文下照常工作（围堵不得妨碍开发）', () => {
    const r = resolveDbPath({ DB_PATH: '/tmp/dev.sqlite' }, FAKE_ROOT);
    assert.equal(r.path, '/tmp/dev.sqlite');
    assert.equal(r.source, 'env');
    assert.equal(r.isCanonicalDefault, false);
  });

  test('DB-13A 的测试上下文守卫未被削弱', () => {
    assert.throws(() => resolveDbPath({ NODE_TEST_CONTEXT: 'child-v8' }, FAKE_ROOT),
      /测试上下文/);
    assert.throws(() => resolveDbPath({ NODE_ENV: 'test' }, FAKE_ROOT), /测试上下文/);
  });
});

describe('#26 · production 语义刻意保持不变（RB-06 仍是唯一把关者）', () => {
  test('production 缺 DB_PATH → 不抛，仍落 canonical', () => {
    const r = resolveDbPath({ NODE_ENV: 'production' }, FAKE_ROOT);
    assert.equal(r.path, canonicalDbPath(FAKE_ROOT));
    assert.equal(r.source, 'production');
    assert.equal(r.isCanonicalDefault, true);
  });

  test('在这里提前抛会顶掉 startupGuard 的完整缺配置清单 —— 所以不抛', () => {
    // 这条不是重复上一条：它钉住的是**为什么**不抛。
    // startupGuard 会把 JWT_SECRET / DB_PATH / CORS_ORIGINS 一次列全再 exit(1)；
    // 若 db.ts 在模块加载期就炸，操作者只会看到一条 DB_PATH 异常。
    assert.equal(isProductionContext({ NODE_ENV: 'production' }), true);
    assert.equal(isProductionContext({ NODE_ENV: 'development' }), false);
    assert.doesNotThrow(() => resolveDbPath({ NODE_ENV: 'production' }, FAKE_ROOT));
  });
});

describe('#26 · 兼容逃生口 AMAS_ALLOW_CANONICAL_DB', () => {
  test('显式 =1 → 恢复旧行为，落 canonical 并标记来源', () => {
    const r = resolveDbPath({ [CANONICAL_DEFAULT_OPT_IN]: '1' }, FAKE_ROOT);
    assert.equal(r.path, canonicalDbPath(FAKE_ROOT));
    assert.equal(r.source, 'canonical-opt-in');
    assert.equal(r.isCanonicalDefault, true);
  });

  test('启动日志把「正在用 canonical」写明白，不让它悄悄发生', () => {
    const line = describeDbPath(resolveDbPath({ [CANONICAL_DEFAULT_OPT_IN]: '1' }, FAKE_ROOT));
    assert.match(line, /amas\.sqlite/);
    assert.ok(line.includes(CANONICAL_DEFAULT_OPT_IN));
    assert.match(line, /canonical/);
  });

  test('只认精确的 "1"，不接受 true / yes / 0', () => {
    for (const v of ['true', 'yes', 'TRUE', '0', '', ' ']) {
      assert.throws(() => resolveDbPath({ [CANONICAL_DEFAULT_OPT_IN]: v }, FAKE_ROOT), Error,
        `值 ${JSON.stringify(v)} 不该被当成授权`);
    }
  });

  test('★ 逃生口不放宽 schema 守卫 —— 两把锁各管各的', () => {
    const r = resolveDbPath({ [CANONICAL_DEFAULT_OPT_IN]: '1' }, FAKE_ROOT);
    // 拿到了 canonical 库，但改 schema 仍然要另一把钥匙
    assert.throws(
      () => assertCanonicalSchemaChangeAllowed(r, ['prayer_sessions'],
        { [CANONICAL_DEFAULT_OPT_IN]: '1' }),
      (e: Error) => e.message.includes(CANONICAL_SCHEMA_OPT_IN),
    );
    assert.doesNotThrow(() => assertCanonicalSchemaChangeAllowed(r, ['prayer_sessions'],
      { [CANONICAL_DEFAULT_OPT_IN]: '1', [CANONICAL_SCHEMA_OPT_IN]: '1' }));
  });

  test('显式 DB_PATH 优先于逃生口（指名道姓的那个说了算）', () => {
    const r = resolveDbPath(
      { [CANONICAL_DEFAULT_OPT_IN]: '1', DB_PATH: '/tmp/explicit.sqlite' }, FAKE_ROOT);
    assert.equal(r.path, '/tmp/explicit.sqlite');
    assert.equal(r.source, 'env');
  });
});

// ═════════════════ B. 真进程行为（只用临时夹具） ═════════════════

describe('#26 · 真进程加载 db.ts', () => {
  const FIXTURE = path.join(TMP, `issue26-dev-${process.pid}.sqlite`);
  let fingerprintBefore: string | null = null;

  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
    fingerprintBefore = canonicalFingerprint();
  });
  after(() => rm(FIXTURE));

  test('★ 开发上下文缺 DB_PATH → 进程拒绝启动，且没有创建 canonical 文件', async () => {
    const existedBefore = fs.existsSync(CANONICAL);
    const r = await run([TSX, LOAD_DB], devEnv());
    assert.notEqual(r.code, 0, `本该拒绝启动，却成功了：\n${r.stdout}`);
    assert.match(r.stderr, /开发环境/);
    assert.match(r.stderr, /npm run dev/);
    // 最要紧的一条：它没有顺手把 canonical 文件造出来
    assert.equal(fs.existsSync(CANONICAL), existedBefore,
      'canonical 文件的存在性在这次拒绝启动前后不得改变');
  });

  test('开发上下文 + 显式 DB_PATH → 正常启动，只写那个临时夹具', async () => {
    rm(FIXTURE);
    const r = await run([TSX, LOAD_DB], devEnv({ DB_PATH: FIXTURE }));
    assert.equal(r.code, 0, `本该正常启动：\n${r.stderr}`);
    assert.ok(fs.existsSync(FIXTURE), '临时夹具应当被创建出来');
    assert.match(r.stdout + r.stderr, /issue26-dev/, '启动日志应当指出用的是夹具');
  });

  test('canonical 文件在本组用例全程未被改动', () => {
    assert.equal(canonicalFingerprint(), fingerprintBefore,
      'canonical 数据文件的指纹发生了变化 —— 本文件不允许碰它');
  });
});

describe('#26 · npm run dev 的包装器', () => {
  test('★ 未设 DB_PATH 时 dev 库落在 .tmp-dev，而不是 canonical', async () => {
    const r = await run([DEV_WRAPPER, '--print-db-path'], devEnv());
    assert.equal(r.code, 0, r.stderr);
    const resolved = r.stdout.trim();
    assert.ok(resolved.length > 0, '应当打印出解析到的路径');
    assert.notEqual(path.resolve(resolved), path.resolve(CANONICAL),
      'dev 默认库绝不能是 canonical 文件');
    assert.ok(resolved.includes('.tmp-dev'), `应落在一次性目录里，实际 ${resolved}`);
    assert.ok(resolved.endsWith('.sqlite'));
  });

  test('已显式设置 DB_PATH 时不覆盖（CI / 特殊调试仍然可控）', async () => {
    const r = await run([DEV_WRAPPER, '--print-db-path'], devEnv({ DB_PATH: FIXTURE_FOR_WRAPPER }));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), FIXTURE_FOR_WRAPPER);
  });

  test('包装器给出的路径确实能让 db.ts 正常启动（闭环）', async () => {
    const probe = path.join(TMP, `issue26-wrapper-${process.pid}.sqlite`);
    rm(probe);
    try {
      const r = await run([TSX, LOAD_DB], devEnv({ DB_PATH: probe }));
      assert.equal(r.code, 0, `包装器给的这类路径应当可用：\n${r.stderr}`);
      assert.ok(fs.existsSync(probe));
    } finally { rm(probe); }
  });
});
