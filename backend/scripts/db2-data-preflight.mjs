// DB-2 只读数据预检。绝不修改任何行（readonly 连接）。
import Database from 'better-sqlite3';
import crypto from 'node:crypto';

const DB = process.argv[2];
const d = new Database(DB, { readonly: true });
const q = (sql, ...a) => d.prepare(sql).all(...a);
const one = (sql, ...a) => d.prepare(sql).get(...a);
const say = s => console.log(s);

const tables = q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(r => r.name);
say('### 表数: ' + tables.length);

// ── TASK 1 · 行数 ─────────────────────────────────────────
say('\n=== TASK 1 · ROW COUNTS ===');
const counts = {};
for (const t of tables) counts[t] = one('SELECT COUNT(*) n FROM "' + t + '"').n;
const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0);
const empty = Object.entries(counts).filter(([, n]) => n === 0).map(([t]) => t);
for (const [t, n] of nonEmpty.sort((a, b) => b[1] - a[1])) say('  ' + t.padEnd(26) + ' ' + n);
say('  --- 空表 (' + empty.length + '): ' + empty.join(' '));
say('  --- 总行数: ' + Object.values(counts).reduce((a, b) => a + b, 0));

// ── users 概况 ────────────────────────────────────────────
say('\n=== users 概况 ===');
const users = q('SELECT id, email, name, role, created_at FROM users');
say('  用户总数: ' + users.length);
const byRole = {};
for (const u of users) byRole[u.role] = (byRole[u.role] ?? 0) + 1;
say('  角色分布: ' + JSON.stringify(byRole));
const dupEmail = q('SELECT LOWER(email) e, COUNT(*) n FROM users GROUP BY LOWER(email) HAVING n > 1');
say('  大小写无关的重复邮箱: ' + dupEmail.length + (dupEmail.length ? ' -> ' + JSON.stringify(dupEmail) : ''));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badUuid = users.filter(u => !UUID.test(u.id));
say('  非 uuid 形态的 users.id: ' + badUuid.length + (badUuid.length ? ' -> ' + badUuid.map(u => u.id).join(',') : ''));
say('  越界 role 值: ' + users.filter(u => !['student', 'admin'].includes(u.role)).length);

// ── TASK 2 · 孤儿审计 ─────────────────────────────────────
say('\n=== TASK 2 · ORPHAN AUDIT ===');
const OWNED = [
  ['announcements', 'published_by'], ['course_progress', 'user_id'], ['courses', 'created_by'],
  ['friend_requests', 'from_user_id'], ['friend_requests', 'to_user_id'],
  ['growth_state', 'user_id'], ['image_uploads', 'uploaded_by'],
  ['library_favorites', 'user_id'], ['post_comments', 'user_id'], ['post_likes', 'user_id'],
  ['posts', 'user_id'], ['prayer_intercessions', 'user_id'], ['prayer_session_events', 'actor_user_id'],
  ['prayer_sessions', 'created_by'], ['prayer_sessions', 'facilitator_user_id'],
  ['prayer_share_reports', 'reporter_user_id'], ['prayer_shares', 'user_id'], ['prayer_shares', 'hidden_by'],
  ['pt_state', 'user_id'], ['push_tokens', 'user_id'], ['recordings', 'user_id'],
  ['refresh_jti', 'user_id'], ['room_members', 'user_id'], ['room_prayer_topics', 'created_by'],
  ['room_presence', 'user_id'], ['room_reading_state', 'updated_by'], ['rooms', 'host_id'],
  ['legacy_user_map', 'legacy_user_id'],
];
const ids = new Set(users.map(u => u.id));
let totOrphan = 0, totValid = 0, totSentinel = 0, totNull = 0;
for (const [t, col] of OWNED) {
  if (!tables.includes(t)) { say('  ' + t + '.' + col + ': 表不存在'); continue; }
  const cols = q('PRAGMA table_info("' + t + '")').map(c => c.name);
  if (!cols.includes(col)) { say('  ' + t + '.' + col + ': 列不存在'); continue; }
  const rows = q('SELECT "' + col + '" v, COUNT(*) n FROM "' + t + '" GROUP BY "' + col + '"');
  let valid = 0, orphan = 0, sentinel = 0, nul = 0;
  const orphanVals = [];
  for (const r of rows) {
    if (r.v === null) { nul += r.n; continue; }
    if (r.v === 'system') { sentinel += r.n; continue; }
    if (ids.has(r.v)) valid += r.n;
    else { orphan += r.n; orphanVals.push(r.v); }
  }
  totValid += valid; totOrphan += orphan; totSentinel += sentinel; totNull += nul;
  if (valid + orphan + sentinel + nul > 0) {
    say('  ' + (t + '.' + col).padEnd(38) + ' valid=' + valid + ' orphan=' + orphan +
      ' sentinel=' + sentinel + ' null=' + nul +
      (orphan ? '  [ORPHAN] vals=' + orphanVals.slice(0, 3).join(',') : ''));
  }
}
say('  --- 汇总: VALID=' + totValid + ' ORPHAN=' + totOrphan + ' SYSTEM_SENTINEL=' + totSentinel + ' NULL=' + totNull);

// ── TASK 4 · 角色实况 ─────────────────────────────────────
say('\n=== TASK 4 · ROLE REALITY ===');
for (const u of users) {
  say('  ' + String(u.role).padEnd(8) + ' ' + String(u.id).slice(0, 8) + '… ' +
    String(u.email).padEnd(36) + ' ' + u.name);
}

// ── TASK 5 · course_progress ──────────────────────────────
say('\n=== TASK 5 · COURSE PROGRESS ===');
if (tables.includes('course_progress')) {
  const cp = q('SELECT * FROM course_progress');
  say('  行数: ' + cp.length);
  const byCourse = {};
  for (const r of cp) byCourse[r.course_id] = (byCourse[r.course_id] ?? 0) + 1;
  say('  涉及课程数: ' + Object.keys(byCourse).length);
  for (const [c, n] of Object.entries(byCourse)) say('    ' + String(c).padEnd(24) + ' ' + n + ' 行');
}

// ── TASK 6 · Christian Profile ────────────────────────────
say('\n=== TASK 6 · CHRISTIAN PROFILE (growth_state) ===');
const canon = v => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  return v;
};
if (tables.includes('growth_state')) {
  const gs = q('SELECT user_id, state_json, updated_at FROM growth_state');
  say('  行数: ' + gs.length);
  const seen = new Set();
  let dup = 0;
  for (const r of gs) {
    if (seen.has(r.user_id)) dup++;
    seen.add(r.user_id);
    let parsed = null, err = null;
    try { parsed = JSON.parse(r.state_json); } catch (e) { err = String(e.message).slice(0, 40); }
    const raw = crypto.createHash('sha256').update(r.state_json ?? '', 'utf8').digest('hex');
    const sem = parsed ? crypto.createHash('sha256').update(JSON.stringify(canon(parsed)), 'utf8').digest('hex') : null;
    say('    owner=' + String(r.user_id).slice(0, 8) + '… exists=' + ids.has(r.user_id) +
      ' bytes=' + (r.state_json ?? '').length + ' json=' + (err ? 'INVALID(' + err + ')' : 'ok'));
    say('      source_raw_hash         = ' + raw.slice(0, 40) + '…');
    say('      canonical_semantic_hash = ' + (sem ? sem.slice(0, 40) + '…' : 'N/A'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed);
      say('      顶层 key (' + keys.length + '): ' + keys.slice(0, 12).join(', '));
      for (const vk of ['version', 'schemaVersion', 'assessmentVersion', 'scoringVersion', 'profileVersion']) {
        if (vk in parsed) say('      版本标记 ' + vk + ' = ' + JSON.stringify(parsed[vk]));
      }
    }
  }
  say('  重复 user_id: ' + dup);
}

// ── TASK 7 · 哨兵审计 ─────────────────────────────────────
say('\n=== TASK 7 · SENTINEL AUDIT ===');
const SENT = ['system', 'anonymous', 'deleted', 'unknown', 'guest', 'root', 'none', 'null'];
let sentHits = 0;
for (const [t, col] of OWNED) {
  if (!tables.includes(t)) continue;
  const cols = q('PRAGMA table_info("' + t + '")').map(c => c.name);
  if (!cols.includes(col)) continue;
  const rows = q('SELECT "' + col + '" v, COUNT(*) n FROM "' + t + '" WHERE "' + col + '" IS NOT NULL GROUP BY "' + col + '"');
  for (const r of rows) {
    const v = String(r.v).toLowerCase();
    if ((SENT.includes(v) || !UUID.test(String(r.v))) && !ids.has(r.v)) {
      say('  [NON-UUID/SENTINEL] ' + t + '.' + col + " = '" + r.v + "'  " + r.n + ' 行');
      sentHits++;
    }
  }
}
say('  非 uuid / 哨兵值命中总数: ' + sentHits);
if (tables.includes('rooms')) {
  const sys = one("SELECT COUNT(*) n FROM rooms WHERE host_id = 'system'").n;
  const tot = one('SELECT COUNT(*) n FROM rooms').n;
  say('  rooms: 总数=' + tot + " host_id='system'=" + sys + ' （契约预期 5 个内置房间）');
  for (const r of q('SELECT room_id AS id, host_id FROM rooms ORDER BY room_id')) {
    say('    ' + String(r.id).padEnd(20) + ' host=' + r.host_id);
  }
}

// ── TASK 8 · 事务前置条件 ─────────────────────────────────
say('\n=== TASK 8 · TRANSACTION PRECONDITIONS ===');
if (tables.includes('prayer_sessions')) {
  const n = one('SELECT COUNT(*) n FROM prayer_sessions').n;
  say('  prayer_sessions 行数: ' + n);
  if (n > 0) {
    const dupKey = q('SELECT room_id, title, created_by, COUNT(*) n FROM prayer_sessions GROUP BY room_id, title, created_by HAVING n > 1');
    say('  疑似重复（同房间+同标题+同创建者）: ' + dupKey.length + (dupKey.length ? ' -> ' + JSON.stringify(dupKey) : ''));
  }
}
if (tables.includes('prayer_shares')) {
  const idem = one('SELECT COUNT(*) n FROM prayer_shares WHERE client_request_id IS NOT NULL').n;
  const tot = one('SELECT COUNT(*) n FROM prayer_shares').n;
  say('  prayer_shares: 总数=' + tot + ' 带幂等键=' + idem);
}

// ── TASK 9 · legacy_user_map ──────────────────────────────
say('\n=== TASK 9 · LEGACY_USER_MAP ===');
if (tables.includes('legacy_user_map')) {
  const m = q('SELECT * FROM legacy_user_map');
  say('  行数: ' + m.length);
  const byStatus = {};
  for (const r of m) byStatus[r.mapping_status] = (byStatus[r.mapping_status] ?? 0) + 1;
  say('  mapping_status 分布: ' + JSON.stringify(byStatus));
  for (const r of m) {
    say('    ' + String(r.mapping_status).padEnd(22) +
      ' legacy=' + String(r.legacy_user_id).slice(0, 8) + '…' +
      ' sb=' + (r.supabase_user_id ? String(r.supabase_user_id).slice(0, 8) + '…' : 'NULL') +
      '  ' + r.normalized_email);
  }
}

d.close();
