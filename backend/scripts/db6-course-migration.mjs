#!/usr/bin/env node
/**
 * DB-6 COURSE MIGRATION TOOL —— 离线课程迁移工具
 *
 * RB-01 / DB-6。按 D-27，本仓库只放**离线迁移工具**，不含任何 DDL：
 * 本工具读 SQLite + App 权威目录 + canonical catalog 快照，
 * 产出 COURSE_MAPPING_MANIFEST 与**幂等的 SQL**，由 psql 施加到 Postgres。
 * 它自己从不连接 Postgres，也不新增任何 npm 依赖。
 *
 * 三个源：
 *   A. services/catalog.ts  OFFICIAL_CATALOG   —— App 课程身份的代码级权威（67）
 *   B. backend/data/amas.sqlite  courses 表     —— 待迁移的 legacy 数据（67 行）
 *   C. canonical_catalog.csv                    —— 从目标 Postgres 导出的 course_catalog 快照（67）
 *
 * 对齐**只用 code 精确相等**。禁止名称模糊匹配 —— 名字像不代表是同一门课。
 *
 * 用法：
 *   node db6-course-migration.mjs --sqlite <path> --canonical <csv> --out <dir> [--emit-sql]
 *
 * 三种模式（TASK 7）：
 *   dry-run  （默认）      只产出 manifest，NO WRITE
 *   --emit-sql            额外产出幂等 UPDATE 语句（仍不写库，由 psql 执行）
 *   verify                由 website 仓库的 SQL 测试承担（本工具不连库）
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
// fileURLToPath 而不是手拆 URL：仓库目录名含空格（"AMAS Seminar App"），
// 直接取 .pathname 会拿到百分号编码的 %20 而打不开文件。
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..', '..');

const SQLITE_PATH = arg('sqlite', path.join(APP_ROOT, 'backend', 'data', 'amas.sqlite'));
const CANONICAL_CSV = arg('canonical', null);
const OUT_DIR = arg('out', path.join(APP_ROOT, 'backend', 'data', 'db6-out'));
const EMIT_SQL = process.argv.includes('--emit-sql');

if (!CANONICAL_CSV) {
  console.error('缺少 --canonical <csv>：需要目标 Postgres 的 course_catalog 快照。');
  console.error('导出方式：psql --csv -c "select code,title_zh,category::text,coalesce(level,\'\') level,'
    + 'coalesce(instructor,\'\') instructor,total_lessons,availability::text,sort_order '
    + 'from course_catalog order by code"');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 源 A —— App OFFICIAL_CATALOG（解析 TS 源文件）
//
// 刻意不 import TS：这是审计工具，读源文件文本比走一遍构建链更可验证，
// 也避免工具依赖 App 的运行时配置。
// ---------------------------------------------------------------------------
function readOfficialCatalog() {
  const file = path.join(APP_ROOT, 'services', 'catalog.ts');
  const src = fs.readFileSync(file, 'utf8');

  const start = src.indexOf('export const OFFICIAL_CATALOG');
  if (start < 0) throw new Error('services/catalog.ts 中找不到 OFFICIAL_CATALOG');
  const end = src.indexOf('export const RETIRED_COURSE_IDS');
  if (end < 0) throw new Error('services/catalog.ts 中找不到 RETIRED_COURSE_IDS');
  const body = src.slice(start, end);

  const entries = [];
  // 逐条 { ... } 抽取；只认显式字段，不做任何推断。
  for (const m of body.matchAll(/\{\s*id:\s*'([^']+)'([\s\S]*?)\}\s*,/g)) {
    const [, id, rest] = m;
    const pick = (k) => {
      const r = new RegExp(`\\b${k}:\\s*'([^']*)'`).exec(rest);
      return r ? r[1] : null;
    };
    const pickIdent = (k) => {
      const r = new RegExp(`\\b${k}:\\s*([A-Za-z_][A-Za-z0-9_.]*)`).exec(rest);
      return r ? r[1] : null;
    };
    const pickNum = (k) => {
      const r = new RegExp(`\\b${k}:\\s*(\\d+)`).exec(rest);
      return r ? Number(r[1]) : null;
    };
    entries.push({
      id,
      title: pick('title'),
      category: pickIdent('category'),
      level: pickIdent('level'),
      instructor: pick('instructor'),
      totalLessons: pickNum('totalLessons'),
    });
  }

  const retiredLine = /export const RETIRED_COURSE_IDS\s*=\s*\[([^\]]*)\]/.exec(src);
  const retired = retiredLine
    ? [...retiredLine[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    : [];

  return { entries, retired, file };
}

// ---------------------------------------------------------------------------
// 源 B —— SQLite courses（只读）
// ---------------------------------------------------------------------------
function readSqliteCourses(dbPath) {
  const Database = require('better-sqlite3');
  // 复制到临时文件再以 readonly 打开：绝不触碰源库（DB-2 起的既定做法）
  const tmp = path.join(OUT_DIR, '_readonly_copy.sqlite');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.copyFileSync(dbPath, tmp);

  const db = new Database(tmp, { readonly: true });
  const rows = db.prepare(
    `select id, title, instructor, category, level, thumbnail, thumbnail_image_id,
            total_lessons, created_at, created_by
       from courses order by id`
  ).all();
  const progress = db.prepare('select course_id, count(*) n from course_progress group by 1').all();
  const files = db.prepare('select course_id, count(*) n from course_files group by 1').all();
  db.close();

  for (const f of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmp + f); } catch { /* 不存在即可 */ }
  }
  return { rows, progress, files };
}

// ---------------------------------------------------------------------------
// 源 C —— canonical catalog 快照（CSV）
// ---------------------------------------------------------------------------
function readCanonicalCsv(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8').replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n');
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const official = readOfficialCatalog();
const sqlite = readSqliteCourses(SQLITE_PATH);
const canonical = readCanonicalCsv(CANONICAL_CSV);

const officialById = new Map(official.entries.map((e) => [e.id, e]));
const sqliteById = new Map(sqlite.rows.map((r) => [r.id, r]));
const canonicalByCode = new Map(canonical.map((r) => [r.code, r]));
const retiredSet = new Set(official.retired);
const progressByCourse = new Map(sqlite.progress.map((r) => [r.course_id, r.n]));
const filesByCourse = new Map(sqlite.files.map((r) => [r.course_id, r.n]));

const allIds = [...new Set([
  ...officialById.keys(), ...sqliteById.keys(), ...canonicalByCode.keys(),
  ...retiredSet,
])].sort();

/** thumbnail 的形态分类。EMPTY_STRING 与 NULL 刻意分开 —— 它们语义不同。 */
function thumbnailShape(v) {
  if (v == null) return 'NULL';
  if (v === '') return 'EMPTY_STRING';
  if (/^data:/.test(v)) return 'DATA_URI';
  if (/^https?:/i.test(v)) return 'URL';
  return 'APP_RELATIVE_PATH';
}

const manifest = [];
for (const id of allIds) {
  const o = officialById.get(id);
  const s = sqliteById.get(id);
  const c = canonicalByCode.get(id);
  const isRetired = retiredSet.has(id);

  let status, mappingMethod, action, note = '';

  if (isRetired) {
    // D-37 / TASK 2：retired id 默认保留为历史引用，绝不猜测替代课程。
    status = 'RETIRED';
    mappingMethod = 'retired_id_registry';
    action = 'PRESERVE_AS_RETIRED_REFERENCE';
    note = '两侧正式目录均已移除；无正式裁定的 canonical 替代';
    if (c) { status = 'CONFLICT'; note = 'retired id 竟出现在 canonical catalog 中'; action = 'BLOCKED'; }
    if (s) { status = 'CONFLICT'; note = 'retired id 竟出现在 SQLite courses 中'; action = 'BLOCKED'; }
  } else if (o && s && c) {
    status = 'EXACT_CANONICAL_MATCH';
    mappingMethod = 'exact_code_equality';
    // canonical 行已存在 → 只补 App 专属扩展列，绝不重复 INSERT
    const needsExt = s.thumbnail != null || s.created_at != null || s.created_by != null
      || s.thumbnail_image_id != null;
    action = needsExt ? 'UPDATE_EXTENSION_FIELDS' : 'NO_ACTION';
  } else if (!c) {
    status = 'CONFLICT';
    mappingMethod = 'none';
    action = 'BLOCKED';
    note = 'canonical catalog 中不存在此 code —— 不得凭名称猜测归属';
  } else if (!o) {
    status = 'CONFLICT';
    mappingMethod = 'none';
    action = 'BLOCKED';
    note = 'App 权威目录中不存在此 code';
  } else {
    status = 'CONFLICT';
    mappingMethod = 'none';
    action = 'BLOCKED';
    note = 'SQLite courses 中不存在此 code';
  }

  manifest.push({
    legacy_course_id: id,
    canonical_course_code: c ? c.code : null,
    legacy_title: s ? s.title : (o ? o.title : null),
    canonical_title: c ? c.title_zh : null,
    official_catalog_title: o ? o.title : null,
    title_identical: !!(s && c) ? (s.title === c.title_zh) : null,
    status,
    mapping_method: mappingMethod,
    migration_action: action,
    legacy_created_at_ms: s ? s.created_at : null,
    legacy_created_by: s ? s.created_by : null,
    legacy_thumbnail: s ? s.thumbnail : null,
    // 空串与 NULL 是两回事，必须分开记录：
    // 迁移**逐字保留**空串，不静默归一成 NULL —— 那属于未声明的数据改写。
    legacy_thumbnail_shape: s ? thumbnailShape(s.thumbnail) : null,
    legacy_thumbnail_image_id: s ? s.thumbnail_image_id : null,
    legacy_total_lessons: s ? s.total_lessons : null,
    canonical_total_lessons: c ? Number(c.total_lessons) : null,
    course_progress_rows: progressByCourse.get(id) ?? 0,
    course_files_rows: filesByCourse.get(id) ?? 0,
    note,
  });
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });

const counts = manifest.reduce((a, m) => { a[m.status] = (a[m.status] ?? 0) + 1; return a; }, {});
const actions = manifest.reduce((a, m) => { a[m.migration_action] = (a[m.migration_action] ?? 0) + 1; return a; }, {});

const summary = {
  generated_at: new Date().toISOString(),
  mode: EMIT_SQL ? 'emit-sql' : 'dry-run',
  sources: {
    official_catalog: { file: 'services/catalog.ts', count: official.entries.length },
    sqlite_courses: { file: path.basename(SQLITE_PATH), count: sqlite.rows.length,
                      sha256: crypto.createHash('sha256')
                        .update(fs.readFileSync(SQLITE_PATH)).digest('hex').slice(0, 32) },
    canonical_catalog: { file: path.basename(CANONICAL_CSV), count: canonical.length },
  },
  retired_course_ids: official.retired,
  set_comparison: {
    official_only: [...officialById.keys()].filter((k) => !canonicalByCode.has(k)),
    canonical_only: [...canonicalByCode.keys()].filter((k) => !officialById.has(k)),
    sqlite_only: [...sqliteById.keys()].filter((k) => !canonicalByCode.has(k)),
    intersection: [...officialById.keys()].filter((k) => canonicalByCode.has(k)).length,
  },
  status_counts: counts,
  action_counts: actions,
  thumbnail_shapes: manifest.filter((m) => m.legacy_thumbnail_shape)
    .reduce((a, m) => { a[m.legacy_thumbnail_shape] = (a[m.legacy_thumbnail_shape] ?? 0) + 1; return a; }, {}),
  provenance_values: manifest.filter((m) => m.legacy_created_by)
    .reduce((a, m) => { a[m.legacy_created_by] = (a[m.legacy_created_by] ?? 0) + 1; return a; }, {}),
  created_at_nulls: manifest.filter((m) => m.status === 'EXACT_CANONICAL_MATCH'
    && m.legacy_created_at_ms == null).length,
  created_at_sub_second: manifest.filter((m) => m.legacy_created_at_ms != null
    && m.legacy_created_at_ms % 1000 !== 0).length,
  title_mismatches: manifest.filter((m) => m.title_identical === false)
    .map((m) => ({ code: m.legacy_course_id, legacy: m.legacy_title, canonical: m.canonical_title })),
  total_lessons_mismatches: manifest
    .filter((m) => m.legacy_total_lessons != null && m.canonical_total_lessons != null
                && m.legacy_total_lessons !== m.canonical_total_lessons)
    .map((m) => ({ code: m.legacy_course_id, legacy: m.legacy_total_lessons, canonical: m.canonical_total_lessons })),
};

// ---------------------------------------------------------------------------
// RETIRED_COURSE_MANIFEST（DB-6.1 TASK 3 / D-37）
//
// 把 4 个已退役 ID 正式固定为迁移契约的一部分，字段是 Supervisor 指定的那组。
// `canonical_replacement` 恒为 null —— 拆分是一对多，不存在单一替代；
// 任何「名字最像」的填法都是猜测（D-37 明令禁止）。
// 也不编造标题：仓库全历史从未记录过这 4 个 ID 的课程名。
// ---------------------------------------------------------------------------
const retiredManifest = official.retired.map((id) => ({
  legacy_course_id: id,
  status: 'RETIRED',
  canonical_replacement: null,
  mapping_basis:
    'services/catalog.ts:117 RETIRED_COURSE_IDS 声明 + 同处注释「旧的合并课程 → 已按书卷/主题拆分，迁移后删除」；'
    + '拆分为一对多，无单一 canonical 替代，且仓库全历史未记录过其课程标题',
  historical_progress_count: progressByCourse.get(id) ?? 0,
  historical_files_count: filesByCourse.get(id) ?? 0,
  migration_action: 'PRESERVE_AS_RETIRED_REFERENCE',
  // D-37：这类行永远不进 active course_progress。
  // 若将来真实数据集中出现引用它们的进度行，迁移必须 fail closed / quarantine。
  active_course_progress_policy: 'NEVER_WRITE_TO_ACTIVE_COURSE_PROGRESS',
  on_encounter_in_future_dataset: 'FAIL_CLOSED_AND_QUARANTINE_FOR_PRODUCT_OWNER',
  quarantine_state: 'LEGACY_RETIRED / MIGRATION_REVIEW_REQUIRED',
}));

fs.writeFileSync(path.join(OUT_DIR, 'retired-course-manifest.json'),
  JSON.stringify({
    generated_at: summary.generated_at,
    decision: 'D-37',
    note: '当前 historical_progress_count 全为 0，因此本轮不新增任何 legacy-retired 业务表。',
    retired: retiredManifest,
  }, null, 2), 'utf8');

fs.writeFileSync(path.join(OUT_DIR, 'course-mapping-manifest.json'),
  JSON.stringify({ summary, manifest, retired_manifest: retiredManifest }, null, 2), 'utf8');

// 人可读的 manifest 表
const md = [
  '| legacy_course_id | canonical_code | legacy_title | canonical_title | status | mapping_method | migration_action |',
  '|---|---|---|---|---|---|---|',
  ...manifest.map((m) => `| \`${m.legacy_course_id}\` | ${m.canonical_course_code ? '`'+m.canonical_course_code+'`' : '—'} `
    + `| ${m.legacy_title ?? '—'} | ${m.canonical_title ?? '—'} | ${m.status} | ${m.mapping_method} | ${m.migration_action} |`),
].join('\n');
fs.writeFileSync(path.join(OUT_DIR, 'course-mapping-manifest.md'), md + '\n', 'utf8');

// ---------------------------------------------------------------------------
// 幂等 SQL（--emit-sql）
//
// 只 UPDATE 已存在的 canonical 行的 App 专属扩展列。
// 不 INSERT、不 DELETE、不碰 Portal 既有列。
// ---------------------------------------------------------------------------
if (EMIT_SQL) {
  const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
  const lines = [
    '-- DB-6 course migration — 由 backend/scripts/db6-course-migration.mjs 生成，请勿手改。',
    '-- 只更新 canonical course_catalog 中**已存在**行的 App 专属扩展列。',
    '-- 不 INSERT、不 DELETE、不修改任何 Portal 既有列。重复执行结果相同（幂等）。',
    '',
    'begin;',
    '',
    '-- 前置断言：canonical 目录必须恰好 67 条，且每个待更新 code 都必须已存在。',
    "do $$ declare n int; begin",
    '  select count(*) into n from public.course_catalog;',
    "  if n <> 67 then raise exception 'canonical course_catalog 行数为 %，预期 67 —— 拒绝执行', n; end if;",
    'end $$;',
    '',
  ];

  const updatable = manifest.filter((m) => m.migration_action === 'UPDATE_EXTENSION_FIELDS');
  for (const m of updatable) {
    lines.push(
      `update public.course_catalog set`,
      `  thumbnail_path        = ${q(m.legacy_thumbnail)},`,
      `  thumbnail_image_id    = ${m.legacy_thumbnail_image_id == null ? 'null' : q(m.legacy_thumbnail_image_id) + '::uuid'},`,
      `  created_at            = ${m.legacy_created_at_ms == null ? 'null' : `to_timestamp(${m.legacy_created_at_ms} / 1000.0)`},`,
      `  created_by_provenance = ${q(m.legacy_created_by)}`,
      `where code = ${q(m.legacy_course_id)};`,
      ''
    );
  }

  lines.push(
    '-- 后置断言：行数未变，且扩展列已按预期填充。',
    'do $$ declare n int; f int; begin',
    '  select count(*) into n from public.course_catalog;',
    `  if n <> 67 then raise exception '执行后 canonical 行数变为 %，迁移引入了增删 —— 已回滚', n; end if;`,
    '  select count(*) into f from public.course_catalog where created_by_provenance is not null;',
    `  if f <> ${updatable.length} then raise exception '预期 % 行带 provenance，实际 %', ${updatable.length}, f; end if;`,
    'end $$;',
    '',
    'commit;'
  );
  fs.writeFileSync(path.join(OUT_DIR, 'db6-apply.sql'), lines.join('\n') + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// 控制台摘要
// ---------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log('=== DB-6 COURSE MAPPING (' + summary.mode + ') ===');
console.log('  源 A OFFICIAL_CATALOG :', official.entries.length);
console.log('  源 B SQLite courses   :', sqlite.rows.length, '(sha256:' + summary.sources.sqlite_courses.sha256 + ')');
console.log('  源 C canonical catalog:', canonical.length);
console.log('  交集(code 精确相等)   :', summary.set_comparison.intersection);
console.log('  App 独有 / canonical 独有 / SQLite 独有:',
  summary.set_comparison.official_only.length, '/',
  summary.set_comparison.canonical_only.length, '/',
  summary.set_comparison.sqlite_only.length);
console.log('  retired ids           :', official.retired.join(', '));
console.log('  ---- status ----');
for (const [k, v] of Object.entries(counts)) console.log('   ', pad(k, 26), v);
console.log('  ---- migration_action ----');
for (const [k, v] of Object.entries(actions)) console.log('   ', pad(k, 30), v);
console.log('  标题不一致:', summary.title_mismatches.length,
  '  课时数不一致:', summary.total_lessons_mismatches.length);
console.log('  输出目录:', OUT_DIR);

const blocked = manifest.filter((m) => m.migration_action === 'BLOCKED');
if (blocked.length) {
  console.log('\n  ⚠ BLOCKED', blocked.length, '条：');
  for (const b of blocked) console.log('   ', b.legacy_course_id, '—', b.note);
  process.exit(1);
}
