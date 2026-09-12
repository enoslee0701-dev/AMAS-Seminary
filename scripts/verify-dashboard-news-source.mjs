/**
 * 首页「最新公告」三条预览的**来源**验证 —— 真浏览器实测。
 *
 * ## 缺陷
 *
 * 公告页在第 25 轮已经有了来源横幅：拿不到真公告时明说「这不是刚取到的」。
 * 首页那三条预览**没有**。它和公告页读的是同一份 `newsItems`：
 *
 *   App 启动    newsItems = localStorage['amas_news'] ?? MOCK_NEWS
 *   拉取失败    newsStatus = { source: 'local', reason }  —— 只有公告页看得到
 *   首页        newsItems.slice(0, 3) 直接渲染，一个字都不说
 *
 * 于是未配数据面（实测 503）时，首页把源码里写死的三条示例公告
 * 当成学院公告摆在首屏。公告的意义就是「学院发的、大家都看得到的」，
 * 读的人没有任何办法分辨。
 *
 * 更隐蔽的一处：`useEffect` 无条件把 newsItems 写回 localStorage，
 * 于是**示例公告被写进了缓存**。下次启动它看起来就像「上次取到的」，
 * 来源从此不可考。
 *
 * ## 这个脚本验什么
 *
 * 起一个**隔离 fixture 桩**（不是本项目后端，不连任何真实数据面），
 * 按需答 503 / 200 空数组 / 200 真公告，然后用真浏览器看首页说什么。
 *
 * ⚠ 边界：桩只能证明「前端拿到某个状态码之后说什么」。
 *   「真实后端在什么情况下回哪个码」不在本脚本射程内，不得据此宣称
 *   公告业务已联调。
 *
 * 跑法：node scripts/verify-dashboard-news-source.mjs
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Chrome 定位：跨平台候选 + CHROME_PATH 兜底（与 tests/e2e/smoke.mjs 同一套写法）。 */
const CHROME_CANDIDATES =
  process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
       `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find(p => existsSync(p));
if (!CHROME) { console.error('找不到 Chrome —— 设 CHROME_PATH 指向 Chromium 可执行文件'); process.exit(1); }

/* 需要留图时设 NEWS_SOURCE_SHOTS=<目录>。默认不写文件 ——
   截图是给报告用的证据，不是每次跑都该产出的副作用；
   而且绝不能落到仓库里既有的 screenshots/ 上去。 */
const SHOT_DIR = process.env.NEWS_SOURCE_SHOTS || '';
let shotSeq = 0;
const shot = async (page, name) => {
  if (!SHOT_DIR) return;
  await mkdir(SHOT_DIR, { recursive: true });
  shotSeq += 1;
  await page.screenshot({ path: path.join(SHOT_DIR, `${String(shotSeq).padStart(2, '0')}-${name}.png`) });
};

let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => {
  const s = net.createServer(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

/* ── 隔离 fixture 桩 ───────────────────────────────────────────────
   只实现 GET /api/announcements 的三种答复。其余 /api/* 一律 503 ——
   这正是未配 staging 时数据面的实际表现，不伪造任何业务数据。 */
const SERVER_ITEMS = [
  { id: 'srv-1', title: '教务处：2026 秋季注册须知', content: '桩服务提供的公告一。',
    type: 'normal', publishedAt: Date.UTC(2026, 8, 10), publishedBy: 'fixture' },
  { id: 'srv-2', title: '图书馆闭馆通知', content: '桩服务提供的公告二。',
    type: 'important', publishedAt: Date.UTC(2026, 8, 11), publishedBy: 'fixture' },
];
const SAMPLE_TITLE = '2026年春季学期选课通知';   // constants.ts 里 MOCK_NEWS 的第一条

let mode = 'unavailable';
const stubPort = await freePort();
const stub = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = req.url.split('?')[0];
  if (url.startsWith('/__fixture/mode/')) {
    mode = url.slice('/__fixture/mode/'.length);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ mode }));
  }
  if (url === '/api/announcements') {
    if (mode === 'items') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(SERVER_ITEMS));
    }
    if (mode === 'empty') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('[]');
    }
  }
  res.writeHead(503, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Staging database not configured.', code: 'STAGING_DB_NOT_CONFIGURED' }));
});
await new Promise(r => stub.listen(stubPort, '127.0.0.1', r));
const setMode = async (m) => {
  await fetch(`http://127.0.0.1:${stubPort}/__fixture/mode/${m}`);
};

/* ── vite dev ────────────────────────────────────────────────────── */
const port = await freePort();
const vite = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_API_BASE_URL: `http://127.0.0.1:${stubPort}` } });
let viteOut = '';
vite.stdout.on('data', c => { viteOut += c.toString(); });
vite.stderr.on('data', c => { viteOut += c.toString(); });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60 && !viteOut.includes('ready in'); i++) await sleep(500);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 800, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  /* 只需要「已登录」这一个前提：本地 mock 记录，不创建真实身份、不碰 Supabase。 */
  await page.evaluate(() => localStorage.setItem('amas_current_user', JSON.stringify({
    id: 'news-src-local', name: '本地验证', email: 'news@example.com', role: 'student',
  })));

  const waitForHome = async (max = 90) => {
    for (let i = 0; i < max; i++) {
      const ready = await page.evaluate(() =>
        [...document.querySelectorAll('h3')].some(h => (h.textContent || '').trim() === '最新公告'));
      if (ready) return true;
      await sleep(1000);
    }
    return false;
  };
  /** 首页「最新公告」那一整块的可见文字。 */
  const newsBlock = () => page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find(x => (x.textContent || '').trim() === '最新公告');
    const sec = h?.closest('section');
    return sec ? (sec.innerText || '') : '__NO_SECTION__';
  });
  /** 首页公告块里的重试按钮（按可见文字找）。 */
  const retryBtn = () => page.evaluateHandle(() => {
    const h = [...document.querySelectorAll('h3')].find(x => (x.textContent || '').trim() === '最新公告');
    const sec = h?.closest('section');
    if (!sec) return null;
    return [...sec.querySelectorAll('button')].find(b => /重新加载/.test(b.textContent || '')) || null;
  });
  const freshLoad = async () => {
    await page.goto(base, { waitUntil: 'networkidle2' });
    await waitForHome();
    await sleep(1200);   // 让 listAnnouncements 走完
  };

  // ── 1. 未配数据面（503）+ 本机没有缓存：首页必须说这是示例 ──────────
  await setMode('unavailable');
  await page.evaluate(() => localStorage.removeItem('amas_news'));
  await freshLoad();
  let t = await newsBlock();
  check('503 + 无缓存：首页公告块说明了这是示例、不是学院公告',
    /示例/.test(t) && /不是学院发布的公告/.test(t), t.replace(/\n/g, ' | ').slice(0, 150));
  check('503：示例内容仍照常显示，不是靠藏起来解决',
    t.includes(SAMPLE_TITLE));
  const btnHandle = await retryBtn();
  check('503：首页给得出重试入口', await btnHandle.evaluate(el => !!el));
  /* 热区实测：本仓触控下限 44×44（verify-touch-targets 同一口径）。
     量的是 getBoundingClientRect，不是 CSS 声明 —— 负 margin 收行距的写法
     很容易把声明的 minHeight 又压回去，只有实测拦得住。 */
  const box = await btnHandle.evaluate((el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('重试按钮热区达到 44×44',
    !!box && box.h >= 44 && box.w >= 44, box ? `${box.w}×${box.h}` : '没量到');
  const cachedAfterSample = await page.evaluate(() => localStorage.getItem('amas_news'));
  await shot(page, 'home-503-sample');
  check('示例公告不写进本机缓存（否则下次就冒充「上次取到的」）',
    cachedAfterSample === null, `amas_news=${cachedAfterSample === null ? 'null' : '有值'}`);

  // ── 2. 点重试 → 桩改口给真公告 ────────────────────────────────────
  await setMode('items');
  const btn = await retryBtn();
  const clicked = await btn.evaluate(el => { if (!el) return false; el.click(); return true; });
  await sleep(1500);
  t = await newsBlock();
  check('点「重新加载」真的重新拉，首页换成服务端那份',
    clicked && t.includes('教务处：2026 秋季注册须知'), t.replace(/\n/g, ' | ').slice(0, 120));
  await shot(page, 'home-after-retry-server');
  check('拿到真公告后，来源说明消失', !/示例/.test(t));
  const cachedAfterServer = await page.evaluate(() => localStorage.getItem('amas_news'));
  check('服务端那份才进缓存',
    !!cachedAfterServer && cachedAfterServer.includes('教务处：2026 秋季注册须知'));

  // ── 3. 有缓存时再失败：说「上次取到的」，不能说成示例 ───────────────
  await setMode('unavailable');
  await freshLoad();
  t = await newsBlock();
  check('有缓存 + 503：说的是「上次从服务器取到的」而不是示例',
    /上次从服务器取到的那份/.test(t) && !/内置的示例/.test(t), t.replace(/\n/g, ' | ').slice(0, 150));
  await shot(page, 'home-503-cache');
  check('有缓存 + 503：显示的仍是上次那份真公告',
    t.includes('教务处：2026 秋季注册须知'));

  // ── 3b. 旧版本留下的裸数组：来源不可考，不许冒充服务端缓存 ──────────
  await page.evaluate(() => localStorage.setItem('amas_news', JSON.stringify([
    { id: 'legacy-1', title: '本机旧数据：来源不明的一条', date: '2026-01-01', type: 'Notice', content: '' },
  ])));
  await freshLoad();
  t = await newsBlock();
  check('旧版裸数组 + 503：说「来源无法确认」，不说成上次从服务器取到的',
    /来源无法确认/.test(t) && !/从服务器取到的那份/.test(t), t.replace(/\n/g, ' | ').slice(0, 150));

  // ── 4. 服务端说「一条都没有」：这是真答复，不许冒出示例 ──────────────
  await setMode('empty');
  await freshLoad();
  t = await newsBlock();
  check('真实空结果：明说学院当前没有发布公告',
    /没有发布公告/.test(t), t.replace(/\n/g, ' | ').slice(0, 120));
  await shot(page, 'home-server-empty');
  check('真实空结果：不冒出示例公告', !t.includes(SAMPLE_TITLE) && !/示例/.test(t));

  // ── 5. 首页与公告页来源语义一致 ───────────────────────────────────
  await setMode('unavailable');
  await page.evaluate(() => localStorage.removeItem('amas_news'));
  await freshLoad();
  const homeText = await newsBlock();
  const opened = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find(x => (x.textContent || '').trim() === '最新公告');
    const b = h?.closest('div')?.querySelector('button');
    if (!b) return false;
    b.click(); return true;
  });
  await sleep(1200);
  const viewText = await page.evaluate(() => document.body.innerText || '');
  await shot(page, 'announcements-view-503-sample');
  check('公告页与首页说的是同一件事（都点名示例 + 同一失败原因）',
    opened && /示例/.test(viewText) && /不是学院发布的公告/.test(viewText)
      && /数据服务暂时不可用/.test(viewText) && /数据服务暂时不可用/.test(homeText),
    opened ? '' : '没找到「查看全部」入口');

  console.log(`\n  合计 PASS ${pass} / FAIL ${fail}`);
} finally {
  await browser.close();
  vite.kill();
  stub.close();
}
process.exit(fail === 0 ? 0 : 1);
