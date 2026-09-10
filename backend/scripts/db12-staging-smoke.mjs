/**
 * DB-12 · 对**真实** staging 的冒烟验证。
 *
 * 用法：node scripts/db12-staging-smoke.mjs
 * 读 backend/.env 的 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。
 *
 * 它刻意独立于后端进程，直接打 PostgREST —— 这样验的是「凭据 + 表 + 权限」
 * 这条链本身是否通，不会被后端的任何缓存或本地状态掩盖。
 *
 * 写入策略：只创建一行带明确标记的测试投稿，验证后**只删自己创建的那一行**。
 * 绝不触碰任何历史迁移行。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(BACKEND_ROOT, '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);

const URL_ = (env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_ || !KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const H = extra => ({
  apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra,
});

async function rest(p, init = {}) {
  const r = await fetch(`${URL_}/rest/v1${p}`, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

// ── COURSE FILES ────────────────────────────────────────────────────────
const files = await (await rest('/app_course_files?select=id,course_code,stored_name,filename,size_bytes',
  { headers: H() })).json();
check('course files：元数据条数 = 68', files.length === 68, `实际 ${files.length}`);

const codes = new Set(files.map(f => f.course_code));
const catalog = await (await rest('/course_catalog?select=code', { headers: H() })).json();
const known = new Set(catalog.map(c => c.code));
const orphan = [...codes].filter(c => !known.has(c));
check('course files：course_code 全部能在 course_catalog 解析', orphan.length === 0,
  orphan.length ? `孤儿 ${orphan.join(',')}` : `${codes.size} 门课`);

const DIR = path.join(BACKEND_ROOT, 'uploads', 'course-files');
const missing = files.filter(f => !fs.existsSync(path.join(DIR, f.stored_name)));
check('course files：引用的本地文件全部存在', missing.length === 0,
  missing.length ? `缺失 ${missing.length}` : `${files.length}/${files.length}`);

const sample = files.find(f => fs.existsSync(path.join(DIR, f.stored_name)));
if (sample) {
  const st = fs.statSync(path.join(DIR, sample.stored_name));
  check('course files：抽样文件可读且大小与元数据一致',
    st.size === Number(sample.size_bytes),
    `${sample.filename} disk=${st.size} meta=${sample.size_bytes}`);
} else {
  check('course files：抽样文件可读', false, '没有可用样本');
}

// ── COOPERATION ─────────────────────────────────────────────────────────
const before = await (await rest('/app_cooperation_submissions?select=id,name,email,type',
  { headers: H() })).json();
check('cooperation：历史迁移行可读', before.length >= 1, `现有 ${before.length} 行`);
const historicalIds = new Set(before.map(r => r.id));

const testId = crypto.randomUUID();
const MARK = 'DB-12 STAGING SMOKE — safe to delete';
let created = false;
try {
  await rest('/app_cooperation_submissions', {
    method: 'POST',
    headers: H({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      id: testId, name: 'DB-12 Smoke', email: 'db12-smoke@example.invalid',
      organization: 'DB-12', message: MARK, type: 'smoke',
      received_at: new Date().toISOString(),
    }),
  });
  created = true;
} catch (e) {
  check('cooperation：可写入新投稿', false, e.message);
}
if (created) {
  const after = await (await rest(
    `/app_cooperation_submissions?select=id,message&id=eq.${testId}`, { headers: H() })).json();
  check('cooperation：新投稿已持久化', after.length === 1 && after[0].message === MARK);

  // 只删自己创建的那一行
  await rest(`/app_cooperation_submissions?id=eq.${testId}`, { method: 'DELETE', headers: H() });
  const gone = await (await rest(
    `/app_cooperation_submissions?select=id&id=eq.${testId}`, { headers: H() })).json();
  check('cooperation：测试行已清理', gone.length === 0);
}

const final = await (await rest('/app_cooperation_submissions?select=id', { headers: H() })).json();
const survived = final.filter(r => historicalIds.has(r.id)).length;
check('cooperation：历史迁移行未被改动', survived === historicalIds.size && final.length === before.length,
  `历史 ${survived}/${historicalIds.size}，总数 ${final.length}`);

// ── ROOMS（读路径事实核对；本轮未切换，见报告）─────────────────────────
const rooms = await (await rest('/app_rooms?select=id,host_type,host_user_id&order=id',
  { headers: H() })).json();
check('rooms：staging 有且仅有 5 个房间', rooms.length === 5, `实际 ${rooms.length}`);
check('rooms：全部 host_type=system 且无假房主',
  rooms.every(r => r.host_type === 'system' && r.host_user_id === null),
  rooms.map(r => r.id).join(','));

const pass = results.filter(Boolean).length;
console.log(`\n=== DB-12 STAGING SMOKE: ${pass}/${results.length} PASSED ===`);
process.exitCode = pass === results.length ? 0 : 1;
