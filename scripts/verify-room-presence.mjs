/**
 * P1-1 真实 Membership + Presence 验收。真 backend + 真 SQLite + 真 HTTP。
 *
 * 覆盖 §13 三用户 × 四房、§14 跨房隔离、§15 moderator 回归。
 *
 * 这里刻意**不经浏览器**：presence 是一条服务端契约，用真实 HTTP 打它才能
 * 精确控制三个用户的进出时序。UI 侧由 verify-rooms-render.mjs 负责。
 *
 * 运行：node scripts/verify-room-presence.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { startFakeSupabase, provisionUser, supabaseEnv, seedSystemRooms} from './helpers/regression-auth.mjs';

const TMP = '.tmp-presence';
const ROOMS = ['bible_reading', 'preaching_room', 'praise_room', 'fellowship_room'];

const checks = [];
const check = (n, ok, d = '') => {
  checks.push({ n, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
};

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer(); s.unref(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

let backend = null;
let sb = null;
const cleanup = () => {
  try { backend?.kill(); } catch { /* 已退出 */ }
  try { sb?.stop(); } catch { /* 已关闭 */ }
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* 尽力而为 */ }
};
process.on('exit', cleanup);

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// AUTH-M7：register 端点已删除，测试身份改由唯一的 Supabase harness provision。
sb = await startFakeSupabase();
// DB-12：房间真相源已是 Postgres，须显式预置 5 个内置房间（复刻 staging 实际行）。
seedSystemRooms(sb);

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const DB_REL = `../${TMP}/presence.sqlite`;

backend = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
  cwd: 'backend', stdio: 'ignore',
  env: { ...process.env, PORT: String(port), APP_SECRET: 'presence-verify',
         JWT_SECRET: 'presence-verify-jwt', DB_PATH: DB_REL,
         ...supabaseEnv(sb) },
});
for (let i = 0; i < 140; i++) {
  try { const r = await fetch(`${base}/api/health`); if (r.status < 500) break; } catch { /* 未就绪 */ }
  await sleep(300);
}

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
// → 真实可验签的 Supabase token。返回形状与旧 register 响应兼容。
const DB_FROM_ROOT = `${TMP}/presence.sqlite`;
const reg = (name, email) => provisionUser(DB_FROM_ROOT, sb, { email, name });

/** 进房：join → heartbeat。与前端 useRoomPresence 的顺序一致。 */
const enter = async (u, room) => {
  const j = await call('POST', `/api/rooms/${room}/join`, {}, u.accessToken);
  const h = await call('POST', `/api/rooms/${room}/presence/heartbeat`, {}, u.accessToken);
  return { join: j.status, beat: h.status };
};
const presenceOf = async (u, room) => {
  const r = await call('GET', `/api/rooms/${room}/presence`, undefined, u.accessToken);
  return r.status === 200 ? r.json : { status: r.status, presence: [], onlineCount: -1 };
};
const clearMy = (u, room) => call('DELETE', `/api/rooms/${room}/presence`, {}, u.accessToken);

const A = await reg('林牧师', 'p1-a@example.com');
const B = await reg('陈传道', 'p1-b@example.com');
const C = await reg('王弟兄', 'p1-c@example.com');

// ── §13 三用户 × 四房 ──
for (const room of ROOMS) {
  console.log(`\n──── ${room} ────`);

  const ea = await enter(A, room);
  check(`${room}: A join+heartbeat 成功`, ea.join === 200 && ea.beat === 200, `join=${ea.join} beat=${ea.beat}`);

  let p = await presenceOf(A, room);
  check(`${room}: A 进入后 presence = A 一人`,
    p.onlineCount === 1 && p.presence[0]?.userId === A.supabaseUserId,
    `count=${p.onlineCount}`);
  check(`${room}: 显示名来自服务器 users.name`, p.presence[0]?.name === '林牧师', p.presence[0]?.name);

  await enter(B, room);
  const pa = await presenceOf(A, room);
  const pb = await presenceOf(B, room);
  check(`${room}: B 进入后两端都看到 2`, pa.onlineCount === 2 && pb.onlineCount === 2,
    `A看到${pa.onlineCount} B看到${pb.onlineCount}`);

  await enter(C, room);
  const [qa, qb, qc] = await Promise.all([presenceOf(A, room), presenceOf(B, room), presenceOf(C, room)]);
  check(`${room}: C 进入后三端都看到 3`,
    qa.onlineCount === 3 && qb.onlineCount === 3 && qc.onlineCount === 3,
    `${qa.onlineCount}/${qb.onlineCount}/${qc.onlineCount}`);

  const names = new Set(qa.presence.map(x => x.name));
  check(`${room}: 三端姓名可信且无幽灵成员`,
    qa.presence.length === 3 && names.has('林牧师') && names.has('陈传道') && names.has('王弟兄'),
    [...names].join(', '));

  // 响应里不得出现任何音频状态字段
  const raw = JSON.stringify(qa);
  check(`${room}: presence 不含 speaker / speaking / mic 等音频字段`,
    !/speaking|isSpeaking|speaker|muted|micOn|raisedHand/i.test(raw));

  // 同账号多设备仍算 1 人：C 再心跳一次（模拟第二台设备）。
  // 用 C 而不是 A —— 心跳限流是**按用户** 10 次/分钟，本脚本把数小时的活动
  // 压进几秒，全压在同一个人身上会撞上限流，那是测试假象不是产品问题。
  await call('POST', `/api/rooms/${room}/presence/heartbeat`, {}, C.accessToken);
  const dup = await presenceOf(A, room);
  check(`${room}: 同账号重复心跳仍算 1 人`, dup.onlineCount === 3, `count=${dup.onlineCount}`);

  // B 显式清 presence
  await clearMy(B, room);
  const [ra, rc] = await Promise.all([presenceOf(A, room), presenceOf(C, room)]);
  check(`${room}: B 退出后 A/C 看到 2`, ra.onlineCount === 2 && rc.onlineCount === 2,
    `${ra.onlineCount}/${rc.onlineCount}`);
  check(`${room}: B 退出后名单里确实没有 B`, !ra.presence.some(x => x.userId === B.supabaseUserId));
}

// ── §14 跨房隔离 ──
console.log('\n──── 跨房隔离 ────');
// 先把所有房间清干净
for (const room of ROOMS) for (const u of [A, B, C]) await clearMy(u, room);

await enter(A, 'bible_reading');
await enter(B, 'praise_room');
const bible = await presenceOf(A, 'bible_reading');
const praise = await presenceOf(B, 'praise_room');
// DB-12：presence 的身份主键已按 Supervisor 裁定 #24 改为 Supabase UUID
// （app_room_presence.user_id -> profiles.id），因此断言比对 supabaseUserId
// 而不是 canonical SQLite id。断言强度未变，变的是身份口径。
check('A 只出现在 bible_reading',
  bible.presence.length === 1 && bible.presence[0].userId === A.supabaseUserId);
check('B 只出现在 praise_room',
  praise.presence.length === 1 && praise.presence[0].userId === B.supabaseUserId);
check('bible_reading 的名单里没有 B', !bible.presence.some(x => x.userId === B.supabaseUserId));
check('praise_room 的名单里没有 A', !praise.presence.some(x => x.userId === A.supabaseUserId));

// 非成员读别人房间 → 403，且不泄漏任何成员
const stranger = await reg('外人', 'p1-outsider@example.com');
const leak = await call('GET', '/api/rooms/bible_reading/presence', undefined, stranger.accessToken);
check('非成员读取 presence → 403', leak.status === 403, `实际 ${leak.status}`);
check('403 响应不泄漏任何成员姓名', !leak.text.includes('林牧师'), leak.text.slice(0, 60));
const noAuth = await call('GET', '/api/rooms/bible_reading/presence');
check('无 token 读取 presence → 401', noAuth.status === 401, `实际 ${noAuth.status}`);

// ── §15 moderator 回归 ──
console.log('\n──── moderator 回归 ────');
const cli = (cmd, room, email) => spawnSync(process.execPath,
  ['node_modules/tsx/dist/cli.mjs', 'scripts/room-moderator.ts', cmd, room, ...(email ? [email] : [])],
  { cwd: 'backend', env: { ...process.env, DB_PATH: DB_REL }, encoding: 'utf8' });

for (const u of [A, B, C]) await clearMy(u, 'preaching_room');
cli('grant', 'preaching_room', 'p1-c@example.com');
await enter(A, 'preaching_room');
const modCheck = await presenceOf(A, 'preaching_room');
check('moderator 不会因授权而自动出现在在线名单',
  !modCheck.presence.some(x => x.userId === C.supabaseUserId),
  `名单：${modCheck.presence.map(x => x.name).join(', ') || '(空)'}`);
check('只有真实进入房间的人才算在线', modCheck.onlineCount === 1);

await enter(C, 'preaching_room');
const afterC = await presenceOf(A, 'preaching_room');
check('moderator 真实进房后正常出现', afterC.onlineCount === 2);
check('moderator 在名单里不带任何 speaker 标记',
  !JSON.stringify(afterC).match(/speaker/i));

// ── §12 空房 / 单人 ──
console.log('\n──── 空房 / 单人 ────');
for (const u of [A, B, C]) await clearMy(u, 'fellowship_room');
const empty = await presenceOf(A, 'fellowship_room');
check('无人时 onlineCount = 0 且名单为空（不补虚构成员）',
  empty.onlineCount === 0 && empty.presence.length === 0, `count=${empty.onlineCount}`);
const soloEnter = await enter(B, 'fellowship_room');
check('单人进房 join/heartbeat 均成功（未被限流）',
  soloEnter.join === 200 && soloEnter.beat === 200, JSON.stringify(soloEnter));
const solo = await presenceOf(B, 'fellowship_room');
check('只有自己时如实显示 1 人（不补 3 个头像）',
  solo.onlineCount === 1 && solo.presence.length === 1,
  `count=${solo.onlineCount} 名单=${JSON.stringify(solo.presence?.map(x => x.name))}`);

cleanup();
console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length ? 1 : 0);
