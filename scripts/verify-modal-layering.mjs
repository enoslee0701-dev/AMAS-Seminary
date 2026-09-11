/**
 * 标签页上的弹窗与常驻底部标签栏的层级关系 —— 本地实测验证（OPEN_ISSUES #28）。
 *
 * ## 缺陷
 *
 * `components/Navigation.tsx` 的常驻标签栏是 `fixed bottom-0 … z-50`，
 * 并且在 `App.tsx` 里渲染在视图内容**之后**。视图内部的弹窗若也用 `z-50`，
 * 层级相同、DOM 靠前 —— 标签栏画在弹窗上面。
 *
 * 上一轮已经撞上过一次真事故：图书馆的 AI 助教弹窗是 `items-end` + `h-[85vh]`，
 * 提问框和发送键正好落在标签栏底下，手机上完全点不到（已修，抬到 z-[60]）。
 *
 * 剩下的同类是「我的」页那两个弹窗。它们是居中 + `max-h-[85vh]`，
 * 在 375×720 上恰好不撞 —— 但那是「内容不够高」，不是层级保证的。
 * 屏幕一矮（320×568，iPhone SE 一代那一档）85vh 的底边就压进标签栏，
 * 设置弹窗滚到底时「退出登录」正落在标签栏下面。
 *
 * ## 判定方式
 *
 * 不看 z-index 的字面值，看 hit-testing：把弹窗滚到底，
 * 对弹窗内每个可交互元素调 `document.elementFromPoint`，
 * 命中的若是标签栏里的东西，就是真的点不到。
 *
 * 另外一并验：打开、滚动、键盘焦点能进到弹窗内部、关得掉。
 *
 * 跑法：node scripts/verify-modal-layering.mjs
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
const vite = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let viteOut = '';
vite.stdout.on('data', c => { viteOut += c.toString(); });
vite.stderr.on('data', c => { viteOut += c.toString(); });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60 && !viteOut.includes('ready in'); i++) await sleep(500);

const PROBE = `
window.__ml = {
  owns(el, p) { let n = p; while (n) { if (n === el) return true; n = n.parentElement; } return false; },

  /** 贴着视口底边的常驻标签栏。 */
  navBar() {
    return [...document.querySelectorAll('body *')].find(e => {
      if (getComputedStyle(e).position !== 'fixed') return false;
      const r = e.getBoundingClientRect();
      return r.height > 20 && r.height < 200
        && Math.abs(r.bottom - window.innerHeight) < 2
        && r.width > window.innerWidth * 0.8
        && e.querySelectorAll('button').length >= 4;
    }) || null;
  },

  /** 最上层的全屏固定浮层 = 当前弹窗。 */
  modalRoot() {
    const hits = [...document.querySelectorAll('body *')].filter(el => {
      if (getComputedStyle(el).position !== 'fixed') return false;
      const r = el.getBoundingClientRect();
      return r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2;
    });
    return hits.length ? hits[hits.length - 1] : null;
  },

  interactives(root) {
    const sel = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    return [...(root || document).querySelectorAll(sel)].filter(el => {
      if (el.disabled || el.tabIndex < 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
      if (r.right <= 0 || r.left >= window.innerWidth) return false;
      const cs = getComputedStyle(el);
      return cs.opacity !== '0' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
    });
  },

  name(el) {
    const a = (el.getAttribute('aria-label') || '').trim();
    if (a) return a;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.type || 'INPUT';
    return (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 18) || el.tagName;
  },

  /** 弹窗内部可滚动的那个面板。 */
  panel(root) {
    if (!root) return null;
    return [...root.querySelectorAll('*')]
      .find(e => e.scrollHeight > e.clientHeight + 4
        && /auto|scroll/.test(getComputedStyle(e).overflowY)) || null;
  },

  /** 弹窗里有哪些可交互元素，其可视中心命中的却是标签栏。 */
  blockedByNav() {
    const root = window.__ml.modalRoot();
    const nav = window.__ml.navBar();
    if (!root) return { noModal: true };
    if (!nav) return { noNav: true };
    const bad = [];
    for (const el of window.__ml.interactives(root)) {
      const r = el.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) continue;
      const p = document.elementFromPoint(cx, cy);
      if (!p) continue;
      if (window.__ml.owns(el, p)) continue;
      if (nav.contains(p)) bad.push({ me: window.__ml.name(el), thief: window.__ml.name(p) });
    }
    return { bad, count: window.__ml.interactives(root).length };
  },
};
`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
let anyFatal = false;
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(PROBE);
  await page.setViewport({ width: 375, height: 720, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('amas_current_user', JSON.stringify({
      id: 'layer-local', name: '本地验证', email: 'layer@example.com', role: 'student' }));
    // 无后端时的离线横幅是 z-[80] 固定浮层，会干扰「谁盖住谁」的判定。
    // 用它自己的 dismiss 键持久化，等价于真人点一次「知道了」。
    localStorage.setItem('amas_offline_notice_dismissed', '1');
  });

  const waitForApp = async (max = 90) => {
    for (let i = 0; i < max; i++) {
      const ok = await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => (b.innerText || '').trim().endsWith('校友圈')));
      if (ok) return true;
      await sleep(1000);
    }
    return false;
  };

  const openTab = async (tab) => {
    await page.goto(base, { waitUntil: 'networkidle2' });
    if (!await waitForApp()) return false;
    await page.evaluate(t => {
      const nav = window.__ml.navBar();
      [...(nav || document).querySelectorAll('button')]
        .find(x => (x.innerText || '').trim().endsWith(t))?.click();
    }, tab);
    await sleep(1200);
    return true;
  };

  const clickByName = async (name) => page.evaluate(n => {
    const el = window.__ml.interactives().find(x => window.__ml.name(x) === n
      || window.__ml.name(x).startsWith(n));
    if (!el) return false;
    el.click();
    return true;
  }, name);

  /** 把弹窗内部面板滚到底（有的话），否则滚弹窗本身。 */
  const scrollModalToEnd = async () => page.evaluate(() => {
    const root = window.__ml.modalRoot();
    const p = window.__ml.panel(root) || root;
    if (!p) return 0;
    p.scrollTop = p.scrollHeight;
    return p.scrollTop;
  });

  /**
   * 一个弹窗的完整体检：打开 → 滚到底 → 底栏遮挡 → 键盘焦点 → 关闭。
   */
  const auditModal = async ({ label, tab, open, closeBy, expectText }) => {
    console.log(`\n-- ${label} --`);
    if (!await openTab(tab)) { check(`${label} · 能进入「${tab}」`, false); anyFatal = true; return; }
    if (!await open()) { check(`${label} · 能打开`, false, '找不到入口'); return; }
    await sleep(1000);
    const opened = await page.evaluate(t => document.body.innerText.includes(t), expectText);
    check(`${label} · 已打开`, opened, `找「${expectText}」`);
    if (!opened) return;

    await scrollModalToEnd();
    await sleep(500);

    const r = await page.evaluate(() => window.__ml.blockedByNav());
    if (r.noModal) { check(`${label} · 识别得出弹窗根`, false); return; }
    if (r.noNav) { check(`${label} · 该页有常驻标签栏`, false, '没找到标签栏，本例不适用'); return; }
    check(`${label} · 滚到底后没有控件被底部标签栏盖住`,
      r.bad.length === 0,
      r.bad.length ? r.bad.map(b => `${b.me}←${b.thief}`).join(' · ') : `弹窗内 ${r.count} 个控件全部可点`);

    // 键盘焦点必须能进到弹窗里面，而不是停在背后的页面上。
    const focusIn = await page.evaluate(() => {
      const root = window.__ml.modalRoot();
      const first = window.__ml.interactives(root)[0];
      if (!first) return 'empty';
      first.focus();
      return root.contains(document.activeElement) ? 'inside' : 'outside';
    });
    check(`${label} · 键盘焦点能落到弹窗内部`, focusIn === 'inside', focusIn);

    const closed = await closeBy();
    await sleep(800);
    const gone = await page.evaluate(t => !document.body.innerText.includes(t), expectText);
    check(`${label} · 关得掉`, closed && gone);
  };

  for (const [w, h] of [[320, 568], [375, 720]]) {
    console.log(`\n${'='.repeat(52)}\n视口 ${w}×${h}\n${'='.repeat(52)}`);
    await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true });

    await auditModal({
      label: '我的 · 设置',
      tab: '我的',
      expectText: '退出登录',
      open: () => clickByName('设置'),
      /* 设置弹窗的关闭键此刻还没有可访问名称（见 OPEN_ISSUES #28 之外的另一条），
         所以按结构找：弹窗标题那一行里最后一个按钮。 */
      closeBy: () => page.evaluate(() => {
        const root = window.__ml.modalRoot();
        const row = root?.querySelector('.flex.justify-between');
        const btns = row ? [...row.querySelectorAll('button')] : [];
        btns[btns.length - 1]?.click();
        return btns.length > 0;
      }),
    });

    await auditModal({
      label: '我的 · 编辑资料',
      tab: '我的',
      expectText: '保存',
      open: () => clickByName('编辑资料'),
      closeBy: () => clickByName('关闭'),
    });

    await auditModal({
      label: '图书馆 · AI 神学助教',
      tab: '图书馆',
      expectText: '神学 AI 助手',
      open: () => clickByName('AI 神学助教'),
      closeBy: () => page.evaluate(() => {
        const root = window.__ml.modalRoot();
        // 顶栏那个没有名字的 X
        const btn = [...root.querySelectorAll('button')][0];
        btn?.click();
        return true;
      }),
    });
  }
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail || anyFatal ? 1 : 0);
