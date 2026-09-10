/**
 * 内置公共房间的 moderator 权限闭环验证。真 backend + 真 SQLite + 真 HTTP。
 *
 * 授权走的是**生产上真正会用的那条路**：服务器端 CLI
 * `backend/scripts/room-moderator.ts`。不走任何测试专用后门——
 * 客户端本来就没有提升 moderator 的接口，测试也不该给自己开一个。
 *
 * 验证矩阵：
 *   Moderator A 创建 session          → 成功
 *   Moderator B 编辑 / 主持            → 成功（moderator 之间平权）
 *   Member C 创建                      → 403
 *   revoke A 之后 A 再发 manager 命令   → 403
 *   全程 rooms.host_id 恒为 'system'
 *   grant / revoke 对五个内置房间都可用
 *
 * 运行：node scripts/verify-system-room-moderator.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { startFakeSupabase, provisionUser, supabaseEnv, seedSystemRooms, runBackendCli} from './helpers/regression-auth.mjs';

const TMP = '.tmp-sysroom';
const SYSTEM_ROOMS = ['prayer_room', 'praise_room', 'bible_reading', 'preaching_room', 'fellowship_room'];

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.unref(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

let backend = null;
let sb = null;
const cleanup = () => {
  try { backend?.kill(); } catch { /* already gone */ }
  try { sb?.stop(); } catch { /* already closed */ }
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);

// backend/ 内的相对路径（脚本以 backend/ 为 cwd 运行）
const DB_REL = `../${TMP}/sysroom.sqlite`;
const DB_FROM_ROOT = `${TMP}/sysroom.sqlite`;

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// AUTH-M7：register 端点已删除，测试身份由唯一的 Supabase harness provision。
sb = await startFakeSupabase();
// DB-12：房间真相源已是 Postgres，须显式预置 5 个内置房间（复刻 staging 实际行）。
seedSystemRooms(sb);

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const serverEnv = {
  ...supabaseEnv(sb),
  ...process.env,
  PORT: String(port),
  APP_SECRET: 'sysroom-verify',
  JWT_SECRET: 'sysroom-jwt-secret-value',
  DB_PATH: DB_REL,
};

// ---- 启动 backend，同时抓启动日志用于诊断断言 ----
let startupLog = '';
backend = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
  cwd: 'backend', env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'],
});
backend.stdout.on('data', d => { startupLog += d.toString(); });
backend.stderr.on('data', d => { startupLog += d.toString(); });

for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`${base}/api/health`); if (r.status < 500) break; } catch { /* not up */ }
  await sleep(300);
}

// §1c 启动诊断：五个房间此刻一个 moderator 都没有，必须报出来
check('启动诊断报出 SYSTEM_ROOM_HAS_NO_MODERATOR',
  SYSTEM_ROOMS.every(r => startupLog.includes(`SYSTEM_ROOM_HAS_NO_MODERATOR room=${r}`)),
  startupLog.match(/SYSTEM_ROOM_HAS_NO_MODERATOR[^\n]*/)?.[0] ?? '未出现');
check('诊断不会让服务启动失败', backend.exitCode === null);
check('诊断没有自动指派任何人',
  !/已成为.*moderator|auto-?grant|automatically/i.test(startupLog));

const call = async (method, path, body, token) => {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text };
};

// fake Supabase identity → canonical users 行 → legacy_user_map(provisioned)
// → 真实可验签 token。moderator 授权仍只走服务器端 CLI，不开任何后门。
const reg = (name, email) => provisionUser(DB_FROM_ROOT, sb, { email, name });

/** 调用真实的 CLI 脚本，不走任何后门。 */
// DB-12：必须异步 —— 假 Supabase 在本进程内，spawnSync 会自锁（见 helper 注释）。
const moderatorCli = (cmd, roomId, email) => runBackendCli(
  ['scripts/room-moderator.ts', cmd, roomId, ...(email ? [email] : [])],
  { ...process.env, DB_PATH: DB_REL, ...supabaseEnv(sb) });

const hostIdOf = async (roomId) => {
  // DB-12：房间真相源是 Postgres（app_rooms），SQLite 的 rooms 已不再被写入。
  // system 房间对外的 host 口径仍是字面量 'system'。
  const row = sb.tableRows('app_rooms').find(r => r.id === roomId);
  if (!row) return undefined;
  return row.host_type === 'system' ? 'system' : row.host_user_id;
};

const A = await reg('林牧师', 'mod-a@example.com');
const B = await reg('陈传道', 'mod-b@example.com');
const C = await reg('王弟兄', 'member-c@example.com');

const ROOM = 'prayer_room';
check('起始 host_id 为 system', (await hostIdOf(ROOM)) === 'system');

// ---- §1 grant / revoke 覆盖全部五个内置房间 ----
console.log('\n-- grant/revoke 覆盖五个内置房间 --');
let allGrant = true, allRevoke = true, hostChanged = false;
for (const room of SYSTEM_ROOMS) {
  const g = await moderatorCli('grant', room, 'mod-a@example.com');
  if (g.code !== 0 || !g.out.includes('已成为')) allGrant = false;
  if ((await hostIdOf(room)) !== 'system') hostChanged = true;
  const v = await moderatorCli('revoke', room, 'mod-a@example.com');
  if (v.code !== 0 || !v.out.includes('已撤销')) allRevoke = false;
  if ((await hostIdOf(room)) !== 'system') hostChanged = true;
}
check('grant 对五个内置房间全部成功', allGrant);
check('revoke 对五个内置房间全部成功', allRevoke);
check('grant/revoke 从不修改 rooms.host_id', !hostChanged);
check('脚本不 hardcode 任何 email / userId', (() => {
  const src = readFileSync('backend/scripts/room-moderator.ts', 'utf8');
  return !/@[a-z0-9-]+\.(com|org|net)/i.test(src) && !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(src);
})());
check('不存在客户端提升 moderator 的接口', (() => {
  const files = ['backend/src/routes/rooms.ts', 'backend/src/routes/prayer.ts',
    'backend/src/routes/prayerSession.ts', 'backend/src/routes/prayerHistory.ts'];
  return files.every(f => !/setRoomRole|role\s*=\s*['"]moderator/.test(readFileSync(f, 'utf8')));
})());

// ---- §2 权限闭环 ----
console.log('\n-- 权限闭环 --');
// C 只是普通成员
const jc = await call('POST', `/api/rooms/${ROOM}/join`, {}, C.accessToken);
check('Member C 加入房间', jc.status === 200, jc.text.slice(0, 80));

// C 在被授权之前就先试一次创建
const cCreate = await call('POST', `/api/rooms/${ROOM}/prayer-sessions`,
  { title: 'C 不该建得起来', items: [{ title: '祷告' }] }, C.accessToken);
check('Member C 创建 session → 403', cCreate.status === 403, `实际 ${cCreate.status}`);

// 授予 A 与 B
await moderatorCli('grant', ROOM, 'mod-a@example.com');
await moderatorCli('grant', ROOM, 'mod-b@example.com');
const listed = await moderatorCli('list', ROOM);
check('list 显示两位 moderator', (listed.out.match(/\[M\]/g) ?? []).length === 2, listed.out.trim().split('\n').slice(-4).join(' / '));

// A 创建
const aCreate = await call('POST', `/api/rooms/${ROOM}/prayer-sessions`,
  { title: 'A 建的祷告会', items: [{ title: '为教会' }, { title: '为宣教' }] }, A.accessToken);
check('Moderator A 创建 session → 成功', aCreate.status === 200 || aCreate.status === 201,
  `实际 ${aCreate.status} ${aCreate.text.slice(0, 80)}`);
let sess = aCreate.json?.session;

// B 编辑（moderator 之间平权，不需要 A 授权）
const bEdit = await call('PUT', `/api/rooms/${ROOM}/prayer-sessions/${sess.id}`,
  { title: 'B 改过的标题', items: [{ title: '为教会' }, { title: '为宣教' }, { title: '为软弱的肢体' }],
    expectedRevision: sess.revision }, B.accessToken);
check('Moderator B 编辑 session → 200', bEdit.status === 200, `实际 ${bEdit.status} ${bEdit.text.slice(0, 80)}`);
sess = bEdit.json?.session ?? sess;

// B 主持
const bStart = await call('POST', `/api/rooms/${ROOM}/prayer-sessions/${sess.id}/start`,
  { expectedRevision: sess.revision }, B.accessToken);
check('Moderator B 开始祷告会 → 200', bStart.status === 200, `实际 ${bStart.status}`);
sess = bStart.json?.session ?? sess;

const bAdvance = await call('POST', `/api/rooms/${ROOM}/prayer-sessions/${sess.id}/advance`,
  { expectedRevision: sess.revision }, B.accessToken);
check('Moderator B 推进祷告事项 → 200', bAdvance.status === 200, `实际 ${bAdvance.status}`);
sess = bAdvance.json?.session ?? sess;

// C 仍然只能看，不能主持
const cAdvance = await call('POST', `/api/rooms/${ROOM}/prayer-sessions/${sess.id}/advance`,
  { expectedRevision: sess.revision }, C.accessToken);
check('Member C 推进祷告事项 → 403', cAdvance.status === 403, `实际 ${cAdvance.status}`);
const cRead = await call('GET', `/api/rooms/${ROOM}/prayer-session/current`, undefined, C.accessToken);
check('Member C 仍可读取祷告会状态 → 200', cRead.status === 200);
check('Member C 的 canManageSession 为 false',
  cRead.json?.capabilities?.canManageSession === false);

// ---- §2 撤销后立即失效 ----
console.log('\n-- 撤销 A 之后 --');
const rv = await moderatorCli('revoke', ROOM, 'mod-a@example.com');
check('revoke A 成功', rv.code === 0 && rv.out.includes('已撤销'));

const aAfter = await call('POST', `/api/rooms/${ROOM}/prayer-sessions/${sess.id}/advance`,
  { expectedRevision: sess.revision }, A.accessToken);
check('撤销后 A 的 manager 命令 → 403', aAfter.status === 403, `实际 ${aAfter.status}`);
check('撤销不需要 A 重新登录（授权每次现查，不看旧 token）',
  aAfter.status === 403 && aAfter.text.includes('manager'));

const aStillReads = await call('GET', `/api/rooms/${ROOM}/prayer-session/current`, undefined, A.accessToken);
check('撤销后 A 仍是成员，可以继续参加 → 200', aStillReads.status === 200);
check('撤销后 A 的 canManageSession 变为 false',
  aStillReads.json?.capabilities?.canManageSession === false);

// B 未被撤销，仍然可以主持
const bStillManages = await call('POST', `/api/rooms/${ROOM}/prayer-sessions/${sess.id}/advance`,
  { expectedRevision: sess.revision }, B.accessToken);
check('撤销 A 不影响 B → 200', bStillManages.status === 200, `实际 ${bStillManages.status}`);

check('全程 host_id 恒为 system', (await hostIdOf(ROOM)) === 'system');

cleanup();
console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length === 0 ? 0 : 1);
