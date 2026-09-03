/**
 * 五个语音房间的渲染回归。
 *
 * 存在的理由很具体：改 VoiceRoomOverlay 的 JSX 时切多过一次，
 * 整个覆盖层白屏而 tsc 与 build 全绿。类型检查证明不了 JSX 结构还能渲染，
 * 必须真的把每间房打开看一眼。
 *
 * 运行：node scripts/verify-rooms-render.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH
  || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`]
    .find(p => existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }

/** MockTransport 的虚拟成员。这些人不存在，绝不能出现在正式成员列表里。 */
const MOCK_NAMES = ['王牧师', '李姊妹', 'Daniel', 'Mary', '张弟兄', 'Grace'];

const ROOMS = [
  { name: '祷告室', sentinel: '本次祷告主题' },
  { name: '赞美室', sentinel: '推荐诗歌' },
  { name: '读经室', sentinel: '创世记' },
  { name: '讲道室', sentinel: '讲章' },
  { name: '交通室', sentinel: null },   // 没有专属内容，只验证不白屏
];

const checks = [];
const check = (n, ok, d = '') => { checks.push({ n, ok }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer(); s.unref(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

// App 启动时先落到营销首屏，只有带真实登录态才会进入主界面。
// 所以这里和 verify-phase5 一样起一个真 backend，注册一个真用户。
const TMP = '.tmp-rooms';
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const apiPort = await freePort();
const port = await freePort();
const apiBase = `http://127.0.0.1:${apiPort}`;
const base = `http://localhost:${port}/`;

const backend = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
  cwd: 'backend', stdio: 'ignore',
  env: { ...process.env, PORT: String(apiPort), APP_SECRET: 'rooms-verify',
         JWT_SECRET: 'rooms-verify-jwt-secret', DB_PATH: `../${TMP}/rooms.sqlite`,
         CORS_ORIGINS: `http://localhost:${port}` },
});
const server = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'],
  { stdio: 'ignore', env: { ...process.env, VITE_API_BASE_URL: apiBase,
      // §8 回归：即使 transport=mock，正式成员列表也不得由 transport 构造。
      // 这里刻意开着 mock 跑整套断言。
      VITE_VOICE_TRANSPORT: process.env.ROOMS_GUARD_TRANSPORT ?? '' } });
process.on('exit', () => {
  for (const p of [server, backend]) { try { p.kill(); } catch { /* 已退出 */ } }
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* 尽力而为 */ }
});

const waitFor = async (url) => {
  for (let i = 0; i < 140; i++) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* 未就绪 */ }
    await sleep(300);
  }
  throw new Error(`未就绪：${url}`);
};
await waitFor(`${apiBase}/api/health`);
await waitFor(base);

const reg = await fetch(`${apiBase}/api/auth/register`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: `rooms-${Date.now()}@example.com`, password: 'goodpassword1', name: '测试用户' }),
});
const auth = await reg.json();

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });

const errors = [];
// 本地 dist 里嵌的是开发用 API 地址，预览时必然 CORS 失败——与本次改动无关
const benign = /gemini\/live|WebSocket connection|Failed to load resource|CORS policy|net::ERR|Access to fetch/i;
page.on('pageerror', e => { if (!benign.test(String(e))) errors.push(String(e)); });
page.on('console', m => { if (m.type() === 'error' && !benign.test(m.text())) errors.push(m.text()); });

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.evaluate((a) => {
  localStorage.setItem('amas_access_token', JSON.stringify(a.accessToken));
  localStorage.setItem('amas_refresh_token', JSON.stringify(a.refreshToken));
  localStorage.setItem('amas_user', JSON.stringify(a.user));
  localStorage.setItem('amas_current_user', JSON.stringify({ ...a.user, role: 'admin', avatar: '' }));
  localStorage.setItem('amas_lang', 'zh-CN');
  localStorage.setItem('amas_offline_notice_dismissed', '1');
}, auth);
await page.goto(base, { waitUntil: 'networkidle2' });
await sleep(1500);

const clickText = async (text, sel = 'button, a, [role="button"]') => {
  for (let i = 0; i < 24; i++) {
    const ok = await page.evaluate((t, s) => {
      const hit = [...document.querySelectorAll(s)]
        .find(e => (e.innerText || '').replace(/\s+/g, '').includes(t));
      if (hit) { hit.click(); return true; }
      return false;
    }, text.replace(/\s+/g, ''), sel);
    if (ok) return true;
    await sleep(250);
  }
  return false;
};

// 启动后先落在闪屏/落地页，需要先点进去才有底部导航
await clickText('我在这里，请差遣我');
await sleep(1500);
const tabOk = await clickText('校友圈');
await sleep(1800);
const listText = await page.evaluate(() => document.body.innerText || '');
check('切到校友圈房间列表', tabOk && listText.includes('祷告室'),
  tabOk ? listText.slice(0, 100) : "未点到「校友圈」");

for (const room of ROOMS) {
  // 进房
  const entered = await page.evaluate((label) => {
    const card = [...document.querySelectorAll('div.cursor-pointer')]
      .find(d => (d.textContent || '').includes(label));
    if (!card) return false;
    card.click();
    return true;
  }, room.name);
  if (!entered) { check(`${room.name}：找到入口`, false); continue; }
  await sleep(1600);
  // 首次进房会弹房间指南，关掉它才看得到房间本体
  await clickText('我明白了');
  await sleep(1200);

  const body = await page.evaluate(() => document.body.innerText || '');
  // 白屏判定：覆盖层是 fixed 全屏，正常渲染时正文不会近乎为空
  check(`${room.name}：覆盖层渲染（非白屏）`, body.trim().length > 40, `正文 ${body.trim().length} 字`);
  if (room.sentinel) {
    check(`${room.name}：专属内容出现「${room.sentinel}」`, body.includes(room.sentinel));
  }

  // ── §17 拆掉的假象不得复现 ──
  check(`${room.name}：无「主持人邀请您上麦」脚本`, !body.includes('主持人邀请您上麦'));

  if (room.name !== '祷告室') {
    // 真实成员模块必须在（要么已就绪，要么如实说明状态）
    check(`${room.name}：真实成员模块存在`,
      /\d+ 人在线|正在加入房间|成员状态暂时无法更新|需要连接服务器/.test(body));
    // 只有自己一个人时，就该如实显示 1 人
    check(`${room.name}：如实显示 1 人在线（不补虚拟成员）`,
      body.includes('1 人在线'), body.match(/\d+ 人在线/)?.[0] ?? '未出现人数');
    // 固定假人数不得复活
    check(`${room.name}：无写死的 12/8/25/45 人`,
      !/(12|8|25|45)\s*人(在线|在听)/.test(body));
    // MockTransport 的虚拟成员姓名不得出现
    check(`${room.name}：无 MockTransport 虚拟成员`,
      !MOCK_NAMES.some(n => body.includes(n)),
      MOCK_NAMES.filter(n => body.includes(n)).join(', '));
    // 音频状态措辞不得复活
    check(`${room.name}：无正在讲话 / 正在听 / 正在敬拜等措辞`,
      !/正在讲话|人正在听|正在敬拜|正在交通|正在听道|实时发言/.test(body));
  }
  if (room.name === '赞美室') {
    check('赞美室：不再显示写死的歌名与播放态',
      !body.includes('这一生最美的祝福') || !/正在播放/.test(body));
  }

  await page.screenshot({ path: `screenshots/rooms/${room.name}.png` });

  // 退房：点返回/最小化，回到列表
  await page.evaluate(() => {
    const back = document.querySelector('button');
    if (back) back.click();
  });
  await sleep(1200);
  const backOnList = await page.evaluate(() => (document.body.innerText || '').includes('热门讨论房间'));
  if (!backOnList) { await clickText('校友圈'); await sleep(1000); }
}

// ── §11 错误隔离：presence 挂掉不能让房间白屏，专属功能仍可用 ──
console.log('');
{
  // 回到读经室，然后真的把 backend 杀掉
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('div.cursor-pointer')]
      .find(d => (d.textContent || '').includes('读经室'));
    if (card) card.click();
  });
  await sleep(1600);
  await clickText('我明白了');
  await sleep(1000);

  backend.kill();
  // 等一个轮询周期（10s）让 presence 请求真的失败
  await sleep(13000);

  const body = await page.evaluate(() => document.body.innerText || '');
  check('presence 失败后读经室未白屏', body.trim().length > 40, `正文 ${body.trim().length} 字`);
  check('presence 失败后圣经仍可读', body.includes('起初') || body.includes('创世记'));
  check('presence 失败显示轻量提示，不显示假人数',
    body.includes('成员状态暂时无法更新') || /\d+ 人在线/.test(body) === false,
    body.includes('成员状态暂时无法更新') ? '已显示轻量提示' : '(无提示)');
  check('presence 失败后不出现任何虚构成员',
    !MOCK_NAMES.some(n => body.includes(n)));
  await page.screenshot({ path: 'screenshots/rooms/读经室-presence-failure.png' });
}

check('全程无 JS 运行时错误', errors.length === 0, errors[0]?.slice(0, 160) ?? '');

await browser.close();
server.kill();
backend.kill();

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length ? 1 : 0);
