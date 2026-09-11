/**
 * 「我的」与「图书馆」两页的触控目标尺寸与输入框可访问名称 —— 本地实测验证。
 *
 * ## 缺陷
 *
 * 两页上一批真实可点的控件，热区远低于平台最小值
 * （Apple HIG 44×44pt · Material 48×48dp，本脚本按较松的 44 判定）：
 *
 *   我的 · 设置齿轮            p-2 + 22px 图标      ≈ 38×38
 *   我的 · 编辑资料徽章        p-1.5 + 12px 图标    ≈ 28×28
 *   我的 · 开始评估 / 查看档案  text-[11px] 纯文字   ≈ 56×17
 *   我的 · 全部课程            text-[11px] 纯文字   ≈ 56×17
 *   我的 · 编辑资料弹窗关闭     p-2 + 18px 图标      ≈ 34×34（且无可访问名称）
 *   图书馆 · 收藏 ×N           p-2 + 18px 图标      ≈ 34×34
 *   图书馆 · 清除搜索          p-1 + 14px 图标      ≈ 22×22（且无可访问名称）
 *   图书馆 · AI 发送           p-2.5 + 20px 图标    ≈ 40×40
 *
 * 另有两个输入框只有 placeholder —— 一旦开始输入 placeholder 就消失，
 * 读屏用户此后再也拿不到这个框是干什么的：
 *
 *   图书馆 · 顶部搜索框        placeholder="搜索书名、作者或神学主题..."
 *   图书馆 · AI 提问框         placeholder="输入你的神学问题..."
 *
 * ## 判定方式（不是量 getBoundingClientRect）
 *
 * 真手指按下去能不能中，取决于 **hit-testing**，不是元素的可视盒子：
 * 伪元素扩热区、被别的元素盖住、pointer-events —— 这些 rect 都看不出来。
 * 所以本脚本从可视中心出发，沿四个方向逐像素调用 `document.elementFromPoint`，
 * 只要命中的还是该元素（或其后代）就继续扩，得到**真实热区**。
 *
 * 由此还免费得到「热区不重叠」的判据：`elementFromPoint` 每个点只返回一个
 * 最上层元素，所以只要每个可交互元素在自己可视中心上命中的仍是自己，
 * 就说明没有任何人的热区把邻居的中心抢走。这一条对全页所有可交互元素都查。
 *
 * ## 修法
 *
 * 绝对定位的图标按钮用 `before:` 透明伪元素向外扩（零视觉、零布局变化）；
 * 流内元素直接给 `min-w/min-h` 或 padding + 等量负 margin（布局高度不变）。
 * 两个输入框补 `aria-label`。不碰搜索逻辑、收藏逻辑、AI 逻辑。
 *
 * 跑法：node scripts/verify-touch-targets.mjs
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

/** 只报告不判定的模式：用来抓「修复前」基线。 */
const BASELINE = process.argv.includes('--baseline');
const MIN = 44;

let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => {
  if (BASELINE) { console.log(`  ${ok ? 'ok  ' : 'BAD '} ${name}${detail ? ' — ' + detail : ''}`); return; }
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const port = await new Promise((res, rej) => {
  const s = net.createServer(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

// 与既有 UI 回归脚本同一套：起 vite dev。本轮两页在没有后端时也能完整渲染
// —— 图书馆走 FALLBACK_BOOKS，个人页走本地 mock 登录记录。
// 不连后端、不创建真实身份、不碰 live 配置、不碰 canonical SQLite。
const vite = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let viteOut = '';
vite.stdout.on('data', c => { viteOut += c.toString(); });
vite.stderr.on('data', c => { viteOut += c.toString(); });

const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60 && !viteOut.includes('ready in'); i++) await sleep(500);

/* ---------- 注入页面的量测工具 ---------- */
const PROBE = `
window.__tt = {
  /** 元素或其后代？hit-testing 命中后代也算命中这个控件。 */
  owns(el, p) { let n = p; while (n) { if (n === el) return true; n = n.parentElement; } return false; },

  /**
   * 真实热区：从可视中心沿四向逐像素 elementFromPoint 扩张。
   * 返回 null 表示连自己的中心都命中不到（被别的东西盖住了）。
   */
  hit(el, max = 48) {
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const at = (x, y) => {
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
      const p = document.elementFromPoint(x, y);
      return !!p && window.__tt.owns(el, p);
    };
    if (!at(cx, cy)) {
      const p = (cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight)
        ? document.elementFromPoint(cx, cy) : null;
      return {
        blocked: true, cx, cy,
        by: p ? ((p.getAttribute('aria-label') || (p.innerText || '').trim().slice(0, 14) || p.tagName)) : '视口外',
        byChain: (() => { const c = []; let n = p; while (n && c.length < 6) { c.push(n.tagName + (n.disabled ? '[disabled]' : '')); n = n.parentElement; } return c.join('<'); })(),
        meDisabled: !!el.disabled,
        visualW: Math.round(r.width), visualH: Math.round(r.height),
      };
    }
    const grow = (dx, dy) => { let k = 0; while (k < max && at(cx + dx * (k + 1), cy + dy * (k + 1))) k++; return k; };
    const l = grow(-1, 0), rt = grow(1, 0), t = grow(0, -1), b = grow(0, 1);
    return {
      w: l + rt + 1, h: t + b + 1,
      visualW: Math.round(r.width), visualH: Math.round(r.height),
      cx, cy,
    };
  },

  /** 可交互且真的看得见（在视口内、没被 opacity/visibility 关掉、在 tab 序里）。 */
  interactives() {
    const sel = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll(sel)].filter(el => {
      if (el.disabled) return false;
      if (el.tabIndex < 0) return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
      /* 横向滚出屏幕的（轮播的非当前页、横滚 chip 条的后半截）现在压根
         没呈现给用户，此刻量不出热区也不该判它红。轮播的 CTA 另有
         专门一段把每张幻灯片切出来单独量。 */
      if (r.right <= 0 || r.left >= window.innerWidth) return false;
      const cs = getComputedStyle(el);
      return cs.opacity !== '0' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
    });
  },

  /** 可访问名称（本页用得到的那几种来源）。 */
  name(el) {
    const aria = (el.getAttribute('aria-label') || '').trim();
    if (aria) return aria;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\\s+/).map(id => document.getElementById(id)).filter(Boolean)
        .map(n => (n.innerText || n.textContent || '').trim()).join(' ').trim();
      if (t) return t;
    }
    if (el.id) {
      const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) { const t = (lab.innerText || '').trim(); if (t) return t; }
    }
    const wrap = el.closest('label');
    if (wrap) { const t = (wrap.innerText || '').trim(); if (t) return t; }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return '';
    const t = (el.innerText || '').trim().replace(/\\s+/g, ' ');
    if (t) return t;
    const title = (el.getAttribute('title') || '').trim();
    return title;
  },

  /** 贴着视口底边的那条固定标签栏的矩形。没有就返回 null。 */
  bottomBar() {
    const el = [...document.querySelectorAll('body *')].find(e => {
      if (getComputedStyle(e).position !== 'fixed') return false;
      const r = e.getBoundingClientRect();
      return r.height > 20 && r.height < 200
        && Math.abs(r.bottom - window.innerHeight) < 2
        && r.width > window.innerWidth * 0.8;
    });
    return el ? { el, r: el.getBoundingClientRect() } : null;
  },

  /** 最上层的全屏固定浮层（两个弹窗都是 fixed inset-0）。没有就返回 null。 */
  modalRoot() {
    const hits = [...document.querySelectorAll('body *')].filter(el => {
      if (getComputedStyle(el).position !== 'fixed') return false;
      const r = el.getBoundingClientRect();
      return r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2;
    });
    return hits.length ? hits[hits.length - 1] : null;
  },

  /** 真正在滚的那个容器：本 App 滚的是 <main class="overflow-y-auto">，不是 window。 */
  scroller() {
    const m = document.querySelector('main');
    if (m && m.scrollHeight > m.clientHeight + 4) return m;
    return document.scrollingElement || document.documentElement;
  },

  /** 跨滚动位置认元素用的路径签名。 */
  sig(el) {
    const parts = [];
    let n = el;
    while (n && n.tagName !== 'BODY' && parts.length < 6) {
      const p = n.parentElement;
      parts.unshift(n.tagName + ':' + (p ? [...p.children].indexOf(n) : 0));
      n = p;
    }
    return parts.join('/');
  },

  /** 当前滚动位置下每个可交互元素的热区。 */
  sweepOnce() {
    const out = [];
    for (const el of window.__tt.interactives()) {
      const h = window.__tt.hit(el);
      out.push({
        sig: window.__tt.sig(el),
        name: (window.__tt.name(el) || el.tagName).slice(0, 20),
        w: h.blocked ? 0 : h.w,
        h: h.blocked ? 0 : h.h,
        vw: h.visualW, vh: h.visualH,
        box: 'x' + Math.round(el.getBoundingClientRect().left)
           + '..' + Math.round(el.getBoundingClientRect().right),
        cls: (typeof el.className === 'string' ? el.className : '').split(/\s+/).slice(0, 3).join('.'),
      });
    }
    return out;
  },

  byLabel(label) {
    return window.__tt.interactives().find(el => window.__tt.name(el) === label) || null;
  },
  byText(re) {
    const rx = new RegExp(re);
    return window.__tt.interactives().find(el => rx.test(window.__tt.name(el))) || null;
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
  await page.evaluate(() => localStorage.setItem('amas_current_user', JSON.stringify({
    id: 'touch-local', name: '本地验证', email: 'touch@example.com', role: 'student',
  })));

  /** 量一个控件：热区尺寸 + 可访问名称。 */
  const measure = (label, byText = false) => page.evaluate((l, bt) => {
    const el = bt ? window.__tt.byText(l) : window.__tt.byLabel(l);
    if (!el) return { missing: true };
    const h = window.__tt.hit(el);
    return { missing: false, name: window.__tt.name(el), hit: h, tag: el.tagName };
  }, label, byText);

  /**
   * 每个可交互元素在自己可视中心上命中的还是不是自己。
   * `inModal` 时只查最上层弹窗内部 —— 弹窗本来就该把背后整页盖住，
   * 把背景控件算成「被抢」是把正确的模态行为当缺陷。
   */
  const centerOwnership = (inModal = false) => page.evaluate((scoped) => {
    const root = scoped ? window.__tt.modalRoot() : null;
    if (scoped && !root) return [{ me: '(找不到弹窗根)', thief: '-' }];
    const bar = scoped ? null : window.__tt.bottomBar();
    const stolen = [];
    for (const el of window.__tt.interactives()) {
      if (root && !root.contains(el)) continue;
      const r = el.getBoundingClientRect();
      /* 只判定完整落在视口内的控件。露出半截的列表项，其几何中心本来就可能
         落在固定标签栏底下 —— 那是「还没滚到」，不是热区抢占。 */
      if (r.top < 0 || r.bottom > window.innerHeight) continue;
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      if (cx < 0 || cx >= window.innerWidth) continue;
      /* 常驻的底部标签栏本来就压在页面内容上，页面也为此留了 pb-24 ——
         当前滚动位置恰好落到栏下的列表项，往下滚一点就露出来了。
         那是滚动位置问题，不是谁的热区把谁抢走，本脚本不拿它判定。 */
      if (bar && !bar.el.contains(el) && cy >= bar.r.top && cy <= bar.r.bottom) continue;
      const p = document.elementFromPoint(cx, cy);
      if (!p || !window.__tt.owns(el, p)) {
        stolen.push({
          me: window.__tt.name(el).slice(0, 16) || el.tagName,
          thief: p ? (window.__tt.name(p).slice(0, 16) || p.tagName) : 'null',
        });
      }
    }
    return stolen;
  }, inModal);

  /* 只在底部标签栏里找，别在整页里找：页面上还有别的按钮文字以「课程」结尾，
     整页 find 会点中它们并跳到另一个视图（本轮就因此把一个别处的返回键
     算到了课程页头上）。 */
  const gotoTab = async (label) => {
    await page.evaluate(l => {
      const bar = window.__tt.bottomBar();
      const b = [...(bar ? bar.el : document).querySelectorAll('button')]
        .find(x => (x.innerText || '').trim().endsWith(l));
      b?.click();
    }, label);
    await sleep(1200);
  };

  const waitForApp = async (max = 90) => {
    for (let i = 0; i < max; i++) {
      const ready = await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => (b.innerText || '').trim().endsWith('校友圈')));
      if (ready) return true;
      await sleep(1000);
    }
    return false;
  };

  /* 每段都从整页重载进入。上一段留下的弹窗会挡住底部标签栏，
     只靠点 tab 切换会把后面所有断言连环带红（本轮第一版就这样）。 */
  const openPage = async (tab) => {
    await page.goto(base, { waitUntil: 'networkidle2' });
    if (!await waitForApp()) return false;
    await gotoTab(tab);
    return true;
  };

  /**
   * 把一页从头滚到底，记录每个可交互元素在**任一**滚动位置上是否完整可点。
   *
   * 判据是「存在某个滚动位置能完整点到」，不是「每个位置都能点到」。
   * 吸顶栏、底部标签栏、右下角客服浮标在某一刻压住某个按钮**不是缺陷** ——
   * 往下滚一点就露出来了，页面也为此留了 pb-24。
   * 从头滚到尾都点不到，才是真的点不到。
   */
  const sweepTab = async (tab) => {
    if (!await openPage(tab)) return null;
    const max = await page.evaluate(() => {
      const s = window.__tt.scroller();
      return Math.max(0, s.scrollHeight - s.clientHeight);
    });
    const best = new Map();
    for (let y = 0; y <= max + 160; y += 160) {
      await page.evaluate(v => { window.__tt.scroller().scrollTop = v; }, Math.min(y, max));
      await sleep(340);
      for (const r of await page.evaluate(() => window.__tt.sweepOnce())) {
        const prev = best.get(r.sig);
        const okNow = r.w >= MIN && r.h >= MIN;
        if (!prev) { best.set(r.sig, { ...r, ok: okNow }); continue; }
        if (prev.ok) continue;
        if (okNow) { best.set(r.sig, { ...r, ok: true }); continue; }
        // 都没达标时留下最接近的那次，报告里好定位。
        if (Math.min(r.w, r.h) > Math.min(prev.w, prev.h)) best.set(r.sig, { ...r, ok: false });
      }
    }
    return { max, seen: best.size, bad: [...best.values()].filter(r => !r.ok) };
  };

  const size = m => m.missing ? '缺失'
    : !m.hit ? '量不到'
      : m.hit.blocked
        ? `中心 (${m.hit.cx},${m.hit.cy}) 被「${m.hit.by}」挡住 [${m.hit.byChain}] self.disabled=${m.hit.meDisabled}（可视 ${m.hit.visualW}×${m.hit.visualH}）`
        : `热区 ${m.hit.w}×${m.hit.h}（可视 ${m.hit.visualW}×${m.hit.visualH}）`;
  const big = m => !m.missing && !!m.hit && !m.hit.blocked && m.hit.w >= MIN && m.hit.h >= MIN;

  for (const width of [320, 375]) {
    console.log(`\n${'='.repeat(52)}\n视口 ${width}px\n${'='.repeat(52)}`);
    await page.setViewport({ width, height: 720, isMobile: true, hasTouch: true });
    // 上一个视口把离线横幅 dismiss 掉了，那是持久化的。每个视口都从「没关过」重来。
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('amas_offline_notice_dismissed'));
    await page.goto(base, { waitUntil: 'networkidle2' });
    if (!await waitForApp()) { console.error('App 未能在 90 秒内离开启动页'); anyFatal = true; break; }

    /* Tailwind 走 play CDN，而且是靠 MutationObserver 异步补 CSS 的 ——
       临时插一个 div 立刻量会量到未编译状态（本轮第一版脚本就这么假红过一次）。
       改成量页面上本来就存在、且尺寸唯一确定的既有类。 */
    const twOk = await page.evaluate(() => {
      const avatar = document.querySelector('.w-20.h-20');
      if (avatar) return Math.round(avatar.getBoundingClientRect().width) === 80;
      const pad = document.querySelector('.pb-24');
      return !!pad && getComputedStyle(pad).paddingBottom === '96px';
    });
    check('前提：Tailwind 已生效（既有 w-20 / pb-24 量得到）', twOk);
    if (!twOk) { anyFatal = true; break; }

    /* ------------- 离线横幅（没有后端时它浮在每一页上） ------------- */
    console.log('\n-- 离线横幅 --');
    const bannerShown = await page.evaluate(() =>
      document.body.innerText.includes('当前为本地模式'));
    check('前提：无后端时离线横幅出现', bannerShown);
    if (bannerShown) {
      const okBtn = await measure('知道了', false);
      check(`离线横幅 · 关闭键热区 ≥ ${MIN}×${MIN}`, big(okBtn), size(okBtn));
    }
    /* 后面两页不再让它参与。它是 z-[80] 固定浮层，会盖住底部空状态按钮的中心，
       那是「无后端」这个测试前提带来的遮挡，不是本轮要改的东西 ——
       用它自己的 dismiss 键持久化，与真人点一次「知道了」完全等价。 */
    await page.evaluate(() => localStorage.setItem('amas_offline_notice_dismissed', '1'));

    /* ---------------- 我的 ---------------- */
    console.log('\n-- 我的 --');
    if (!await openPage('我的')) { anyFatal = true; break; }
    const onProfile = await page.evaluate(() => document.body.innerText.includes('我的事奉倾向'));
    check('前提：停在「我的」页', onProfile);

    const profileTargets = [
      ['设置', false],
      ['编辑资料', false],
      ['^(开始评估|查看档案)', true],
      ['^全部课程', true],
    ];
    for (const [label, byText] of profileTargets) {
      const m = await measure(label, byText);
      check(`我的 · ${m.missing ? label : m.name} 热区 ≥ ${MIN}×${MIN}`, big(m), size(m));
    }

    let stolen = await centerOwnership();
    check('我的 · 没有任何控件的可视中心被别人的热区抢走',
      stolen.length === 0,
      stolen.length ? stolen.map(s => `${s.me}←${s.thief}`).join(' · ') : `全部 ${await page.evaluate(() => window.__tt.interactives().length)} 个自持`);

    // 键盘：文字型入口必须能聚焦并用 Enter 激活（它是去「定制化神学」的唯一入口）。
    const kb = await page.evaluate(() => {
      const el = window.__tt.byText('^(开始评估|查看档案)');
      if (!el) return 'missing';
      el.focus();
      return document.activeElement === el || el.contains(document.activeElement) ? 'focused' : 'focus-failed';
    });
    check('我的 · 事奉倾向入口可聚焦', kb === 'focused', kb);
    if (kb === 'focused') {
      await page.keyboard.press('Enter');
      await sleep(1200);
      const navigated = await page.evaluate(() => !document.body.innerText.includes('我的事奉倾向'));
      check('我的 · Enter 能激活该入口（离开个人页）', navigated);
      if (!await openPage('我的')) { anyFatal = true; break; }
    }

    /* 编辑资料弹窗的关闭键。修复前它没有 aria-label，所以按结构找：
       标题 h3「编辑资料」那一行里的唯一按钮。 */
    await page.evaluate(() => window.__tt.byLabel('编辑资料')?.click());
    await sleep(900);
    const modalOpen = await page.evaluate(() =>
      [...document.querySelectorAll('h3')].some(h => (h.innerText || '').trim() === '编辑资料'));
    check('我的 · 编辑资料弹窗已打开', modalOpen);
    if (modalOpen) {
      const closeM = await page.evaluate(() => {
        const h = [...document.querySelectorAll('h3')].find(x => (x.innerText || '').trim() === '编辑资料');
        const btn = h?.parentElement?.querySelector('button');
        if (!btn) return { missing: true };
        return { missing: false, name: window.__tt.name(btn), hit: window.__tt.hit(btn) };
      });
      check(`我的 · 编辑资料弹窗关闭键有可访问名称`,
        !closeM.missing && !!closeM.name, closeM.missing ? '找不到' : `name="${closeM.name}"`);
      check(`我的 · 编辑资料弹窗关闭键热区 ≥ ${MIN}×${MIN}`, big(closeM), size(closeM));
      const s2 = await centerOwnership(true);
      check('我的 · 弹窗内没有控件中心被抢走', s2.length === 0,
        s2.length ? s2.map(s => `${s.me}←${s.thief}`).join(' · ') : '弹窗内全部自持');
      // 关闭键必须真的关得掉（扩热区不能把 onClick 弄丢）
      await page.evaluate(() => {
        const h = [...document.querySelectorAll('h3')].find(x => (x.innerText || '').trim() === '编辑资料');
        h?.parentElement?.querySelector('button')?.click();
      });
      await sleep(800);
      const closed = await page.evaluate(() =>
        ![...document.querySelectorAll('h3')].some(h => (h.innerText || '').trim() === '编辑资料'));
      check('我的 · 点击关闭键确实关闭了弹窗', closed);
    }

    /* ---------------- 图书馆 ---------------- */
    console.log('\n-- 图书馆 --');
    if (!await openPage('图书馆')) { anyFatal = true; break; }
    const onLibrary = await page.evaluate(() => document.body.innerText.includes('AMAS 电子图书馆'));
    check('前提：停在「图书馆」页', onLibrary);

    const searchName = await page.evaluate(() => {
      const el = [...document.querySelectorAll('input')]
        .find(i => (i.getAttribute('placeholder') || '').includes('搜索书名'));
      return el ? { name: window.__tt.name(el), placeholder: el.placeholder } : null;
    });
    check('图书馆 · 搜索框有可访问名称（placeholder 不算）',
      !!searchName && searchName.name.length > 0,
      searchName ? `name="${searchName.name}"` : '找不到搜索框');

    const favM = await measure('^(收藏|取消收藏)$', true);
    check(`图书馆 · 收藏键热区 ≥ ${MIN}×${MIN}`, big(favM), size(favM));

    // 清除键只在有输入时出现
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('input')]
        .find(i => (i.getAttribute('placeholder') || '').includes('搜索书名'));
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '神');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(900);
    /* 清除键修复前没有 aria-label，按结构找：搜索框那个 .relative 容器里的唯一按钮。 */
    const clearM = await page.evaluate(() => {
      const input = [...document.querySelectorAll('input')]
        .find(i => (i.getAttribute('placeholder') || '').includes('搜索书名'));
      const btn = input?.parentElement?.querySelector('button');
      if (!btn) return { missing: true };
      return { missing: false, name: window.__tt.name(btn), hit: window.__tt.hit(btn) };
    });
    check('图书馆 · 清除搜索键有可访问名称',
      !clearM.missing && !!clearM.name, clearM.missing ? '找不到' : `name="${clearM.name}"`);
    check(`图书馆 · 清除搜索键热区 ≥ ${MIN}×${MIN}`, big(clearM), size(clearM));

    stolen = await centerOwnership();
    check('图书馆 · 搜索框有输入时，没有控件中心被抢走',
      stolen.length === 0,
      stolen.length ? stolen.map(s => `${s.me}←${s.thief}`).join(' · ') : '全部自持');

    // 清除键点下去必须真的清空（伪元素扩热区不能把 onClick 弄丢）
    await page.evaluate(() => {
      const input = [...document.querySelectorAll('input')]
        .find(i => (i.getAttribute('placeholder') || '').includes('搜索书名'));
      input?.parentElement?.querySelector('button')?.click();
    });
    await sleep(700);
    const cleared = await page.evaluate(() => {
      const input = [...document.querySelectorAll('input')]
        .find(i => (i.getAttribute('placeholder') || '').includes('搜索书名'));
      return input ? input.value === '' : null;
    });
    check('图书馆 · 点击清除键确实清空了搜索框', cleared === true, `value=${JSON.stringify(cleared)}`);

    stolen = await centerOwnership();
    check('图书馆 · 没有任何控件的可视中心被别人的热区抢走',
      stolen.length === 0,
      stolen.length ? stolen.map(s => `${s.me}←${s.thief}`).join(' · ') : `全部 ${await page.evaluate(() => window.__tt.interactives().length)} 个自持`);

    // 收藏键点下去必须真的切到另一个状态（热区变大不能把 onClick 弄丢）
    const favBefore = await page.evaluate(() => window.__tt.byText('^(收藏|取消收藏)$')?.getAttribute('aria-label'));
    await page.evaluate(() => window.__tt.byText('^(收藏|取消收藏)$')?.click());
    await sleep(900);
    const favAfter = await page.evaluate(() => {
      const els = window.__tt.interactives().filter(e => /^(收藏|取消收藏)$/.test(window.__tt.name(e)));
      return els[0]?.getAttribute('aria-label');
    });
    check('图书馆 · 点击收藏键确实切换了状态',
      !!favBefore && !!favAfter && favBefore !== favAfter,
      `${favBefore} → ${favAfter}`);

    // AI 助教弹窗
    await page.evaluate(() => window.__tt.byText('AI 神学助教')?.click());
    await sleep(1000);
    const aiOpen = await page.evaluate(() => !!document.querySelector('input[placeholder*="神学问题"]'));
    check('图书馆 · AI 助教弹窗已打开', aiOpen);
    if (aiOpen) {
      const aiName = await page.evaluate(() => {
        const el = document.querySelector('input[placeholder*="神学问题"]');
        return el ? window.__tt.name(el) : null;
      });
      check('图书馆 · AI 提问框有可访问名称', !!aiName && aiName.length > 0, `name="${aiName}"`);
      // 发送键在输入为空时 disabled，先填一句再量。
      await page.evaluate(() => {
        const el = document.querySelector('input[placeholder*="神学问题"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, '什么是因信称义');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await sleep(500);
      /* 发送键修复前没有 aria-label，按结构找：提问框所在 form 里的 submit。 */
      const sendM = await page.evaluate(() => {
        const input = document.querySelector('input[placeholder*="神学问题"]');
        const btn = input?.closest('form')?.querySelector('button[type="submit"]');
        if (!btn) return { missing: true };
        return { missing: false, name: window.__tt.name(btn), hit: window.__tt.hit(btn) };
      });
      check('图书馆 · AI 发送键有可访问名称',
        !sendM.missing && !!sendM.name, sendM.missing ? '找不到' : `name="${sendM.name}"`);
      check(`图书馆 · AI 发送键热区 ≥ ${MIN}×${MIN}`, big(sendM), size(sendM));
      const s3 = await centerOwnership(true);
      check('图书馆 · AI 弹窗内没有控件中心被抢走', s3.length === 0,
        s3.length ? s3.map(s => `${s.me}←${s.thief}`).join(' · ') : '弹窗内全部自持');
    }

    /* ---------- 首页 · 招生轮播每一张的行动键 ---------- */
    console.log('\n-- 首页 · 招生轮播 --');
    if (!await openPage('首页')) { anyFatal = true; break; }
    const slideCount = await page.evaluate(() => {
      const h = document.querySelector('[aria-roledescription="carousel"]');
      const m = h && /\/\s*(\d+)\s*页/.exec(h.getAttribute('aria-label') || '');
      return m ? Number(m[1]) : 0;
    });
    check('前提：找得到招生轮播并知道页数', slideCount > 1, `${slideCount} 页`);
    if (slideCount > 1) {
      await page.evaluate(() => document.querySelector('[aria-roledescription="carousel"]')?.focus());
      const seenCta = [];
      for (let i = 0; i < slideCount; i++) {
        // 每张幻灯片切出来单独量；只有当前这张在屏幕上，量的才是真的。
        const cta = await page.evaluate(() => {
          const region = document.querySelector('[aria-roledescription="carousel"]');
          if (!region) return null;
          // 轮播容器自己 tabIndex=0，也在 interactives 里 —— 要的是它里面的按钮。
          const el = window.__tt.interactives()
            .find(x => x !== region && region.contains(x) && x.tagName === 'BUTTON');
          if (!el) return null; // 这一张是纯图片页，本来就没有行动键
          return { name: window.__tt.name(el).slice(0, 12), hit: window.__tt.hit(el) };
        });
        if (cta) seenCta.push(cta);
        await page.keyboard.press('ArrowRight');
        await sleep(800);
      }
      check(`首页 · 轮播里每一张的行动键热区 ≥ ${MIN}×${MIN}`,
        seenCta.length > 0 && seenCta.every(c => big(c)),
        seenCta.length
          ? seenCta.map(c => `${c.name} ${size(c)}`).join(' · ')
          : '轮播里没有可交互控件');
    }

    /* ---------- 首页 / 课程 / 校友圈：整页扫掠 ---------- */
    for (const tab of ['首页', '课程', '校友圈']) {
      const r = await sweepTab(tab);
      if (!r) { check(`${tab} · 能进入该页`, false, '导航失败'); anyFatal = true; continue; }
      check(`${tab} · 每个可交互控件都有一个滚动位置能完整点到（≥${MIN}×${MIN}）`,
        r.bad.length === 0,
        r.bad.length
          ? r.bad.map(b => `「${b.name}」${b.w}×${b.h}（可视 ${b.vw}×${b.vh} ${b.box} ${b.cls}）`).join(' · ')
          : `扫掠 ${r.max}px，共 ${r.seen} 个控件全部达标`);
    }
  }
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

if (BASELINE) { console.log('\n（baseline 模式，只报告不判定）'); process.exit(anyFatal ? 1 : 0); }
console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail || anyFatal ? 1 : 0);
