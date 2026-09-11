/**
 * Dashboard 顶部搜索按钮的键盘可达性 —— 本地实测验证。
 *
 * ## 缺陷
 *
 * 首页顶部有**两个**搜索按钮，随滚动互相交接：
 *
 *   吸顶紧凑栏里的 34×34  —— 父容器 `aria-hidden={!scrolled}`，
 *                            未滚动时 `transform: translateY(-100%)` 移到屏幕外
 *   悬浮在 hero 上的 36×36 —— 滚动后 `opacity: 0` + `pointerEvents: 'none'`
 *
 * 两种隐藏方式都**不会把元素移出 tab 序**：
 *
 *   · `aria-hidden="true"` 只把元素从无障碍树里摘掉，不影响焦点。
 *     WAI-ARIA 明确禁止 aria-hidden 子树里存在可聚焦元素（axe: aria-hidden-focus）——
 *     屏幕阅读器用户 Tab 过去会落进一个「什么都不念」的黑洞。
 *   · `pointer-events: none` 只挡指针，不挡键盘。焦点仍能落上去，
 *     而且按 Enter **照样会触发 onClick**，从一个看不见的控件打开搜索。
 *
 * 实测（375px，未滚动时从页顶按第一次 Tab）：焦点落到 `top=-44` 的屏幕外按钮。
 * 真人看到的是「按了 Tab，焦点不见了」。
 *
 * ## 修法
 *
 * 让每个按钮的 tab 序与它自身的可见性同步：非当前那一个 `tabIndex={-1}`，
 * 并给悬浮那个补上 `aria-hidden`（与吸顶栏对称）。纯属性改动，零视觉变化、
 * 零布局变化，不碰搜索逻辑本身。
 *
 * 跑法：node scripts/verify-dashboard-search-a11y.mjs
 */
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH
  || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find(p => existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }

let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const port = await new Promise((res, rej) => {
  const s = net.createServer(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

// 与既有 5 个回归脚本同一套：起 vite dev，不依赖 dist 是否已构建。
// 本页在没有后端的情况下也能完整渲染 —— 这条缺陷与身份、后端、live 配置都无关。
const vite = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let viteOut = '';
vite.stdout.on('data', c => { viteOut += c.toString(); });
vite.stderr.on('data', c => { viteOut += c.toString(); });

const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60 && !viteOut.includes('ready in'); i++) await sleep(500);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 720, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  // 只需要「已登录」这一个前提。用本地 mock 记录，不创建任何真实身份、
  // 不连后端、不碰 Supabase —— App 的 isLoggedIn 本来就接受这条本地记录。
  await page.evaluate(() => localStorage.setItem('amas_current_user', JSON.stringify({
    id: 'a11y-local', name: '本地验证', email: 'a11y@example.com', role: 'student',
  })));
  await page.goto(base, { waitUntil: 'networkidle2' });
  await sleep(9000);

  /** 两个搜索按钮的状态。索引 0 = 吸顶栏那个，1 = 悬浮那个（按 DOM 顺序）。 */
  const searches = () => page.evaluate(() => [...document.querySelectorAll('button')]
    .filter(b => (b.getAttribute('aria-label') || '') === '搜索')
    .map(b => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const host = b.closest('[aria-hidden]');
      const visible = r.top >= 0 && r.bottom <= window.innerHeight
        && cs.opacity !== '0' && cs.visibility !== 'hidden';
      return {
        top: Math.round(r.top), opacity: cs.opacity, pointerEvents: cs.pointerEvents,
        ariaHidden: host ? host.getAttribute('aria-hidden') : null,
        tabIndex: b.tabIndex, visible,
      };
    }));

  const scrollTo = async y => { await page.evaluate(v => window.scrollTo(0, v), y); await sleep(700); };

  /** 从页顶开始按 Tab，返回前 n 个落点的可见性。 */
  const tabWalk = async (n = 3) => {
    await page.evaluate(() => { document.activeElement?.blur(); });
    const out = [];
    for (let i = 0; i < n; i++) {
      await page.keyboard.press('Tab');
      out.push(await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return { tag: 'body', visible: true, label: '' };
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        return {
          tag: a.tagName,
          label: (a.getAttribute('aria-label') || a.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 20),
          top: Math.round(r.top),
          visible: r.top >= 0 && r.bottom <= window.innerHeight && cs.opacity !== '0',
          inAriaHidden: !!a.closest('[aria-hidden="true"]'),
        };
      }));
    }
    return out;
  };

  console.log('\n-- 前提：确实有两个互相交接的搜索按钮 --');
  await scrollTo(0);
  let s = await searches();
  check('页面上恰好两个搜索按钮', s.length === 2, `实际 ${s.length}`);
  check('未滚动时：吸顶栏那个在屏幕外、悬浮那个可见',
    s[0] && !s[0].visible && s[1] && s[1].visible,
    `sticky.top=${s[0]?.top} floating.top=${s[1]?.top}`);

  console.log('\n-- 未滚动时（吸顶栏是隐藏的那个）--');
  check('★ 吸顶栏按钮在 aria-hidden 子树里 —— 那里不得有可聚焦元素',
    s[0].ariaHidden === 'true' && s[0].tabIndex === -1,
    `aria-hidden=${s[0].ariaHidden} tabIndex=${s[0].tabIndex}`);
  check('可见的悬浮按钮仍在 tab 序里（修复不得把能用的也关掉）',
    s[1].tabIndex === 0, `tabIndex=${s[1].tabIndex}`);

  const walk = await tabWalk(3);
  check('★ 从页顶按第一次 Tab，焦点必须落在看得见的东西上',
    walk[0].visible, `${walk[0].tag} "${walk[0].label}" top=${walk[0].top} visible=${walk[0].visible}`);
  check('★ 前三次 Tab 都不得落进 aria-hidden 子树',
    walk.every(w => !w.inAriaHidden),
    walk.map(w => `${w.label || w.tag}${w.inAriaHidden ? '(aria-hidden!)' : ''}`).join(' → '));

  console.log('\n-- 滚动之后（悬浮那个成了隐藏的那个）--');
  await scrollTo(900);
  s = await searches();
  check('滚动后：吸顶栏可见、悬浮那个淡出',
    s[0].visible && s[1].opacity === '0',
    `sticky.top=${s[0].top} floating.opacity=${s[1].opacity}`);
  check('★ 淡出的悬浮按钮必须移出 tab 序',
    s[1].tabIndex === -1,
    `tabIndex=${s[1].tabIndex}（pointer-events:${s[1].pointerEvents} 只挡指针，不挡键盘）`);
  check('吸顶栏按钮此时在 tab 序里且未被 aria-hidden',
    s[0].tabIndex === 0 && s[0].ariaHidden !== 'true',
    `tabIndex=${s[0].tabIndex} aria-hidden=${s[0].ariaHidden}`);

  console.log('\n-- 任何滚动位置上，可聚焦的搜索按钮恰好一个 --');
  for (const y of [0, 100, 200, 500, 900]) {
    await scrollTo(y);
    const cur = await searches();
    const focusable = cur.filter(b => b.tabIndex >= 0).length;
    const visible = cur.filter(b => b.visible).length;
    check(`scrollY=${y}：可聚焦 1 个、可见 1 个`,
      focusable === 1 && visible === 1, `可聚焦 ${focusable} · 可见 ${visible}`);
  }

  console.log('\n-- 功能未被破坏：键盘仍能打开搜索 --');
  await scrollTo(0);
  const opened = await page.evaluate(async () => {
    const b = [...document.querySelectorAll('button')]
      .filter(x => (x.getAttribute('aria-label') || '') === '搜索')
      .find(x => x.tabIndex === 0);
    if (!b) return 'no-focusable-search';
    b.focus();
    return document.activeElement === b ? 'focused' : 'focus-failed';
  });
  check('可见的搜索按钮能被聚焦', opened === 'focused', opened);
  await page.keyboard.press('Enter');
  await sleep(900);
  const searchOpen = await page.evaluate(() =>
    !!document.querySelector('input[type="search"], input[placeholder*="搜索"]')
    || document.body.innerText.includes('搜索'));
  check('按 Enter 打开搜索', searchOpen);
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
