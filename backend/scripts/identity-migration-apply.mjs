#!/usr/bin/env node
/**
 * AUTH-M5/M6 · 身份迁移执行脚本
 *
 * 依据甲方拍板：
 *   D-AUTH-1 —— 2 条 orphan prayer_shares：**保留内容**，作者进入
 *     deleted-account tombstone（author_id = NULL + author_state = 'deleted_account'）。
 *     不删内容、不挂 system/管理员/任何其他用户、不建 fake system user。
 *   D-AUTH-2 —— 真实 legacy 账号必须建立对应 Supabase 用户与显式 1:1 mapping。
 *     **不搬旧密码 hash、不设固定密码**；凭据由用户本人经正式恢复流程建立。
 *
 * 默认 dry-run（只报告不写入）。加 --apply 才真正执行。
 * 每次 --apply 前自动生成数据库快照，作为 rollback 依据。
 *
 * 用法：
 *   AMAS_ENV=<path>/staging.env DB_PATH=<sqlite> node backend/scripts/identity-migration-apply.mjs
 *   AMAS_ENV=... DB_PATH=... node backend/scripts/identity-migration-apply.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const DB_PATH = process.env.DB_PATH || path.join(BACKEND_ROOT, 'data/amas.sqlite');
const BATCH = process.env.MIGRATION_BATCH || `auth-m5-${new Date().toISOString().slice(0, 10)}`;

const envPath = process.env.AMAS_ENV;
const ENV = envPath && fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, 'utf8').trim().split(/\r?\n/)
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};
if (!ENV.URL || !ENV.SERVICE) {
  console.error('需要 AMAS_ENV 指向含 URL / SERVICE 的 staging.env');
  process.exit(1);
}

// 与 dry-run 脚本保持同一份显式登记表（AUTH-M6 §7：不靠猜测识别测试账号）
const KNOWN_TEST_ACCOUNTS = new Set([
  's1780377335744@amas.test',
  's1780377880150@amas.test',
  's1780377952749@amas.test',
  'sec2_a_17884084639119eka@amas.local',
  'sec2_b_1788408463981p4mn@amas.local',
  'sec2_c_1788408464022tn2z@amas.local',
  // 祷告室 Phase 4 语音测试 fixture（2026-09-03T06:06:44 同一毫秒批量创建，
  // 命名为「语音房主/版主/成员/外人」四个固定角色，除 4 条可丢弃的 refresh_jti
  // 外零关联数据）。依据是上述可核实的事实，**不是**邮箱前缀模式匹配。
  'p4_17884156045797ehq@amas.local',
  'p4_17884156046633kfc@amas.local',
  'p4_1788415604708tgcj@amas.local',
  'p4_1788415604752nk32@amas.local',
]);

const norm = (e) => (e ?? '').trim().toLowerCase();
const log = (...a) => console.log(...a);
const step = (n, t) => log(`\n── ${n}. ${t} ──`);

const sb = (p, init = {}) => fetch(`${ENV.URL}${p}`, {
  ...init,
  headers: {
    apikey: ENV.SERVICE, Authorization: `Bearer ${ENV.SERVICE}`,
    'Content-Type': 'application/json', ...(init.headers ?? {}),
  },
});

// ---------------------------------------------------------------------------
// 快照（rollback 依据）
// ---------------------------------------------------------------------------
let snapshot = null;
if (APPLY) {
  snapshot = `${DB_PATH}.pre-${BATCH}.bak`;
  fs.copyFileSync(DB_PATH, snapshot);
  log(`数据库快照: ${snapshot}`);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// 1. 为真实 legacy 用户 provision Supabase identity
// ---------------------------------------------------------------------------
step(1, '为真实 legacy 用户 provision Supabase identity');

const legacyUsers = db.prepare('SELECT id, email, name, role FROM users ORDER BY created_at').all();
const sbList = await (await sb('/auth/v1/admin/users?per_page=1000')).json();
const sbByEmail = new Map((sbList.users ?? []).map(u => [norm(u.email), u]));

const plan = [];
for (const u of legacyUsers) {
  const e = norm(u.email);
  const isTest = KNOWN_TEST_ACCOUNTS.has(e);
  const existing = sbByEmail.get(e);
  plan.push({
    legacy_user_id: u.id, normalized_email: e, name: u.name, legacyRole: u.role, isTest,
    supabase_user_id: existing?.id ?? null,
    mapping_status: isTest ? 'skipped_test_account' : existing ? 'mapped' : 'needs_provision',
    mapping_reason: isTest
      ? '已登记的测试账号：只留映射记录，不在 Supabase 建号'
      : existing ? '该邮箱在 Supabase 已有账号，直接 1:1 映射'
      : '真实账号，需在 Supabase 建号（不设密码，凭据由本人经恢复流程建立）',
  });
}

for (const p of plan) {
  if (p.mapping_status !== 'needs_provision') { log(`  · ${p.normalized_email} → ${p.mapping_status}`); continue; }
  if (!APPLY) { log(`  [dry-run] 将建号: ${p.normalized_email}（不设密码）`); continue; }

  // ★ 不搬旧 hash、不设固定密码：建号时不带 password，用户必须走恢复流程
  const r = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: p.normalized_email,
      email_confirm: true,
      user_metadata: { display_name: p.name, migrated_from_legacy: true, migration_batch: BATCH },
    }),
  });
  const body = await r.json();
  if (!r.ok || !body.id) {
    log(`  ✗ 建号失败 ${p.normalized_email}: ${JSON.stringify(body).slice(0, 160)}`);
    p.mapping_status = 'provision_failed';
    p.mapping_reason = JSON.stringify(body).slice(0, 200);
    continue;
  }
  p.supabase_user_id = body.id;
  p.mapping_status = 'provisioned';
  p.mapping_reason = '本次迁移在 Supabase 新建，未设密码；凭据须由用户本人经恢复流程建立';
  log(`  ✓ 已建号 ${p.normalized_email} → ${body.id}`);

  // ★ 迁移不得自动带来任何管理权限：显式不授予任何角色。
  //   legacy role='admin' 也不自动转成管理角色，须另行按 Portal 角色体系授予。
  if (p.legacyRole === 'admin') {
    log(`    注意：该 legacy 账号原为 admin，**未**自动授予任何 Supabase 管理角色（需另行审批授予）`);
  }
}

// ---------------------------------------------------------------------------
// 2. 显式 legacy → Supabase mapping artifact
// ---------------------------------------------------------------------------
step(2, '建立显式 legacy → Supabase mapping');

if (APPLY) {
  // AUTH-M7 · schema 所有权：legacy_user_map 的 DDL 归 backend/src/db.ts。
  // 本脚本只写数据，不建表 —— 此前脚本自带一份 DDL，等于第二份会漂移的
  // schema，且导致「没跑过迁移的库根本没有这张表」，运行时 500。
  // 这里只做防御性断言：表不在就直接停，不要偷偷补建。
  const hasMap = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_user_map' LIMIT 1`,
  ).get();
  if (!hasMap) {
    console.error(
      '  ✗ legacy_user_map 不存在。该表由 backend/src/db.ts 创建 —— ' +
      '请先用当前 backend 启动一次该数据库（或指向已初始化的 DB_PATH），再重跑本脚本。',
    );
    process.exit(1);
  }
  const idx = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name='uq_legacy_map_supabase' LIMIT 1`,
  ).get();
  if (!idx) {
    console.error(
      '  ✗ 唯一索引 uq_legacy_map_supabase 缺失 —— 没有它就挡不住' +
      '「两个 Supabase 身份映射到同一 canonical 用户」。schema 版本不匹配，中止。',
    );
    process.exit(1);
  }

  const ins = db.prepare(`
    INSERT INTO legacy_user_map
      (legacy_user_id, supabase_user_id, normalized_email, mapping_status, mapping_reason, migration_batch, created_at)
    VALUES (@legacy_user_id, @supabase_user_id, @normalized_email, @mapping_status, @mapping_reason, @batch, @now)
    ON CONFLICT(legacy_user_id) DO UPDATE SET
      supabase_user_id = excluded.supabase_user_id,
      mapping_status   = excluded.mapping_status,
      mapping_reason   = excluded.mapping_reason
  `);
  const now = Date.now();
  const tx = db.transaction(rows => { for (const r of rows) ins.run({ ...r, batch: BATCH, now }); });
  tx(plan);
  log(`  ✓ legacy_user_map 写入 ${plan.length} 行（batch=${BATCH}）`);
} else {
  log(`  [dry-run] 将写入 legacy_user_map ${plan.length} 行`);
}

// ---------------------------------------------------------------------------
// 3. orphan prayer_shares → deleted-account tombstone
// ---------------------------------------------------------------------------
step(3, 'orphan prayer_shares → deleted-account tombstone');

const cols = db.prepare(`PRAGMA table_info("prayer_shares")`).all().map(c => c.name);
const needsRebuild = !cols.includes('author_state');

const legacyIds = new Set(legacyUsers.map(u => u.id));
const orphanShares = db.prepare('SELECT id, user_id FROM prayer_shares').all()
  .filter(r => r.user_id && !legacyIds.has(r.user_id));
log(`  orphan prayer_shares: ${orphanShares.length}`);

if (!APPLY) {
  log(`  [dry-run] 将${needsRebuild ? '重建表（user_id 可空 + author_state）并' : ''}把 ${orphanShares.length} 条置为 tombstone`);
  for (const r of orphanShares) log(`    · ${r.id} 原作者 ${r.user_id} → NULL / deleted_account`);
} else {
  const tx = db.transaction(() => {
    if (needsRebuild) {
      // SQLite 无法直接放宽 NOT NULL，需重建。**逐列显式搬运，不用 SELECT *，
      // 避免将来加列时静默丢数据。**
      const carry = cols.filter(c => c !== 'author_state');
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec(`
        CREATE TABLE prayer_shares__new (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          -- 作者账号可能已注销：此处允许为空，语义由 author_state 表达
          user_id TEXT,
          author_state TEXT NOT NULL DEFAULT 'active'
            CHECK(author_state IN ('active','deleted_account')),
          ${carry.filter(c => !['id', 'room_id', 'user_id'].includes(c))
              .map(c => `${c} ${c === 'text' ? 'TEXT NOT NULL' : c === 'is_anonymous' ? 'INTEGER NOT NULL DEFAULT 0' : c === 'created_at' ? 'INTEGER NOT NULL' : 'TEXT'}`)
              .join(',\n          ')}
        );
      `);
      db.exec(`INSERT INTO prayer_shares__new (${carry.join(', ')})
               SELECT ${carry.join(', ')} FROM prayer_shares;`);
      db.exec('DROP TABLE prayer_shares;');
      db.exec('ALTER TABLE prayer_shares__new RENAME TO prayer_shares;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_prayer_shares_room ON prayer_shares(room_id, created_at);');
      db.exec('PRAGMA foreign_keys = ON');
      log('  ✓ prayer_shares 已重建：user_id 可空 + author_state');
    }
    const upd = db.prepare(
      "UPDATE prayer_shares SET user_id = NULL, author_state = 'deleted_account' WHERE id = ?");
    for (const r of orphanShares) upd.run(r.id);
  });
  tx();
  log(`  ✓ ${orphanShares.length} 条已置为 tombstone（内容、created_at、room 边界均未改动）`);

  // 原 legacy author UUID 保存在受限 artifact，不进入普通前端读模型
  db.exec(`
    CREATE TABLE IF NOT EXISTS tombstoned_author_audit (
      share_id         TEXT PRIMARY KEY,
      legacy_author_id TEXT NOT NULL,
      migration_batch  TEXT NOT NULL,
      created_at       INTEGER NOT NULL
    );
  `);
  const ta = db.prepare(`INSERT OR REPLACE INTO tombstoned_author_audit
    (share_id, legacy_author_id, migration_batch, created_at) VALUES (?, ?, ?, ?)`);
  const now2 = Date.now();
  const tx2 = db.transaction(() => { for (const r of orphanShares) ta.run(r.id, r.user_id, BATCH, now2); });
  tx2();
  log('  ✓ 原 legacy author UUID 已存入受限 tombstoned_author_audit（不进入前端读模型）');
}

// ---------------------------------------------------------------------------
// 4. 断言
// ---------------------------------------------------------------------------
step(4, '断言');
const assertions = [];
const A = (name, ok, detail = '') => { assertions.push({ name, ok, detail }); log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`); };

const unresolved = plan.filter(p => p.mapping_status === 'needs_provision' || p.mapping_status === 'provision_failed');
if (APPLY) {
  A('unresolved mapping = 0', unresolved.length === 0, `unresolved=${unresolved.length}`);
} else {
  // dry-run 阶段 needs_provision 是**预期状态**（还没建号），不是失败；
  // 但也不能报成 PASS——那会掩盖"还有多少账号待处理"。
  log(`  [dry-run] 待 provision: ${unresolved.length}（apply 后必须为 0）`);
}

const dupSb = new Map();
for (const p of plan) if (p.supabase_user_id) {
  dupSb.set(p.supabase_user_id, (dupSb.get(p.supabase_user_id) ?? 0) + 1);
}
A('无多个 legacy identity 指向同一 Supabase UUID', [...dupSb.values()].every(v => v === 1));

const testMapped = plan.filter(p => p.isTest && p.supabase_user_id);
A('测试账号未映射到任何 Supabase 真实身份', testMapped.length === 0, `mapped_test=${testMapped.length}`);

if (APPLY) {
  const stillOrphan = db.prepare('SELECT COUNT(*) n FROM prayer_shares WHERE user_id IS NOT NULL').all();
  const tomb = db.prepare("SELECT COUNT(*) n FROM prayer_shares WHERE author_state = 'deleted_account'").get();
  A('tombstone 数量正确', tomb.n === orphanShares.length, `tombstoned=${tomb.n}`);
  const total = db.prepare('SELECT COUNT(*) n FROM prayer_shares').get();
  A('prayer_shares 内容一条未丢', total.n === 12, `rows=${total.n}`);
  const noOwner = db.prepare(
    "SELECT COUNT(*) n FROM prayer_shares WHERE author_state='deleted_account' AND user_id IS NOT NULL").get();
  A('tombstone 记录没有被挂给任何用户', noOwner.n === 0, `wrongly_owned=${noOwner.n}`);
}

db.close();

const failed = assertions.filter(a => !a.ok);
log(`\n模式: ${APPLY ? 'APPLY' : 'DRY-RUN'} | 断言 ${assertions.length - failed.length}/${assertions.length} PASS`);
if (APPLY) log(`回滚依据: 快照 ${snapshot} + legacy_user_map + tombstoned_author_audit`);
process.exitCode = failed.length ? 1 : 0;
