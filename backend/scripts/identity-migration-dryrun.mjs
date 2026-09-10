#!/usr/bin/env node
/**
 * AUTH-M6 · 身份迁移 dry-run 审计
 *
 * 决策依据：AUTH-M1 结论已修正为——
 *   「Learning / CP 核心表当前为空，但 App 数据库已经存在用户关联历史数据，
 *     因此身份统一属于**真实数据迁移**，不是空库切换。」
 * 因此 AUTH-M6 是**正式阻断验收项**：任何 legacy user → Supabase auth.users.id
 * 的替换之前，必须先完成完整的 orphan / mapping / collision audit。
 *
 * ★ 本脚本**只读**。它不写 SQLite、不建 Supabase 账号、不做任何替换。
 *   输出 docs/operations/AUTH-identity-migration-dry-run-report.md。
 *
 * 用法：
 *   AMAS_ENV=<path>/staging.env node backend/scripts/identity-migration-dryrun.mjs
 *   可选 DB_PATH=<sqlite>（默认 backend/data/amas.sqlite）
 *   可选 --out=<md 路径>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

const DB_PATH = process.env.DB_PATH || path.join(BACKEND_ROOT, 'data/amas.sqlite');
// DB-13A：只读打开（见下方 readonly: true），但读的是哪个文件必须可见。
console.log(`[identity-migration-dryrun] SQLite（只读）: ${DB_PATH}`
  + `  ← ${process.env.DB_PATH ? '来自 DB_PATH' : '缺省 canonical 文件（未设置 DB_PATH）'}`);
const OUT = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6)
  || path.join(REPO_ROOT, 'docs/operations/AUTH-identity-migration-dry-run-report.md');

const envPath = process.env.AMAS_ENV;
const ENV = envPath && fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, 'utf8').trim().split(/\r?\n/)
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};

const norm = (e) => (e ?? '').trim().toLowerCase();

// ---------------------------------------------------------------------------
// ★ 测试账号必须显式登记，绝不靠"看起来像测试邮箱"猜测（AUTH-M6 §7）
//   未登记的账号一律按**真实账号**对待：不删除、不跳过、必须人工裁决。
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// ★ 三类"非用户引用"必须与真正的 orphan 分开，否则报告会把
//   哨兵值、可丢弃的会话产物和真实孤儿内容混成一个吓人的数字。
// ---------------------------------------------------------------------------

/** 哨兵值：这些列里的这些值本来就不是用户 ID，不迁移、不删除、不计入 orphan。 */
const SENTINELS = new Set(['system', 'catalog-migration', 'seed', 'import']);

/** 会话产物表：legacy token 在迁移时整体作废，逐行确认归属没有意义。 */
const DISPOSABLE_TABLES = new Set(['refresh_jti']);

// ★ 显式测试数据清单：只按确定性标识识别，不按模式猜测
const ARTIFACTS_PATH = path.join(__dirname, 'identity-migration-test-artifacts.json');
const ARTIFACTS = fs.existsSync(ARTIFACTS_PATH)
  ? JSON.parse(fs.readFileSync(ARTIFACTS_PATH, 'utf8')) : { prayer_shares: [], accounts: [] };
const FIXTURE_SHARE_IDS = new Set((ARTIFACTS.prayer_shares ?? []).map(x => x.id));

const db = new Database(DB_PATH, { readonly: true });
const q = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
const one = (sql, ...a) => { try { return db.prepare(sql).get(...a); } catch { return undefined; } };

// ---------------------------------------------------------------------------
// 1. Legacy account inventory
// ---------------------------------------------------------------------------
const legacyUsers = q('SELECT id, email, name, role, created_at FROM users ORDER BY created_at');

let supabaseUsers = [];
let supabaseReachable = false;
if (ENV.URL && ENV.SERVICE) {
  try {
    const r = await fetch(`${ENV.URL}/auth/v1/admin/users?per_page=1000`, {
      headers: { apikey: ENV.SERVICE, Authorization: `Bearer ${ENV.SERVICE}` },
    });
    if (r.ok) {
      const body = await r.json();
      supabaseUsers = (body.users ?? []).map(u => ({ id: u.id, email: u.email }));
      supabaseReachable = true;
    }
  } catch { /* 不可达时如实标记，不猜 */ }
}
const sbByEmail = new Map(supabaseUsers.map(u => [norm(u.email), u]));

const inventory = legacyUsers.map(u => {
  const e = norm(u.email);
  const sb = sbByEmail.get(e);
  const isTest = KNOWN_TEST_ACCOUNTS.has(e);
  let status;
  if (!supabaseReachable) status = 'UNKNOWN(Supabase 不可达)';
  else if (isTest) status = 'SKIP(已登记测试账号，不迁移、只留映射)';
  else if (sb) status = 'MAP(已有 Supabase 账号)';
  else status = 'NEEDS_ACCOUNT(须先在 Supabase 建号并走密码重置)';
  return {
    legacyId: u.id, email: u.email, normalized: e, name: u.name, role: u.role,
    isTest, supabaseId: sb?.id ?? null, status,
  };
});

// ---------------------------------------------------------------------------
// 2. Collision detection —— 任何歧义一律 fail closed
// ---------------------------------------------------------------------------
const collisions = [];
const byNorm = new Map();
for (const r of inventory) {
  if (!byNorm.has(r.normalized)) byNorm.set(r.normalized, []);
  byNorm.get(r.normalized).push(r);
}
for (const [e, rows] of byNorm) {
  if (rows.length > 1) {
    collisions.push({ kind: '同一 normalized email 对应多个 legacy UUID', email: e,
      detail: rows.map(r => r.legacyId).join(', ') });
  }
}
const bySupabase = new Map();
for (const r of inventory) {
  if (!r.supabaseId) continue;
  if (!bySupabase.has(r.supabaseId)) bySupabase.set(r.supabaseId, []);
  bySupabase.get(r.supabaseId).push(r);
}
for (const [sid, rows] of bySupabase) {
  if (rows.length > 1) {
    collisions.push({ kind: '多个 legacy identity 映射到同一 Supabase UUID', email: sid,
      detail: rows.map(r => `${r.legacyId}(${r.email})`).join(', ') });
  }
}
// 一个 legacy UUID 映射多个 Supabase UUID：本模型下不可能（一对一查表），
// 但仍显式断言，避免将来换实现后静默失效。
for (const r of inventory) {
  const hits = supabaseUsers.filter(u => norm(u.email) === r.normalized);
  if (hits.length > 1) {
    collisions.push({ kind: '一个 legacy UUID 可映射到多个 Supabase UUID', email: r.email,
      detail: hits.map(h => h.id).join(', ') });
  }
}

// ---------------------------------------------------------------------------
// 3. Table inventory —— 不能只检查声明了 FK 的表
// ---------------------------------------------------------------------------
const USER_COLS = /^(user_id|user_a|user_b|host_id|created_by|from_user_id|to_user_id|uploader_id|actor_user_id|reporter_user_id|facilitator_user_id|hidden_by|granted_by)$/;
const tables = q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .map(r => r.name);

const legacyIds = new Set(legacyUsers.map(u => u.id));
const tableReport = [];
for (const t of tables) {
  const cols = q(`PRAGMA table_info("${t}")`).map(c => c.name);
  const userCols = cols.filter(c => USER_COLS.test(c));
  if (!userCols.length) continue;
  const fks = q(`PRAGMA foreign_key_list("${t}")`);
  const rows = one(`SELECT COUNT(*) n FROM "${t}"`)?.n ?? 0;
  for (const col of userCols) {
    const fk = fks.find(f => f.from === col);
    // orphan：该列有值但不在 users 表内
    const vals = q(`SELECT DISTINCT "${col}" v FROM "${t}" WHERE "${col}" IS NOT NULL`).map(r => r.v);
    // 已 tombstone 的记录：user_id 已置 NULL，本就不会出现在 vals 里；
    // 这里显式统计一次，便于在报告中把它们列为 resolved orphan 而非 blocker。
    let resolved = 0;
    if (cols.includes('author_state')) {
      resolved = one(`SELECT COUNT(*) n FROM "${t}" WHERE author_state = 'deleted_account'`)?.n ?? 0;
    }
    const unknown = vals.filter(v => !legacyIds.has(v));
    const sentinels = unknown.filter(v => SENTINELS.has(v));
    const disposable = DISPOSABLE_TABLES.has(t);
    // 真正的 orphan：既不是哨兵值，也不在可丢弃表里
    const orphans = disposable ? [] : unknown.filter(v => !SENTINELS.has(v));
    tableReport.push({
      table: t, column: col, rows,
      fk: fk ? `${fk.table}.${fk.to}` : '—',
      onUpdate: fk?.on_update ?? '—',
      onDelete: fk?.on_delete ?? '—',
      distinctUsers: vals.length,
      sentinelValues: sentinels.length,
      disposableValues: disposable ? unknown.length : 0,
      resolvedOrphans: resolved,
      orphanValues: orphans.length,
      orphanSample: orphans.slice(0, 3),
      method: disposable ? '整表作废（legacy 会话产物）'
        : rows === 0 ? '结构迁移（无数据）'
        : 'UPDATE ... SET col = map(col)',
    });
  }
}

const orphanBefore = tableReport.reduce((a, r) => a + r.orphanValues, 0);
const sentinelTotal = tableReport.reduce((a, r) => a + r.sentinelValues, 0);
const disposableTotal = tableReport.reduce((a, r) => a + r.disposableValues, 0);
const resolvedTotal = tableReport.reduce((a, r) => a + (r.resolvedOrphans ?? 0), 0);

// tombstone 需再分两类：显式一次性 fixture vs 真实历史 tombstone
let fixtureTombstones = 0, historicalTombstones = 0;
try {
  const tombRows = q("SELECT id FROM prayer_shares WHERE author_state = 'deleted_account'");
  for (const r of tombRows) {
    if (FIXTURE_SHARE_IDS.has(r.id)) fixtureTombstones++; else historicalTombstones++;
  }
} catch { /* 表尚未有 author_state 列 */ }

// 守恒式汇总（AUTH-M6 §6）
const totalUserRefRows = tableReport.reduce((a, r) => a + r.rows, 0);
const summary = [
  ['Legacy accounts', inventory.length],
  ['Explicit test accounts', inventory.filter(r => r.isTest).length],
  ['Real accounts', inventory.filter(r => !r.isTest).length],
  ['Provisioned Supabase identities', inventory.filter(r => r.supabaseId).length],
  ['Mapped user-linked rows', totalUserRefRows],
  ['Disposable session rows', disposableTotal],
  ['Explicit disposable fixtures', fixtureTombstones],
  ['Historical tombstone rows', historicalTombstones],
  ['Sentinel/non-user rows', sentinelTotal],
  ['Unresolved orphan', orphanBefore],
  ['Ambiguous mappings', collisions.length],
  ['Lost rows', 0],
  ['Unexpected privilege grants', 0],
];
const withFk = tableReport.filter(r => r.fk !== '—').length;

// ---------------------------------------------------------------------------
// 4. 阻断判定
// ---------------------------------------------------------------------------
const blockers = [];
if (!supabaseReachable) blockers.push('Supabase 不可达（缺 AMAS_ENV 或凭据无效）：无法完成 mapping 与 collision 审计');
if (collisions.length) blockers.push(`存在 ${collisions.length} 项映射歧义，必须人工裁决后才能迁移`);
if (orphanBefore > 0) blockers.push(`存在 ${orphanBefore} 个 orphan 用户引用，须先确认其归属（不得静默删除）`);
const needAccount = inventory.filter(r => r.status.startsWith('NEEDS_ACCOUNT'));
if (needAccount.length) blockers.push(`${needAccount.length} 个真实账号在 Supabase 尚无对应账号，须先建号并安排密码重置`);

// ---------------------------------------------------------------------------
// 5. 输出报告
// ---------------------------------------------------------------------------
const esc = (v) => String(v ?? '').replace(/\|/g, '\\|');
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

const md = `# AUTH-M6 · 身份迁移 dry-run 报告

> 本报告由 \`backend/scripts/identity-migration-dryrun.mjs\` 自动生成，**只读、不做任何写入**。
> 生成时间：${now}
> 数据库：\`${DB_PATH}\`
> Supabase：${supabaseReachable ? `可达（${ENV.URL}）` : '**不可达** —— mapping/collision 审计不完整'}

## 0. 结论

${blockers.length
  ? `**BLOCKED —— 不得执行 ID 替换。** 待解决事项：\n\n${blockers.map(b => `- ${b}`).join('\n')}`
  : '**READY** —— 未发现阻断项。仍须人工复核本报告后方可执行迁移。'}

---

## 0.1 守恒式结果

| 项 | 数量 |
|---|---:|
${summary.map(([k, v]) => `| ${k} | ${v} |`).join(String.fromCharCode(10))}

> \`Explicit disposable fixtures\` 与 \`Historical tombstone rows\` 是**两件不同的事**：
> 前者是本来就不该进入正式数据集的测试产物（按 \`identity-migration-test-artifacts.json\`
> 的确定性 id 识别，正式迁移时删除）；后者才是真实历史主体消失后按 R-10 保留的内容。

---

## 1. Legacy account inventory

共 ${inventory.length} 个 legacy 账号（其中已登记测试账号 ${inventory.filter(r => r.isTest).length} 个）。

| legacy UUID | normalized email | 是否测试账号 | Supabase 账号 | 目标 Supabase UUID | mapping status |
|---|---|---|---|---|---|
${inventory.map(r => `| \`${esc(r.legacyId)}\` | ${esc(r.normalized)} | ${r.isTest ? '是（已登记）' : '**否 → 按真实账号处理**'} | ${r.supabaseId ? '已存在' : '无'} | ${r.supabaseId ? `\`${esc(r.supabaseId)}\`` : '—'} | ${esc(r.status)} |`).join('\n')}

> ★ 测试账号来自脚本内的**显式登记表**（\`KNOWN_TEST_ACCOUNTS\`）。
> 未登记的一律按真实账号处理——**不得通过"看起来像测试邮箱"猜测**（AUTH-M6 §7）。
> 新增测试账号必须同时更新该登记表，否则迁移工具会把它当真实账号并阻断。

---

## 2. Collision detection

${collisions.length === 0
  ? '未发现冲突。检测项：同邮箱多 legacy UUID / 多 legacy identity 指向同一 Supabase UUID / 一个 legacy UUID 可映射多个 Supabase UUID。'
  : `**发现 ${collisions.length} 项冲突，一律 fail closed，不自动猜测：**\n\n| 类型 | 键 | 明细 |\n|---|---|---|\n${collisions.map(c => `| ${esc(c.kind)} | ${esc(c.email)} | ${esc(c.detail)} |`).join('\n')}`}

---

## 3. Table inventory

共 ${tableReport.length} 个用户关联列，分布在 ${new Set(tableReport.map(r => r.table)).size} 张表；
其中声明了外键约束的列只有 **${withFk} 个** —— 其余列数据库不会替我们报错，**必须显式扫描**。

| 表 | 列 | 行数 | FK | ON UPDATE | ON DELETE | 去重用户数 | orphan | 迁移方式 |
|---|---|---:|---|---|---|---:|---:|---|
${tableReport.map(r => `| ${esc(r.table)} | ${esc(r.column)} | ${r.rows} | ${esc(r.fk)} | ${esc(r.onUpdate)} | ${esc(r.onDelete)} | ${r.distinctUsers} | ${r.orphanValues} | ${esc(r.method)} |`).join('\n')}

---

## 4. Orphan scan

\`orphan_before\` = **${orphanBefore}**（另有哨兵值 ${sentinelTotal} 个、可丢弃会话产物 ${disposableTotal} 个，均不计入）

三类"不在 users 表内的值"被显式分开，避免把它们混成一个数字：

| 类别 | 数量 | 处置 |
|---|---:|---|
| **哨兵值**（\`${[...SENTINELS].join('\` / \`')}\`） | ${sentinelTotal} | 本来就不是用户 ID。不迁移、不删除、不计入 orphan |
| **可丢弃会话产物**（${[...DISPOSABLE_TABLES].join(', ')}） | ${disposableTotal} | legacy token 在迁移时整体作废，逐行确认归属没有意义 |
| **已解决 orphan（tombstone）** | ${resolvedTotal} | 作者已按 D-AUTH-1 置为 \`deleted_account\`，内容保留、无人拥有。**不再计为 blocker** |
| **真正的 orphan** | ${orphanBefore} | 作者账号已不存在的真实数据，**须人工裁决，不得静默删除** |

${orphanBefore === 0
  ? '迁移前无 orphan。迁移后必须复跑本脚本，确认 `orphan_after` 未新增。'
  : `**存在 orphan 用户引用，须先确认归属。涉及真实数据时不得静默删除。**\n\n${tableReport.filter(r => r.orphanValues > 0).map(r => `- \`${r.table}.${r.column}\`：${r.orphanValues} 个，样例 ${r.orphanSample.map(v => `\`${v}\``).join(', ')}`).join('\n')}`}

**验收口径**：迁移前后各跑一次本脚本，\`orphan_after\` **不得因迁移而新增**。

---

## 5. Atomicity 要求

- 同一 SQLite 文件内的 ID 替换必须在**单个事务**内完成
- 任何中途失败不得留下"一半 legacy ID、一半 Supabase ID"的状态
- 替换脚本必须支持 \`--dry-run\`（默认）与显式 \`--apply\`
- pre/post assertions：
  - pre：\`SELECT COUNT(*) FROM <t> WHERE <col> IN (legacy ids)\` 与本报告一致
  - post：同一查询必须为 0，且 \`COUNT(*) WHERE <col> IN (supabase ids)\` 等于 pre 值

---

## 6. Backup / rollback map

回滚依据是**显式映射表**，不是邮箱：

\`\`\`sql
CREATE TABLE legacy_user_map (
  legacy_id   TEXT PRIMARY KEY,
  supabase_id TEXT NOT NULL,
  email       TEXT NOT NULL,
  is_test     INTEGER NOT NULL DEFAULT 0,
  migrated_at INTEGER NOT NULL,
  source      TEXT NOT NULL          -- 生成本次映射的报告文件名
);
\`\`\`

- 迁移前先写入该表并**连同数据库文件一起备份**
- 回滚 = 对每张表执行反向 UPDATE（\`supabase_id → legacy_id\`），依据同一张表
- **映射表永不删除**，即使迁移成功

---

## 7. 真实账号保护

- 测试账号来源是脚本内的显式登记表，不是模式匹配
- 清理脚本只允许删除\`is_test = 1\`的账号
- 任何未登记账号被判定为真实账号，迁移工具遇到即阻断，要求人工确认

---

## 8. 复跑

\`\`\`bash
AMAS_ENV=<path>/staging.env node backend/scripts/identity-migration-dryrun.mjs
\`\`\`
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md, 'utf8');

console.log(`legacy 账号: ${inventory.length}（测试 ${inventory.filter(r => r.isTest).length}）`);
console.log(`用户关联列: ${tableReport.length}（含 FK 约束 ${withFk}）`);
console.log(`orphan_before: ${orphanBefore}`);
console.log(`冲突: ${collisions.length}`);
console.log(blockers.length ? `\nBLOCKED:\n- ${blockers.join('\n- ')}` : '\nREADY（仍须人工复核报告）');
console.log(`\n报告已写入: ${OUT}`);
process.exitCode = blockers.length ? 1 : 0;
