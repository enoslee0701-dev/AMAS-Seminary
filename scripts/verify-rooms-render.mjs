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
  { stdio: 'ignore', env: { ...process.env, VITE_API_BASE_URL: apiBase, VITE_VOICE_TRANSPORT: '' } });
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

  // 拆掉的假象不得复现
  check(`${room.name}：无「主持人邀请您上麦」脚本`, !body.includes('主持人邀请您上麦'));
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

check('全程无 JS 运行时错误', errors.length === 0, errors[0]?.slice(0, 160) ?? '');

await browser.close();
server.kill();
backend.kill();

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length ? 1 : 0);
