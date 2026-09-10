/**
 * MIGRATION PROCESS READINESS · 身份迁移 cutover 端到端证明
 *
 * ── 要回答的问题 ─────────────────────────────────────────────
 * 删除 legacy user authentication 是否安全，取决于一件事：
 * **既有用户能不能通过迁移拿到 Supabase → canonical SQLite 的映射，
 * 然后真的登录进业务层。** 在此之前 legacy_user_map 全空，
 * 迁移工具从未在任何环境跑过——那意味着真实人口一出现就会被全体锁死。
 *
 * 本文件用一次性 fixture 数据库把整条流程真的跑一遍：
 *   dry-run → apply → 再 apply（幂等）→ 迁移后的用户真的能登录。
 *
 * ── 口径 ────────────────────────────────────────────────────
 * 证明的是 **MIGRATION PROCESS: LOCAL VERIFIED**。
 * **不是** PRODUCTION USERS MIGRATED —— 目前不存在权威 production 用户人口，
 * 本文件也**绝不触碰**真实数据库（backend/data/amas.sqlite）。
 *
 * ── 唯一 harness ────────────────────────────────────────────
 * Supabase 侧（JWKS / user_roles / admin users）全部来自
 * helpers/supabaseHarness.ts。没有第二套 fake server / signer / JWKS。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { startFakeSupabase, freePort, type FakeSupabase } from './helpers/supabaseHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TSX = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const STAMP = `${process.pid}-${Date.now()}`;

/** 一次性 fixture 库。绝不指向 backend/data/amas.sqlite。 */
const DB_PATH = path.join(BACKEND_ROOT, '.tmp-test', `migration-${STAMP}.sqlite`);
const ENV_PATH = path.join(BACKEND_ROOT, '.tmp-test', `migration-${STAMP}.env`);
const REPORT_PATH = path.join(BACKEND_ROOT, '.tmp-test', `migration-${STAMP}-report.md`);

// ── fixture 人口 ─────────────────────────────────────────────
const USER_A = { id: 'legacy-user-a', email: 'alice.legacy@example.test', name: 'Alice Legacy' };
const USER_B = { id: 'legacy-user-b', email: 'bob.legacy@example.test', name: 'Bob Legacy' };
/** 必须命中 identity-migration 脚本里显式登记的测试账号表 */
const TEST_ACCT = { id: 'legacy-test-acct', email: 's1780377335744@amas.test', name: 'Excluded Test' };

let sb: FakeSupabase;
let proc: ChildProcess | null = null;
let baseUrl = '';
const APP_SECRET = `migration-audit-${STAMP}`;

function request(
  method: string, pathname: string, body?: unknown, headers: Record<string, string> = {},
): Promise<{ status: number; json: any; text: string }> {
  const url = new URL(pathname, baseUrl);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: url.hostname, port: url.port, path: url.pathname, method,
        headers: {
          ...(payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      res => {
        let text = '';
        res.on('data', c => { text += c; });
        res.on('end', () => {
          let json: any = null;
          try { json = JSON.parse(text); } catch { /* 非 JSON */ }
          resolve({ status: res.statusCode ?? 0, json, text });
        });
      },
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function db<T = any>(sql: string, ...args: unknown[]): T[] {
  const d = new Database(DB_PATH, { readonly: true });
  try { return d.prepare(sql).all(...(args as any[])) as T[]; } finally { d.close(); }
}

/**
 * 跑迁移脚本。apply=false 即 dry-run。
 *
 * ★ 必须用异步 spawn，**不能**用 spawnSync：假 Supabase 就跑在本测试进程里，
 *   spawnSync 会把事件循环整个卡住，子进程发来的 /auth/v1/admin/users 请求
 *   永远得不到应答，迁移脚本最终判成「Supabase 不可达」——一个纯粹由测试
 *   写法造成的假故障（首次实现踩过，dry-run 卡满 5 分钟后失败）。
 */
function runMigrationRaw(extraArgs: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX, 'scripts/identity-migration-apply.mjs', ...extraArgs], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, AMAS_ENV: ENV_PATH, DB_PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout?.on('data', d => { out += d.toString(); });
    child.stderr?.on('data', d => { out += d.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code: code ?? -1, out }));
  });
}

function runMigration(script: 'dryrun' | 'apply', apply = false): Promise<{ code: number; out: string }> {
  const args = [TSX, `scripts/identity-migration-${script}.mjs`];
  if (apply) args.push('--apply');
  if (script === 'dryrun') args.push(`--out=${REPORT_PATH}`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: BACKEND_ROOT,
      env: { ...process.env, AMAS_ENV: ENV_PATH, DB_PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout?.on('data', d => { out += d.toString(); });
    child.stderr?.on('data', d => { out += d.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code: code ?? -1, out }));
  });
}

before(async () => {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`, ENV_PATH, REPORT_PATH]) {
    try { fs.rmSync(f, { force: true }); } catch { /* 尽力而为 */ }
  }

  sb = await startFakeSupabase();
  fs.writeFileSync(ENV_PATH, `URL=${sb.origin}\nSERVICE=migration-audit-service-key\n`, 'utf8');

  // 先起一次 backend：schema 由 db.ts 建（含 legacy_user_map），
  // 迁移脚本按 D-2 的约定只写数据、不建表。
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, [TSX, 'src/server.ts'], {
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
      SUPABASE_SERVICE_ROLE_KEY: 'migration-audit-service-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  proc.stderr?.on('data', d => { stderr += d.toString(); });
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > 20_000) throw new Error(`backend 未就绪：\n${stderr}`);
    try { if ((await request('GET', '/api/health')).status === 200) break; } catch { /* 未起来 */ }
    await new Promise(r => setTimeout(r, 150));
  }

  // 播种 legacy 人口：三个 canonical 用户，0 条映射 —— 正是删除 legacy 之后
  // 真实环境会呈现的样子。
  const d = new Database(DB_PATH);
  try {
    for (const u of [USER_A, USER_B, TEST_ACCT]) {
      d.prepare(
        `INSERT OR REPLACE INTO users
           (id, email, name, password_hash, salt, role, degree, avatar, bio, created_at)
         VALUES (?, ?, ?, 'legacy-hash', 'legacy-salt', 'student', NULL, NULL, NULL, ?)`,
      ).run(u.id, u.email, u.name, Date.now());
    }
  } finally {
    d.close();
  }

  // USER_B 的邮箱在 Supabase 里"已经存在" → 迁移应判为 mapped 而非 needs_provision，
  // 这样一次跑通就同时覆盖了 mapped 与 provisioned 两条路径。
  sb.seedAdminUser(USER_B.email);
});

after(async () => {
  proc?.kill();
  await sb?.stop();
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`, ENV_PATH, REPORT_PATH]) {
    try { fs.rmSync(f, { force: true }); } catch { /* 尽力而为 */ }
  }
});

// ═══════════════ 迁移前：正是"全体锁死"的状态 ═══════════════

test('迁移前 · legacy_user_map 为空，三个 canonical 用户都进不去', async () => {
  assert.equal(db('SELECT * FROM legacy_user_map').length, 0, '前提：映射表为空');
  assert.equal(db('SELECT * FROM users').length, 3, '前提：三个 legacy 用户已就位');

  // 就算 Supabase 侧有账号（USER_B），没有映射一样进不来
  const bId = sb.listAdminUsers().find(u => u.email === USER_B.email)!.id;
  const token = await sb.mintToken(bId);
  const r = await request('GET', '/api/auth/me', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 403, '迁移前必须 403 —— 这正是 cutover blocker 的形态');
  assert.equal(r.json?.code, 'IDENTITY_NOT_PROVISIONED');
});

// ═══════════════ Dry run ═══════════════

test('dry-run · 只读，不建号、不写映射', async () => {
  const before = sb.listAdminUsers().length;
  const r = await runMigration('dryrun');
  // ★ dry-run 用退出码表达「还有待办」：blockers 非空即 exit 1。
  //   这里确有一个待办（A 在 Supabase 尚无账号），所以 exit 1 是**正确**语义，
  //   不是失败。断言落在行为上，不在退出码上。
  assert.match(r.out, /BLOCKED/, 'dry-run 应如实报出待办：' + r.out);
  assert.match(r.out, /尚无对应账号/, 'dry-run 必须指出 A 需要建号');

  assert.equal(db('SELECT * FROM legacy_user_map').length, 0, 'dry-run 不得写映射表');
  assert.equal(sb.listAdminUsers().length, before, 'dry-run 不得在 Supabase 建号');
  assert.ok(fs.existsSync(REPORT_PATH), 'dry-run 应产出审计报告');
});

// ═══════════════ Apply ═══════════════

test('apply · 三个账号各归其位（provisioned / mapped / skipped_test_account）', async () => {
  const r = await runMigration('apply', true);
  // #18 已于 STAGING 阶段关闭：apply 的退出码现在只反映 migration correctness，
  //   数据集专属期望（原先写死的 rows === 12）已下放到 dataset acceptance 层，
  //   默认不计入退出码。因此这里可以、也应该断言退出码为 0。
  assert.equal(r.code, 0, '#18 关闭后，迁移正确即退出码 0：' + r.out);
  assert.match(r.out, /已建号 alice\.legacy@example\.test/, 'A 应被建号：' + r.out);
  assert.match(r.out, /bob\.legacy@example\.test → mapped/, 'B 应直接映射：' + r.out);
  assert.match(r.out, /s1780377335744@amas\.test → skipped_test_account/, '测试账号应被排除');
  assert.match(r.out, /legacy_user_map 写入 3 行/, '三条映射应写入');

  const rows = db<{ legacy_user_id: string; supabase_user_id: string | null; mapping_status: string }>(
    'SELECT legacy_user_id, supabase_user_id, mapping_status FROM legacy_user_map',
  );
  assert.equal(rows.length, 3, `三个用户各一行映射，实际 ${rows.length}`);

  const byId = new Map(rows.map(x => [x.legacy_user_id, x]));

  // A 在 Supabase 原本不存在 → 迁移建号
  assert.equal(byId.get(USER_A.id)!.mapping_status, 'provisioned');
  assert.ok(byId.get(USER_A.id)!.supabase_user_id, 'A 必须拿到 Supabase UUID');

  // B 的邮箱原本已存在 → 1:1 直接映射，不重复建号
  assert.equal(byId.get(USER_B.id)!.mapping_status, 'mapped');
  const bSupabase = sb.listAdminUsers().find(u => u.email === USER_B.email)!.id;
  assert.equal(byId.get(USER_B.id)!.supabase_user_id, bSupabase, 'B 必须映射到既有账号');

  // 已登记的测试账号 → 不建号、不给真实身份
  assert.equal(byId.get(TEST_ACCT.id)!.mapping_status, 'skipped_test_account');
  assert.equal(byId.get(TEST_ACCT.id)!.supabase_user_id, null, '测试账号不得映射到任何真实身份');
});

test('apply · canonical users 行未被改写（业务 id 保持不变）', () => {
  const users = db<{ id: string; email: string }>('SELECT id, email FROM users ORDER BY id');
  assert.equal(users.length, 3, '迁移不得增删 canonical 用户');
  const ids = users.map(u => u.id).sort();
  assert.deepEqual(ids, [USER_A.id, USER_B.id, TEST_ACCT.id].sort(), '业务 user id 必须原样保留');
});

// ═══════════════ 迁移后：真的能登录 ═══════════════

test('迁移后 · A（provisioned）能登录并拿到自己的 canonical 资料', async () => {
  const row = db<{ supabase_user_id: string }>(
    'SELECT supabase_user_id FROM legacy_user_map WHERE legacy_user_id = ?', USER_A.id)[0];
  const token = await sb.mintToken(row.supabase_user_id);

  const r = await request('GET', '/api/auth/me', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 200, `迁移后必须能登录，实际 ${r.status} ${r.text}`);
  assert.equal(r.json.user.id, USER_A.id, '必须解析回原来的 canonical 业务身份');
  assert.equal(r.json.user.email, USER_A.email);
  assert.equal(r.json.user.name, USER_A.name);
});

test('迁移后 · B（mapped）同样能登录', async () => {
  const row = db<{ supabase_user_id: string }>(
    'SELECT supabase_user_id FROM legacy_user_map WHERE legacy_user_id = ?', USER_B.id)[0];
  const token = await sb.mintToken(row.supabase_user_id);

  const r = await request('GET', '/api/auth/me', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 200, `实际 ${r.status} ${r.text}`);
  assert.equal(r.json.user.id, USER_B.id);
});

test('迁移后 · A 能真正读写业务层（不只是 /me）', async () => {
  const row = db<{ supabase_user_id: string }>(
    'SELECT supabase_user_id FROM legacy_user_map WHERE legacy_user_id = ?', USER_A.id)[0];
  const token = await sb.mintToken(row.supabase_user_id);
  const h = { authorization: `Bearer ${token}` };

  const put = await request('PUT', '/api/growth/state', { state: { marker: 'after-migration' } }, h);
  assert.equal(put.status, 200, `迁移后应能写业务数据，实际 ${put.status} ${put.text}`);

  const get = await request('GET', '/api/growth/state', undefined, h);
  assert.equal(get.status, 200);
  assert.equal(get.json.state.marker, 'after-migration');

  // ★ 这条断言在 DB-13B 里按 D-42 更新了，不是回归。
  //   growth 已切到 Postgres `app_christian_profile`，身份列外键到 profiles.id，
  //   因此主体是 **Supabase UUID**；canonical SQLite id 写不进那一列。
  const written = sb.tableRows('app_christian_profile');
  assert.deepEqual(
    written.map(r => r.user_id), [row.supabase_user_id],
    '已切域的业务数据必须归属 Supabase UUID（D-42）',
  );
  // 更强的一条：SQLite 侧必须保持为空 —— 只有它能区分「切换成功」与「双写」。
  const legacyRows = db<{ user_id: string }>('SELECT user_id FROM growth_state');
  assert.deepEqual(legacyRows, [], 'growth 已切换，SQLite growth_state 不得再有写入');
});

test('迁移后 · 被排除的测试账号无法进入业务层', async () => {
  // 给它铸一张 token（哪怕 Supabase 侧真有这个身份），映射状态就该挡住它
  const ghostForTestAcct = crypto.randomUUID();
  const token = await sb.mintToken(ghostForTestAcct);
  const r = await request('GET', '/api/auth/me', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 403);
  assert.equal(r.json?.code, 'IDENTITY_NOT_PROVISIONED');

  // 并且它在映射表里的状态确实是被排除的
  const row = db<{ mapping_status: string }>(
    'SELECT mapping_status FROM legacy_user_map WHERE legacy_user_id = ?', TEST_ACCT.id)[0];
  assert.equal(row.mapping_status, 'skipped_test_account');
});

test('迁移后 · 失败态（provision_failed）仍然 403', async () => {
  // 直接把 A 的映射改成 provision_failed，模拟建号失败的账号
  const d = new Database(DB_PATH);
  let original: string;
  try {
    original = (d.prepare('SELECT mapping_status s FROM legacy_user_map WHERE legacy_user_id = ?')
      .get(USER_A.id) as { s: string }).s;
    d.prepare("UPDATE legacy_user_map SET mapping_status = 'provision_failed' WHERE legacy_user_id = ?")
      .run(USER_A.id);
  } finally {
    d.close();
  }

  const row = db<{ supabase_user_id: string }>(
    'SELECT supabase_user_id FROM legacy_user_map WHERE legacy_user_id = ?', USER_A.id)[0];
  const token = await sb.mintToken(row.supabase_user_id);
  const r = await request('GET', '/api/auth/me', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 403, 'provision_failed 必须 fail closed');
  assert.equal(r.json?.code, 'IDENTITY_NOT_PROVISIONED');

  // 还原，供后续幂等用例
  const d2 = new Database(DB_PATH);
  try {
    d2.prepare('UPDATE legacy_user_map SET mapping_status = ? WHERE legacy_user_id = ?')
      .run(original!, USER_A.id);
  } finally {
    d2.close();
  }
});

// ═══════════════ 幂等 ═══════════════

test('幂等 · 再跑一次 apply 不重复建号、不新增映射、不动业务身份', async () => {
  const usersBefore = db<{ id: string; email: string; name: string }>(
    'SELECT id, email, name FROM users ORDER BY id');
  const mapBefore = db<{ legacy_user_id: string; supabase_user_id: string | null; mapping_status: string }>(
    'SELECT legacy_user_id, supabase_user_id, mapping_status FROM legacy_user_map ORDER BY legacy_user_id');
  const sbBefore = sb.listAdminUsers().length;
  const growthBefore = db('SELECT * FROM growth_state');

  const r = await runMigration('apply', true);
  // 第二次运行时 A 已经在 Supabase 有账号，应判为 mapped 而不是重新建号。
  assert.equal(r.code, 0, '#18 关闭后重跑同样应退出码 0：' + r.out);
  assert.match(r.out, /alice\.legacy@example\.test → mapped/,
    '第二次 apply 必须复用既有账号：' + r.out);
  assert.doesNotMatch(r.out, /已建号 alice\.legacy/, '不得第二次建号');

  assert.deepEqual(
    db('SELECT id, email, name FROM users ORDER BY id'), usersBefore,
    'canonical users 不得被重复创建或改写',
  );
  const mapAfter = db<{ legacy_user_id: string; supabase_user_id: string | null; mapping_status: string }>(
    'SELECT legacy_user_id, supabase_user_id, mapping_status FROM legacy_user_map ORDER BY legacy_user_id');

  assert.equal(mapAfter.length, mapBefore.length, '不得产生第二条映射');
  assert.deepEqual(
    mapAfter.map(x => [x.legacy_user_id, x.supabase_user_id]),
    mapBefore.map(x => [x.legacy_user_id, x.supabase_user_id]),
    '★ 身份对应关系必须逐条不变（legacy id ↔ Supabase UUID）',
  );

  // mapping_status 允许 provisioned → mapped：第二次运行时账号已经存在于
  // Supabase，脚本据实判为 mapped。这是**正确**的幂等语义，不是漂移 ——
  // 关键是 supabase_user_id 一个字符没变（上面已逐条断言）。
  const ALLOWED = new Set(['mapped', 'provisioned', 'skipped_test_account']);
  for (const row of mapAfter) {
    assert.ok(ALLOWED.has(row.mapping_status),
      `重跑后出现意外状态：${row.legacy_user_id} → ${row.mapping_status}`);
  }
  const aAfter = mapAfter.find(x => x.legacy_user_id === USER_A.id)!;
  assert.equal(aAfter.mapping_status, 'mapped',
    '第二次运行应把 A 记为 mapped（账号已存在），而不是再次 provisioned');
  assert.equal(sb.listAdminUsers().length, sbBefore, 'Supabase 侧不得重复建号');
  assert.deepEqual(db('SELECT * FROM growth_state'), growthBefore, '业务外键/数据不得被重写');

  const testRow = mapBefore.find(x => x.legacy_user_id === TEST_ACCT.id)!;
  assert.equal(testRow.mapping_status, 'skipped_test_account', '测试账号不得被转正');
  assert.equal(testRow.supabase_user_id, null);
});

test('幂等 · 第二次 apply 之后 A 仍然能正常登录', async () => {
  const row = db<{ supabase_user_id: string }>(
    'SELECT supabase_user_id FROM legacy_user_map WHERE legacy_user_id = ?', USER_A.id)[0];
  const token = await sb.mintToken(row.supabase_user_id);
  const r = await request('GET', '/api/auth/me', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.id, USER_A.id);
});

// ═══════════════ #18 · 通用退出码只反映 migration correctness ═══════════════

test('#18 · 数据集专属断言默认不污染退出码，--dataset-gate 才计入', async () => {
  // 给一个**故意错误**的数据集基线。默认模式下它只该被报告，不该改变退出码；
  // 显式 --dataset-gate 时才允许它让命令失败。
  const wrong = await runMigrationRaw(['--apply', '--expect-prayer-shares=99999']);
  assert.equal(wrong.code, 0, '默认模式下数据集断言失败不得影响退出码：' + wrong.out);
  assert.match(wrong.out, /\[dataset\]/, '应当仍然如实报告 dataset 检查');
  assert.match(wrong.out, /不计入退出码/, '应当说明它未计入退出码');

  const gated = await runMigrationRaw(['--apply', '--expect-prayer-shares=99999', '--dataset-gate']);
  assert.equal(gated.code, 1, '显式 --dataset-gate 时数据集断言必须能让命令失败');

  // 正确基线（fixture 库里 prayer_shares 为 0 行）即使 gate 打开也应通过
  const ok = await runMigrationRaw(['--apply', '--expect-prayer-shares=0', '--dataset-gate']);
  assert.equal(ok.code, 0, '基线正确时 gate 模式也应通过：' + ok.out);
});
