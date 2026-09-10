/**
 * P1-2 读经室共享阅读位置验收。真 backend + 真 SQLite + 真 HTTP + 真 JWT。
 *
 * 覆盖 §17 Case 1–12。
 *
 * 运行：node scripts/verify-room-reading-position.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { startFakeSupabase, provisionUser, supabaseEnv, seedSystemRooms, runBackendCli} from './helpers/regression-auth.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

const TMP = '.tmp-reading';
const ROOM = 'bible_reading';
const DB_REL = `../${TMP}/reading.sqlite`;
const DB_FROM_ROOT = `${TMP}/reading.sqlite`;

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
let port = 0;
let base = '';
const cleanup = () => {
  try { backend?.kill(); } catch { /* 已退出 */ }
  try { sb?.stop(); } catch { /* 已关闭 */ }
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* 尽力而为 */ }
};
process.on('exit', cleanup);

async function startBackend() {
  // AUTH-M7：测试身份由唯一的 Supabase harness 提供（register 端点已删除）
  if (!sb) sb = await startFakeSupabase();
  // DB-12：房间真相源已是 Postgres，须显式预置 5 个内置房间（复刻 staging 实际行）。
  seedSystemRooms(sb);
  backend = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
    cwd: 'backend', stdio: 'ignore',
    env: { ...process.env, PORT: String(port), APP_SECRET: 'reading-verify',
           JWT_SECRET: 'reading-verify-jwt', DB_PATH: DB_REL,
           ...supabaseEnv(sb) },
  });
  for (let i = 0; i < 140; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.status < 500) return; } catch { /* 未就绪 */ }
    await sleep(300);
  }
  throw new Error('backend 未就绪');
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

// AUTH-M7：register 端点已删除，改由唯一的 Supabase harness provision。
const reg = (name, email) => provisionUser(DB_FROM_ROOT, sb, { email, name });
const join = (u, room) => call('POST', `/api/rooms/${room}/join`, {}, u.accessToken);
const get = (u, room = ROOM) => call('GET', `/api/rooms/${room}/reading-position`, undefined, u.accessToken);
const put = (u, body, room = ROOM) =>
  call('PUT', `/api/rooms/${room}/reading-position`, body, u.accessToken);
// DB-12：必须异步。假 Supabase 跑在本进程里，spawnSync 会阻塞事件循环，
// 导致子进程打不通假 Supabase（表现为 fetch failed / ECONNABORTED）。
const cli = (cmd, room, email) => runBackendCli(
  ['scripts/room-moderator.ts', cmd, room, ...(email ? [email] : [])],
  { ...process.env, DB_PATH: DB_REL, ...supabaseEnv(sb) });

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
port = await freePort();
base = `http://127.0.0.1:${port}`;
await startBackend();

const M = await reg('林牧师', 'r-m@example.com');
const M2 = await reg('陈传道', 'r-m2@example.com');
const A = await reg('王弟兄', 'r-a@example.com');
const B = await reg('李姊妹', 'r-b@example.com');
const X = await reg('外人', 'r-x@example.com');

for (const u of [M, M2, A, B]) await join(u, ROOM);
await cli('grant', ROOM, 'r-m@example.com');
await cli('grant', ROOM, 'r-m2@example.com');

// ── Case 1：没有共享位置 → null ──
console.log('\n──── Case 1  初始无共享位置 ────');
const c1 = await get(A);
check('GET 返回 200', c1.status === 200);
check('position 为 null（不伪造成创世记 1:1）', c1.json?.position === null, JSON.stringify(c1.json?.position));
check('普通成员 canPublish = false', c1.json?.capabilities?.canPublish === false);
const c1m = await get(M);
check('moderator canPublish = true', c1m.json?.capabilities?.canPublish === true);

// ── Case 2：M 设置 约翰福音 3:16 ──
console.log('\n──── Case 2  moderator 发布位置 ────');
const c2 = await put(M, { book: '约翰福音', chapter: 3, verse: 16 });
check('M PUT 成功', c2.status === 200, `实际 ${c2.status} ${c2.text.slice(0, 80)}`);
const [gm, ga, gb] = await Promise.all([get(M), get(A), get(B)]);
const same = [gm, ga, gb].every(g =>
  g.json?.position?.book === '约翰福音' && g.json?.position?.chapter === 3 && g.json?.position?.verse === 16);
check('M / A / B 读到相同 canonical location', same,
  [gm, ga, gb].map(g => `${g.json?.position?.book} ${g.json?.position?.chapter}:${g.json?.position?.verse}`).join(' | '));
check('响应只含位置，不含经文正文',
  !/起初|神爱世人|content|verses/.test(ga.text), ga.text.slice(0, 90));

// ── Case 3：普通成员 PUT → 403，数据库不变 ──
console.log('\n──── Case 3  普通成员禁写 ────');
const c3 = await put(A, { book: '创世记', chapter: 1 });
check('A PUT → 403', c3.status === 403, `实际 ${c3.status}`);
const afterA = await get(M);
check('数据库未被改变', afterA.json?.position?.book === '约翰福音' && afterA.json?.position?.chapter === 3);

// ── Case 4：非成员 GET → 403 且不泄漏 ──
console.log('\n──── Case 4  非成员 ────');
const c4 = await get(X);
check('X GET → 403', c4.status === 403, `实际 ${c4.status}`);
check('403 不泄漏当前读到哪里', !c4.text.includes('约翰福音'), c4.text.slice(0, 60));
const c4p = await put(X, { book: '创世记', chapter: 1 });
check('X PUT → 403', c4p.status === 403, `实际 ${c4p.status}`);

// ── Case 5：无 JWT → 401 ──
console.log('\n──── Case 5  无 JWT ────');
check('GET 无 token → 401', (await call('GET', `/api/rooms/${ROOM}/reading-position`)).status === 401);
check('PUT 无 token → 401',
  (await call('PUT', `/api/rooms/${ROOM}/reading-position`, { book: '创世记', chapter: 1 })).status === 401);

// ── Case 6：非法输入 → 400，数据库不污染 ──
console.log('\n──── Case 6  非法经文位置 ────');
const bad = [
  ['book 乱写', { book: 'hahaha', chapter: 1 }],
  ['chapter 越界', { book: '创世记', chapter: 9999 }],
  ['chapter 为 0', { book: '创世记', chapter: 0 }],
  ['chapter 非整数', { book: '创世记', chapter: 1.5 }],
  ['chapter 为字符串', { book: '创世记', chapter: '1' }],
  ['verse 为负', { book: '创世记', chapter: 1, verse: -3 }],
  ['verse 越界', { book: '诗篇', chapter: 23, verse: 999 }],
  ['book 非字符串', { book: 43, chapter: 1 }],
];
let allBad = true;
for (const [label, body] of bad) {
  const r = await put(M, body);
  if (r.status !== 400) { allBad = false; console.log(`     ${label} 实际 ${r.status}`); }
}
check('八种非法输入全部 400', allBad);
const afterBad = await get(M);
check('非法输入后数据库未污染',
  afterBad.json?.position?.book === '约翰福音' && afterBad.json?.position?.chapter === 3);

// ── Case 7：M 改到 罗马书 8:1 ──
console.log('\n──── Case 7  moderator 更新位置 ────');
const rev7 = afterBad.json.position.revision;
const c7 = await put(M, { book: '罗马书', chapter: 8, verse: 1, expectedRevision: rev7 });
check('M 更新成功', c7.status === 200, `实际 ${c7.status}`);
const [a7, b7] = await Promise.all([get(A), get(B)]);
check('A/B 下一轮同步取到 罗马书 8:1',
  a7.json?.position?.book === '罗马书' && b7.json?.position?.chapter === 8);
check('revision 单调递增', c7.json?.position?.revision === rev7 + 1,
  `${rev7} → ${c7.json?.position?.revision}`);

// ── Case 8：A 本地浏览不影响服务器 ──
console.log('\n──── Case 8  本地浏览隔离 ────');
// A 在客户端翻到创世记 1 —— 前端不会调任何写接口。这里用「A 无法写」来证明：
// 即使有人伪造请求，服务器也拒绝，因此本地浏览绝无可能改变共享状态。
const c8 = await put(A, { book: '创世记', chapter: 1 });
check('A 本地浏览无法写入共享状态（403）', c8.status === 403);
const b8 = await get(B);
check('B 仍看到 罗马书 8:1',
  b8.json?.position?.book === '罗马书' && b8.json?.position?.chapter === 8 && b8.json?.position?.verse === 1);
// 精确取 handleSelectScripture 的函数体，断言它自己不发布。
// （上一版用「函数名后 1200 字符内出现 publish」的粗糙正则，会把紧随其后的
//   publishReading 定义误判成翻章时发布——那是误报，不是缺陷。）
const src = await import('node:fs').then(fs =>
  fs.readFileSync('components/VoiceRoom/VoiceRoomOverlay.tsx', 'utf8'));
const fnStart = src.indexOf('const handleSelectScripture = async');
const fnEnd = src.indexOf(String.fromCharCode(10) + '    };', fnStart);
const fnBody = fnStart >= 0 && fnEnd > fnStart ? src.slice(fnStart, fnEnd) : '';
check('handleSelectScripture 函数体内没有任何发布调用',
  fnBody.length > 200 && !/publish|reading-position|PUT/i.test(fnBody),
  fnBody.length > 200 ? `已取到函数体 ${fnBody.length} 字符` : '未能定位函数体');
check('发布只在显式的 publishReading 中发生',
  /const publishReading = async[\s\S]{0,400}reading\.publish/.test(src));

// ── Case 9：暂停跟随（客户端语义，此处验证服务端不受影响）──
console.log('\n──── Case 9  暂停跟随 ────');
const rev9 = (await get(M)).json.position.revision;
await put(M, { book: '诗篇', chapter: 23, expectedRevision: rev9 });
const a9 = await get(A);
check('房间位置已变为 诗篇 23', a9.json?.position?.book === '诗篇' && a9.json?.position?.chapter === 23);
const hookSrc = await import('node:fs').then(fs =>
  fs.readFileSync('components/VoiceRoom/useSharedReading.ts', 'utf8'));
// following 只能是客户端状态。唯一构造请求体的地方是 roomReadingService，
// 断言那里根本不认识这个字段，比在 hook 里做模糊匹配可靠。
const svcSrc = await import('node:fs').then(fs =>
  fs.readFileSync('services/roomReadingService.ts', 'utf8'));
check('following 从不进入任何请求体',
  !/following/i.test(svcSrc) && !/JSON\.stringify\([^)]*following/i.test(hookSrc));
check('服务层只发送 book / chapter / verse / expectedRevision',
  svcSrc.includes('book, chapter,') && svcSrc.includes('expectedRevision'));
check('暂停跟随时不触发跳转（onFollow 受 followingRef 守卫）',
  /followingRef\.current\s*&&/.test(hookSrc));
const barSrc = await import('node:fs').then(fs =>
  fs.readFileSync('components/VoiceRoom/SharedReadingBar.tsx', 'utf8'));
check('UI 提供「回到房间进度」并同时显示房间当前位置',
  barSrc.includes('回到房间进度') && barSrc.includes('房间当前'));

// ── Case 10：两个 moderator 并发 ──
console.log('\n──── Case 10  并发更新 ────');
const cur = (await get(M)).json.position.revision;
const [r1, r2] = await Promise.all([
  put(M, { book: '马太福音', chapter: 5, expectedRevision: cur }),
  put(M2, { book: '路加福音', chapter: 15, expectedRevision: cur }),
]);
const oks = [r1, r2].filter(r => r.status === 200);
const conflicts = [r1, r2].filter(r => r.status === 409);
check('并发写：恰好一个 200、一个 409（不静默丢更新）',
  oks.length === 1 && conflicts.length === 1, `${r1.status} / ${r2.status}`);
check('409 带回最新状态供客户端刷新', Boolean(conflicts[0]?.json?.position));
const after10 = await get(M);
check('最终位置等于成功那一方', after10.json?.position?.book === oks[0].json?.position?.book,
  `${after10.json?.position?.book} ${after10.json?.position?.chapter}`);
check('revision 只 +1（不是两次都写进去）', after10.json?.position?.revision === cur + 1,
  `${cur} → ${after10.json?.position?.revision}`);
// 用过期 revision 再写一次
const stale = await put(M2, { book: '腓立比书', chapter: 4, expectedRevision: cur });
check('过期 revision 再写 → 409', stale.status === 409, `实际 ${stale.status}`);

// ── Case 11：backend 重启后仍存在 ──
console.log('\n──── Case 11  重启持久化 ────');
const before = (await get(M)).json.position;
backend.kill();
await sleep(1500);
await startBackend();
const after = await get(M);
check('重启后共享位置仍存在（不是内存状态）',
  after.json?.position?.book === before.book
  && after.json?.position?.chapter === before.chapter
  && after.json?.position?.revision === before.revision,
  `${after.json?.position?.book} ${after.json?.position?.chapter} rev=${after.json?.position?.revision}`);

// ── Case 12：跨房隔离 ──
console.log('\n──── Case 12  跨房隔离 ────');
for (const room of ['praise_room', 'prayer_room', 'preaching_room', 'fellowship_room']) {
  await join(M, room);
  const g = await call('GET', `/api/rooms/${room}/reading-position`, undefined, M.accessToken);
  const p = await call('PUT', `/api/rooms/${room}/reading-position`,
    { book: '创世记', chapter: 1 }, M.accessToken);
  const ok = g.status === 404 && p.status === 404;
  check(`${room}: GET/PUT 均 404（不静默映射到读经室）`, ok, `GET ${g.status} / PUT ${p.status}`);
  if (!g.text.includes('reading')) check(`${room}: 404 不泄漏读经室状态`, true);
  else check(`${room}: 404 不泄漏读经室状态`, !g.text.includes('马太福音') && !g.text.includes('路加福音'));
}
const stillThere = await get(M);
check('跨房尝试后读经室状态未被改动',
  stillThere.json?.position?.book === before.book);

// ── §13 不污染 presence ──
console.log('\n──── 不污染 Presence ────');
await call('POST', `/api/rooms/${ROOM}/presence/heartbeat`, {}, M.accessToken);
const pres = await call('GET', `/api/rooms/${ROOM}/presence`, undefined, M.accessToken);
check('presence 响应不含任何阅读位置字段',
  !/currentBook|currentChapter|currentVerse|isFollowing|"reading"|book|chapter/i.test(pres.text),
  pres.text.slice(0, 100));

cleanup();
console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length ? 1 : 0);
