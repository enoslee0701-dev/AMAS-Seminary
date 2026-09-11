/**
 * 全局搜索浮层的模态语义 —— 本地实测验证。
 *
 * ## 走的是真实用户流
 *
 * 首页点搜索 → 输入 → 结果 → 点结果进详情。本脚本按这条流走，
 * 不连后端、不创建任何真实身份、不碰 live 配置（App 的 isLoggedIn
 * 本来就接受一条本地 mock 记录）。
 *
 * ## 缺陷
 *
 * `components/GlobalSearch.tsx` 用 `createPortal` 渲染一个
 * `fixed inset-0 z-[120]` 的全屏面板。它在**视觉上**是模态，
 * 但在语义与键盘上不是：
 *
 *   · 没有 Escape 处理 —— 键盘用户开了就关不掉（只能去点「取消」）
 *   · 没有 role="dialog" / aria-modal —— 屏幕阅读器不知道这是个模态，
 *     不会把背后的首页内容屏蔽掉
 *   · 背后的首页仍在 tab 序里 —— 从浮层里一路 Tab 会走进看不见的首页控件，
 *     焦点就此漏出模态，用户再也回不到搜索结果上
 *   · 输入框只有 placeholder，没有可访问名称（placeholder 不是 label，
 *     输入后就消失了）
 *   · 关闭后焦点没有还给打开它的那个搜索按钮
 *
 * ## 跑法
 *
 *   node scripts/verify-global-search-modal.mjs
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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 720, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 140)));

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('amas_current_user', JSON.stringify({
    id: 'search-local', name: '本地验证', email: 'search@example.com', role: 'student',
  })));
  await page.goto(base, { waitUntil: 'networkidle2' });
  /* 等 App 真正过了启动页再开测。固定 sleep 会在 vite 冷编译时抓空 ——
     本轮就出现过一次「浮层打开」失败、实为卡在 SplashView 的假红。 */
  const waitForApp = async (max = 90) => {
    for (let i = 0; i < max; i++) {
      const ready = await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => (b.innerText || '').trim().endsWith('校友圈')));
      if (ready) return true;
      await sleep(1000);
    }
    return false;
  };
  if (!await waitForApp()) { console.error('App 未能在 90 秒内离开启动页'); process.exit(1); }

  /** 打开搜索：点当前可见（tab 序里）的那个搜索按钮。 */
  const openSearch = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .filter(x => (x.getAttribute('aria-label') || '') === '搜索')
        .find(x => x.tabIndex === 0);
      b?.focus();
      b?.click();
    });
    await sleep(1000);
  };

  /** 浮层的根元素 = 那个 fixed inset-0 的全屏容器。 */
  const overlay = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d => {
      const cs = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return cs.position === 'fixed' && parseInt(cs.zIndex || '0', 10) >= 100
        && r.height > window.innerHeight * 0.8 && d.querySelector('input');
    });
    if (!el) return null;
    const inp = el.querySelector('input');
    return {
      role: el.getAttribute('role'),
      ariaModal: el.getAttribute('aria-modal'),
      ariaLabel: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'),
      inputFocused: document.activeElement === inp,
      inputHasName: !!(inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby')
        || (inp.id && document.querySelector(`label[for="${inp.id}"]`))),
      inputPlaceholder: inp.getAttribute('placeholder') || '',
    };
  });
  const isOpen = async () => (await overlay()) !== null;

  /** 从当前焦点按 n 次 Tab，返回每次落点是否仍在浮层内。 */
  const tabWalk = async (n, shift = false) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (shift) { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); }
      else { await page.keyboard.press('Tab'); }
      out.push(await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return { inside: false, label: '(body)' };
        const host = [...document.querySelectorAll('div')].find(d => {
          const cs = getComputedStyle(d);
          const r = d.getBoundingClientRect();
          return cs.position === 'fixed' && parseInt(cs.zIndex || '0', 10) >= 100
            && r.height > window.innerHeight * 0.8 && d.querySelector('input');
        });
        return {
          inside: !!host && host.contains(a),
          label: (a.getAttribute('aria-label') || a.innerText || a.placeholder || a.tagName)
            .trim().replace(/\s+/g, ' ').slice(0, 18),
        };
      }));
    }
    return out;
  };

  console.log('\n-- 打开搜索：既有行为不得被破坏 --');
  await openSearch();
  let o = await overlay();
  check('浮层打开', o !== null);
  check('输入框自动聚焦', o?.inputFocused === true);

  console.log('\n-- 模态语义 --');
  check('★ 浮层声明为 role="dialog"', o?.role === 'dialog', `实际 ${o?.role ?? '(无)'}`);
  check('★ 浮层声明 aria-modal="true"', o?.ariaModal === 'true', `实际 ${o?.ariaModal ?? '(无)'}`);
  check('浮层本身有可访问名称', !!o?.ariaLabel, o?.ariaLabel ?? '(无)');
  check('★ 输入框有可访问名称（placeholder 不算 —— 输入后就没了）',
    o?.inputHasName === true, `placeholder="${o?.inputPlaceholder}" 可访问名称=${o?.inputHasName}`);

  console.log('\n-- 键盘：焦点不得漏到背后的首页 --');
  await page.evaluate(() => document.querySelector('input')?.focus());
  let walk = await tabWalk(10);
  const leaked = walk.filter(w => !w.inside);
  check('★ 连按 10 次 Tab，焦点始终留在浮层内',
    leaked.length === 0,
    leaked.length ? `漏出 ${leaked.length} 次：${leaked.slice(0, 4).map(w => w.label).join(' / ')}` : '未漏出');

  await page.evaluate(() => document.querySelector('input')?.focus());
  walk = await tabWalk(4, true);
  const leakedBack = walk.filter(w => !w.inside);
  check('★ Shift+Tab 同样不得漏出去',
    leakedBack.length === 0,
    leakedBack.length ? `漏出 ${leakedBack.length} 次：${leakedBack.slice(0, 3).map(w => w.label).join(' / ')}` : '未漏出');

  console.log('\n-- Escape 关闭 --');
  if (!await isOpen()) { await openSearch(); }
  await page.keyboard.press('Escape');
  await sleep(800);
  check('★ Escape 关闭浮层', !(await isOpen()));

  console.log('\n-- 关闭后焦点归位 --');
  const restored = await page.evaluate(() => {
    const a = document.activeElement;
    return { label: a ? (a.getAttribute('aria-label') || a.tagName) : '(none)', isSearch: !!a && a.getAttribute('aria-label') === '搜索' };
  });
  check('★ 关闭后焦点回到打开它的搜索按钮', restored.isSearch, `当前焦点：${restored.label}`);

  console.log('\n-- 「取消」按钮仍然可用（既有行为）--');
  await openSearch();
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').trim() === '取消');
    b?.click();
  });
  await sleep(800);
  check('点「取消」关闭浮层', !(await isOpen()));

  console.log('\n-- 搜索 → 结果 → 详情：功能未被破坏 --');
  await openSearch();
  await page.keyboard.type('神学', { delay: 50 });
  await sleep(1200);
  const hits = await page.evaluate(() => {
    const host = [...document.querySelectorAll('div')].find(d => {
      const cs = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return cs.position === 'fixed' && parseInt(cs.zIndex || '0', 10) >= 100
        && r.height > window.innerHeight * 0.8 && d.querySelector('input');
    });
    if (!host) return null;
    return [...host.querySelectorAll('button')]
      .map(b => (b.innerText || '').trim().replace(/\s+/g, ' '))
      .filter(t => t && t !== '取消' && t !== '清空');
  });
  check('输入「神学」后浮层内出现结果', Array.isArray(hits) && hits.length > 0, `${hits?.length ?? 0} 条，例如「${hits?.[0] ?? ''}」`);

  const before = await page.evaluate(() => document.body.innerText.slice(0, 60));
  await page.evaluate(() => {
    const host = [...document.querySelectorAll('div')].find(d => {
      const cs = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return cs.position === 'fixed' && parseInt(cs.zIndex || '0', 10) >= 100
        && r.height > window.innerHeight * 0.8 && d.querySelector('input');
    });
    const b = [...host.querySelectorAll('button')]
      .find(x => { const t = (x.innerText || '').trim(); return t && t !== '取消' && t !== '清空'; });
    b?.click();
  });
  await sleep(1600);
  check('点结果后浮层关闭', !(await isOpen()));
  const after = await page.evaluate(() => document.body.innerText.slice(0, 60));
  check('点结果后确实换了页面', before !== after, `"${after.replace(/\s+/g, ' ').slice(0, 40)}"`);

  check('全程无 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
