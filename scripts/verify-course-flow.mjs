/**
 * 核心用户流程 —— 首页 / 课程 → 进入一门课 → 看内容 → 返回 → 状态还在吗。
 *
 * ## 三个实测出来的缺陷
 *
 * ### 1. 首页「精选免费公开课」点进去不是那门课
 *
 * 两张卡原本写死为 '新约导论' / '系统神学 I' —— 目录里**没有这两门课**，
 * 而且 `onClick` 是 `onViewChange(ViewState.COURSES)`：用户看见一门具体的课、
 * 点下去被丢进整份课程列表，还得自己再找一遍。改为从真实目录取（一门新约、
 * 一门神学与思想），点击直接打开那门课。
 *
 * ### 2. 返回后用户刚做的选择被清空
 *
 * `App.tsx` 是 `selectedCourseId ? <CourseDetailView/> : <…五个标签页…>`，
 * 打开一门课会把**整棵标签页子树连同 `<main>` 一起卸载**。返回时重新挂载，
 * 组件里的 `useState` 全回初始值、`<main>` 是新节点 scrollTop 归零。
 *
 * ```
 * 修复前  课程页筛「新约书卷」→ 进一门课 → 返回 → 筛选变回「全部」
 *         课程页往下翻 600px → 进一门课 → 返回 → 回到列表最顶端
 * ```
 *
 * 分别用 `services/stickyState.ts`（本次运行期间记住筛选/排序/搜索）和
 * `App.tsx` 里按 view 记忆的 `<main>` scrollTop 修掉。
 *
 * ### 3. 课程列表整行可点，但键盘够不到
 *
 * 行是个带 `onClick` 的 `<div>`，没有 role / tabIndex。
 *
 * ## 边界
 *
 * 不连后端、不创建真实身份、不碰 live 配置与 canonical SQLite。
 * 课程目录走本地 catalog，一条本地 mock 登录记录即可。
 *
 * 跑法：node scripts/verify-course-flow.mjs
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
let anyFatal = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 140)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  await page.setViewport({ width: 375, height: 720, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('amas_current_user', JSON.stringify({
      id: 'flow-local', name: '本地验证', email: 'flow@example.com', role: 'student' }));
    localStorage.setItem('amas_offline_notice_dismissed', '1');
  });

  const waitForApp = async (max = 90) => {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => (b.innerText || '').trim().endsWith('校友圈')))) return true;
      await sleep(1000);
    }
    return false;
  };
  const navBar = `(() => [...document.querySelectorAll('body *')].find(e => {
      if (getComputedStyle(e).position !== 'fixed') return false;
      const r = e.getBoundingClientRect();
      return r.height > 20 && r.height < 200
        && Math.abs(r.bottom - window.innerHeight) < 2
        && r.width > window.innerWidth * 0.8;
    }))()`;
  const tab = async (t) => {
    await page.evaluate(new Function('l', `
      const bar = ${navBar};
      [...(bar || document).querySelectorAll('button')]
        .find(x => (x.innerText || '').trim().endsWith(l))?.click();
    `), t);
    await sleep(1400);
  };
  /* 真正在滚的容器两种情况都有：<main> 带 overflow-y-auto，但在课程页上它
     撑到了内容全高，滚的是文档。测量和设置都得先认出是哪一个 —— 只认 <main>
     会永远量到 0，断言就成了空跑。 */
  const scrollerJs = `(() => {
    const m = document.querySelector('main');
    return (m && m.scrollHeight > m.clientHeight + 4) ? m : (document.scrollingElement || document.documentElement);
  })()`;
  const scrollTop = () => page.evaluate(new Function(`return Math.round(${scrollerJs}.scrollTop);`));
  const setScroll = (v) => page.evaluate(new Function('y', `${scrollerJs}.scrollTop = y;`), v);
  const scrollGeom = () => page.evaluate(new Function(`const s = ${scrollerJs};
    return { tag: s.tagName, sh: s.scrollHeight, ch: s.clientHeight };`));
  const inDetail = () => page.evaluate(() => /课程简介|课时列表|点击播放/.test(document.body.innerText));
  const detailTitle = () => page.evaluate(() => document.querySelector('h1')?.innerText?.trim() || '');
  const back = async () => {
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(x => (x.getAttribute('aria-label') || '') === '返回')?.click());
    await sleep(1400);
  };
  const fresh = async () => {
    await page.goto(base, { waitUntil: 'networkidle2' });
    if (!await waitForApp()) { anyFatal = true; return false; }
    return true;
  };
  /** 课程列表里第一门课的标题与打开动作。 */
  const firstCourse = () => page.evaluate(() => {
    const row = [...document.querySelectorAll('[role="button"]')]
      .find(x => /打开课程/.test(x.getAttribute('aria-label') || ''));
    if (!row) return null;
    return { label: row.getAttribute('aria-label'), title: row.querySelector('h4')?.innerText?.trim() || '' };
  });

  /* ---------------- 1. 首页「精选免费公开课」 ---------------- */
  console.log('\n-- 首页 · 精选免费公开课 --');
  if (!await fresh()) throw new Error('启动超时');
  await tab('首页');
  const cards = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find(x => x.innerText.trim() === '精选免费公开课');
    const grid = h?.parentElement?.nextElementSibling;
    return [...(grid ? grid.querySelectorAll('button') : [])].map(b => ({
      tag: b.tagName,
      title: b.querySelector('p')?.innerText?.trim() || '',
      text: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      focusable: b.tabIndex >= 0,
    }));
  });
  check('精选卡是 button（键盘够得到），且有两张', cards.length === 2 && cards.every(c => c.focusable),
    cards.map(c => `${c.tag}「${c.title}」`).join(' · '));

  const catalogTitles = await page.evaluate(async () => {
    const m = await import('/services/catalog.ts');
    const list = m.CATALOG || m.default || [];
    return Array.isArray(list) ? list.map(c => c.title) : [];
  }).catch(() => []);
  if (catalogTitles.length) {
    check('精选卡展示的是目录里真实存在的课',
      cards.every(c => catalogTitles.includes(c.title)),
      cards.map(c => c.title).join(' · '));
  }

  const wantTitle = cards[0]?.title || '';
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find(x => x.innerText.trim() === '精选免费公开课');
    const grid = h?.parentElement?.nextElementSibling;
    grid?.querySelector('button')?.click();
  });
  await sleep(1800);
  const openedDetail = await inDetail();
  const gotTitle = await detailTitle();
  check('点第一张精选卡直接打开那门课（不是跳到整份课程列表）',
    openedDetail && !!wantTitle && gotTitle.includes(wantTitle),
    `想要「${wantTitle}」· 实际「${gotTitle}」· 在详情页=${openedDetail}`);

  /* ---------------- 2. 课程页：筛选与滚动位置 ---------------- */
  console.log('\n-- 课程 · 进出课程详情后的状态 --');
  if (!await fresh()) throw new Error('启动超时');
  await tab('课程');

  const chipState = () => page.evaluate(() => {
    const names = ['全部', '新约书卷', '旧约书卷', '神学与思想'];
    return [...document.querySelectorAll('button')]
      .filter(x => names.includes((x.innerText || '').trim()))
      .map(x => `${(x.innerText || '').trim()}:${getComputedStyle(x).backgroundColor}`)
      .join('|');
  });

  const clickedChip = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').trim() === '神学与思想');
    b?.click(); return !!b;
  });
  await sleep(1000);
  check('前提：能选中一个分类 chip', clickedChip);
  const chipBefore = await chipState();

  const course = await firstCourse();
  check('前提：列表里找得到一门课', !!course, course ? course.label : '找不到');
  if (!course) throw new Error('列表为空');

  const openFirst = () => page.evaluate(() => [...document.querySelectorAll('[role="button"]')]
    .find(x => /打开课程/.test(x.getAttribute('aria-label') || ''))?.click());

  await openFirst();
  await sleep(1800);
  check('从课程列表能进入课程详情', await inDetail(), await detailTitle());

  await back();
  const chipAfter = await chipState();
  check('★ 返回后分类筛选仍是刚才选的那个',
    chipBefore === chipAfter, `前 ${chipBefore} / 后 ${chipAfter}`);

  /* 滚动位置要在**未筛选**的完整列表上量 —— 筛到单个分类后列表只有几条，
     根本滚不动，那样的断言是空跑（本脚本第一版就这么假绿过）。 */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').trim() === '全部');
    b?.click();
  });
  await sleep(1800);
  const geom = await scrollGeom();
  await setScroll(500);
  await sleep(600);
  const scrollBefore = await scrollTop();
  check('前提：完整课程列表能往下滚', scrollBefore > 100,
    `scrollTop=${scrollBefore} 滚动容器=${geom.tag} ${geom.sh}/${geom.ch}`);

  await openFirst();
  await sleep(1800);
  const inDet2 = await inDetail();
  check('前提：再次进入课程详情', inDet2);
  await back();
  const scrollAfter = await scrollTop();
  check('★ 返回后回到刚才的滚动位置，不是列表顶端',
    scrollBefore > 100 && Math.abs(scrollAfter - scrollBefore) <= 40,
    `${scrollBefore} → ${scrollAfter}`);

  /* ---------------- 3. 课程行的键盘可达性 ---------------- */
  console.log('\n-- 课程列表整行的键盘可达性 --');
  const kb = await page.evaluate(() => {
    const row = [...document.querySelectorAll('[role="button"]')]
      .find(x => /打开课程/.test(x.getAttribute('aria-label') || ''));
    if (!row) return 'missing';
    row.focus();
    return document.activeElement === row ? 'focused' : 'focus-failed';
  });
  check('课程行能被聚焦（有 role/tabIndex）', kb === 'focused', kb);
  if (kb === 'focused') {
    await page.keyboard.press('Enter');
    await sleep(1800);
    check('在课程行上按 Enter 能打开课程', await inDetail(), await detailTitle());
    await back();
  }

  /* ---------------- 4. 切标签页再切回来也记得位置 ---------------- */
  console.log('\n-- 切标签页再切回来 --');
  await setScroll(450);
  await sleep(400);
  const beforeSwap = await scrollTop();
  await tab('校友圈');
  await tab('课程');
  const afterSwap = await scrollTop();
  check('切走再切回，课程页仍在刚才的位置',
    Math.abs(afterSwap - beforeSwap) <= 40, `${beforeSwap} → ${afterSwap}`);

  /* ---------------- 5. 图书馆收藏跨页一致 ---------------- */
  console.log('\n-- 图书馆收藏 → 我的页计数 → 切回来 --');
  if (!await fresh()) throw new Error('启动超时');
  await tab('图书馆');
  const favState = () => page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
      .filter(x => ['收藏', '取消收藏'].includes(x.getAttribute('aria-label') || ''));
    return { total: btns.length, faved: btns.filter(x => x.getAttribute('aria-label') === '取消收藏').length };
  });
  const fav0 = await favState();
  check('前提：图书馆列出了书，且一开始没有收藏', fav0.total > 0 && fav0.faved === 0, JSON.stringify(fav0));

  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(x => x.getAttribute('aria-label') === '收藏')?.click());
  await sleep(1200);
  const fav1 = await favState();
  const failToast = await page.evaluate(() => document.body.innerText.includes('收藏失败'));
  check('点一下收藏，星星确实填上且没有报错', fav1.faved === 1 && !failToast, JSON.stringify(fav1));

  await tab('我的');
  const profileCount = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const m = /^(\d+)\s*收藏图书$/.exec((b.innerText || '').replace(/\s+/g, ' ').trim());
      if (m) return Number(m[1]);
    }
    return -1;
  });
  check('★「我的」页的「收藏图书」对得上刚才收的那本',
    profileCount === fav1.faved, `我的页=${profileCount} 图书馆=${fav1.faved}`);

  await tab('图书馆');
  const fav2 = await favState();
  check('★ 切走再切回图书馆，收藏还在',
    fav2.faved === fav1.faved, `${fav1.faved} → ${fav2.faved}`);

  /* ---------------- 6. 课程进度跨页一致 ---------------- */
  console.log('\n-- 课程进度：详情页 / 课程列表 / 我的页 --');
  if (!await fresh()) throw new Error('启动超时');
  await tab('课程');
  const withLessons = await page.evaluate(() => {
    for (const r of [...document.querySelectorAll('[role="button"]')]) {
      if (!/打开课程/.test(r.getAttribute('aria-label') || '')) continue;
      const m = /(\d+)\s*课时/.exec(r.innerText || '');
      if (m && Number(m[1]) > 2) return r.querySelector('h4')?.innerText?.trim() || null;
    }
    return null;
  });
  check('前提：找得到一门有多个课时的课', !!withLessons, withLessons ?? '没有');
  if (withLessons) {
    const openByTitle = (t) => page.evaluate(x => {
      [...document.querySelectorAll('[role="button"]')]
        .find(r => (r.getAttribute('aria-label') || '').includes(x))?.click();
    }, t);
    const lessonCount = () => page.evaluate(() => {
      const m = /(\d+)\/(\d+)\s*课时/.exec(document.body.innerText);
      return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
    });

    await openByTitle(withLessons);
    await sleep(1800);
    const before = await lessonCount();
    check('前提：详情页显示 x/y 课时', !!before, JSON.stringify(before));

    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(x => (x.getAttribute('aria-label') || '') === '标记为已完成')?.click());
    await sleep(900);
    const after = await lessonCount();
    check('标记一课完成，详情页的计数 +1',
      !!after && !!before && after.done === before.done + 1,
      `${before?.done}/${before?.total} → ${after?.done}/${after?.total}`);

    // 在「更多操作」里收藏，这门课才会进「我的」页的我的学习
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(x => (x.getAttribute('aria-label') || '') === '更多操作')?.click());
    await sleep(700);
    const favedInDetail = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /收藏课程/.test(x.innerText || ''));
      b?.click(); return !!b;
    });
    check('详情页的「更多操作」里能收藏这门课', favedInDetail);
    await sleep(900);
    await back();

    const expectPct = after && after.total ? Math.round((after.done / after.total) * 100) : -1;
    const rowPct = await page.evaluate(x => {
      const r = [...document.querySelectorAll('[role="button"]')]
        .find(q => (q.getAttribute('aria-label') || '').includes(x));
      if (!r) return null;
      const bar = r.querySelector('[role="progressbar"]');
      return bar ? Number(bar.getAttribute('aria-valuenow')) : null;
    }, withLessons);
    check('★ 课程列表那一行显示学习进度，且与详情页一致',
      rowPct === expectPct, `列表 ${rowPct}% · 详情 ${after?.done}/${after?.total}=${expectPct}%`);

    await tab('我的');
    const profilePct = await page.evaluate(x => {
      const txt = document.body.innerText.replace(/\s+/g, ' ');
      const i = txt.indexOf(x);
      if (i < 0) return null;
      const m = /(\d+)%/.exec(txt.slice(i, i + 40));
      return m ? Number(m[1]) : null;
    }, withLessons);
    check('★「我的」页的收藏课程进度与详情页一致',
      profilePct === expectPct, `我的页 ${profilePct}% · 详情 ${expectPct}%`);

    await tab('课程');
    await openByTitle(withLessons);
    await sleep(1800);
    const again = await lessonCount();
    check('★ 切页再进详情页，已完成的课时还在',
      !!again && !!after && again.done === after.done,
      `${after?.done} → ${again?.done}`);
  }

  check('全程无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail || anyFatal ? 1 : 0);
