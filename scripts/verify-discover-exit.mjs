/**
 * public/discover.html 的常驻出口 —— 本地实测验证。
 *
 * 背景：官网 `c99fcf3` 给 discover.html 加了「返回官网」出口，因为该页
 * `<a href>` 数为 0，进得去出不来。App 仓的 `public/discover.html` 在文件头
 * 声明为同源副本，需同步。
 *
 * ★ 与官网副本的**唯一**差异在目的地与文案，这也是本脚本最要紧的一条断言：
 *
 *     官网副本   href="index.html"  →「返回官网」   同级 index.html 是官网首页
 *     App 副本   href="/"           →「返回 App 首页」 同级 index.html 是 App 的 SPA 入口
 *
 * 照抄官网文案会把用户送回 App、却告诉他「回到官网」。目的地取自本页既有的
 * App 链接配置（`APP_LINK.url = "/"`，注释写明「回到 App 根路径」），
 * 而不是另立一套 —— App 侧也没有配置任何官网地址（只有展示用的 amas.edu 文本）。
 *
 * 用本仓既有的 puppeteer-core（与 5 个回归脚本同一套），不引入官网那套 CDP 器具。
 *
 * 跑法：node scripts/verify-discover-exit.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'public', 'discover.html');

const CHROME = process.env.CHROME_PATH
  || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`]
    .find(p => existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/**
 * 极小静态服务器：把 public/ 挂在根上，并把 `/` 映射到一个**可识别的**占位首页。
 *
 * 为什么不直接跑 Vite：本脚本要验的是「出口指向哪里」，不是 SPA 本身。
 * 用占位首页能让「真的导航到了 App 根路径」成为一条可断言的事实，
 * 而不是靠看 URL 猜。占位页的内容只在测试里存在，不进产品。
 */
function startServer(port) {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>APP ROOT</title><div id="root">APP_SPA_ROOT_MARKER</div>');
      return;
    }
    const file = path.join(ROOT, 'public', url.pathname);
    if (!file.startsWith(path.join(ROOT, 'public')) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

const port = await freePort();
const server = await startServer(port);
const base = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

const errors = [];
async function newPage(width = 375, height = 720) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, isMobile: width < 500, hasTouch: width < 500 });
  page.on('pageerror', e => errors.push(String(e)));
  return page;
}

try {
  console.log('\n-- 静态断言（源文件层面）--');
  {
    const src = readFileSync(PAGE, 'utf8');
    check('出口是真 <a href>，不是 button onclick',
      /<a class="back-link" href="\//.test(src),
      '真 <a> 才有原生键盘可达 / 中键新标签页 / 右键复制链接');
    // 只看**出口元素自身**的文案。整文件搜索会误伤说明注释 ——
    // 那段注释正是在解释「官网副本写返回官网、App 副本不能照抄」，
    // 它出现这四个字是应该的。
    const anchor = /<a class="back-link"[^>]*>([\s\S]*?)<\/a>/.exec(src)?.[1] ?? '';
    check('★ 出口文案不得照抄官网的「返回官网」',
      !anchor.includes('返回官网') && anchor.includes('返回 App 首页'),
      anchor.replace(/<[^>]+>/g, '').trim());
    check('★ 目的地与本页既有 App 链接配置一致',
      /href="\/"/.test(src) && /APP_LINK = \{ url: "\/"/.test(src),
      'href="/" 对齐 APP_LINK.url="/"（注释：回到 App 根路径）');
    check('App 特有资源路径未被官网副本覆盖',
      src.includes("IMG_BASE = '/images/archetypes/'") && !src.includes('assets/img/archetypes/'),
      '/images/… 保持不变');
    check('App 特有交接参数未被覆盖',
      src.includes('"app-discover"') && !src.includes('"website-discover"'));
    check('同步声明文件头仍在', src.includes('SOURCE OF TRUTH: amas-website/discover.html'));
  }

  console.log('\n-- 出口在四屏常驻 --');
  {
    const page = await newPage();
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });
    const visible = async () => page.$eval('.back-link', el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
    });
    const label = await page.$eval('.back-link', el => el.innerText.trim());
    check('★ 用户看到的文案是「返回 App 首页」', label.includes('返回 App 首页') && !label.includes('返回官网'), label);
    check('landing 可见', await visible());
    await page.evaluate(() => window.show('quiz'));
    check('quiz 可见', await visible());
    await page.evaluate(() => window.show('result'));
    check('result 可见', await visible());
    await page.evaluate(() => window.show('detail'));
    check('detail 可见', await visible());
    await page.close();
  }

  console.log('\n-- 移动端触控目标与布局 --');
  {
    const page = await newPage(375, 720);
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });
    const box = await page.$eval('.back-link', el => {
      const r = el.getBoundingClientRect();
      return { h: r.height, left: r.left, right: r.right };
    });
    check('触控目标高度 ≥ 44px', box.h >= 44, `实际 ${Math.round(box.h)}px`);
    check('375px 下不横向溢出', box.left >= 0 && box.right <= 375,
      `left=${Math.round(box.left)} right=${Math.round(box.right)}`);
    await page.close();
  }

  console.log('\n-- 结果页固定底栏不遮挡出口 --');
  {
    const page = await newPage(375, 720);
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.show('result'));
    const pad = await page.$eval('.site-exit', el => getComputedStyle(el).paddingBottom);
    check('结果页 padding-bottom 让开底栏', parseFloat(pad) >= 84, `实际 ${pad}`);
    const geo = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const a = document.querySelector('.back-link').getBoundingClientRect();
      const s = document.querySelector('.sticky-cta').getBoundingClientRect();
      return { linkBottom: a.bottom, stickyTop: s.top };
    });
    check('滚到底时出口仍在底栏之上', geo.linkBottom < geo.stickyTop,
      `link.bottom=${Math.round(geo.linkBottom)} < sticky.top=${Math.round(geo.stickyTop)}`);
    // 非结果页不应保留这个额外内边距
    await page.evaluate(() => window.show('landing'));
    const padLanding = await page.$eval('.site-exit', el => getComputedStyle(el).paddingBottom);
    check('非结果页恢复正常内边距', parseFloat(padLanding) < 84, `实际 ${padLanding}`);
    await page.close();
  }

  console.log('\n-- 键盘可达 --');
  {
    const page = await newPage(1280, 800);
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });
    /* 预算别卡太死：同源移植把原型条的 12 项从不可聚焦的 <img> 改成真 button 之后，
       首屏的 tab 序合理地变长了，原来 12 步的预算会把这条断言变成假红。
       要断言的是「出口键盘到得了」，不是「第几步到」，所以放宽并把实际步数报出来。 */
    let reached = false, steps = 0;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      steps = i + 1;
      reached = await page.evaluate(() =>
        document.activeElement?.classList?.contains('back-link') === true);
    }
    check('Tab 可聚焦到出口', reached, `第 ${steps} 次 Tab 命中`);
    if (reached) {
      const outline = await page.evaluate(() => {
        const cs = getComputedStyle(document.activeElement);
        return { style: cs.outlineStyle, width: cs.outlineWidth };
      });
      check(':focus-visible 有可见轮廓',
        outline.style !== 'none' && parseFloat(outline.width) >= 2,
        `${outline.style} ${outline.width}`);
    }
    await page.close();
  }

  console.log('\n-- ★ 结果页固定底栏下的键盘 / 查找滚动（官网 1ee9288 同步）--');
  {
    // 上面「结果页固定底栏不遮挡出口」那组只证明了**手动滚到文档底部**不被遮挡。
    // 但 Tab 聚焦、Ctrl+F 页内查找、#锚点跳转走的是浏览器自己发起的 scrollIntoView：
    // 它把元素边缘对齐到视口边缘，受 scroll-margin 约束，**与 padding 无关**，
    // 会直接越过 .site-exit 那段 84px 内边距。这条路径真人可达，必须单独证明。
    const page = await newPage(375, 720);
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.show('result'));
    await sleep(250);

    /** 一次性取回焦点状态与几何，避免多次往返造成状态漂移。 */
    const probe = () => page.evaluate(() => {
      const a = document.querySelector('.back-link');
      const s = document.querySelector('.sticky-cta');
      const sHidden = !s || s.classList.contains('hidden')
        || getComputedStyle(s).display === 'none';
      const r = a.getBoundingClientRect();
      return {
        focused: document.activeElement === a,
        bottom: r.bottom,
        stickyTop: sHidden ? null : s.getBoundingClientRect().top,
        screen: !document.getElementById('result').classList.contains('hidden') ? 'result' : 'other',
      };
    });
    const unobscured = r => r.stickyTop === null || r.bottom <= r.stickyTop + 0.5;
    const geo = r => `link.bottom=${Math.round(r.bottom)} sticky.top=${Math.round(r.stickyTop)}`;

    const r0 = await probe();
    check('R0 前置：确实在结果页且固定底栏可见',
      r0.screen === 'result' && r0.stickyTop !== null,
      `screen=${r0.screen} stickyTop=${r0.stickyTop === null ? 'hidden' : Math.round(r0.stickyTop)}`);

    // R1/R2 —— 从页顶按 Tab，让浏览器自己决定滚到哪里
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await sleep(250);
    let presses = 0, reached = false;
    for (let i = 1; i <= 80 && !reached; i++) {
      await page.keyboard.press('Tab');
      presses = i;
      reached = await page.evaluate(() =>
        document.activeElement?.classList?.contains('back-link') === true);
    }
    await sleep(300);
    const r1 = await probe();
    check('R1 结果页上 Tab 可达出口', reached && r1.focused, `按了 ${presses} 次`);
    check('R2 Tab 聚焦后不被固定底栏遮挡', unobscured(r1), geo(r1));

    // R3 —— 反向再正向的键盘往返。
    // 不能写成「按 Tab 离开再 Shift+Tab 回来」：出口是文档最后一个可聚焦元素，
    // 一次 Tab 就把焦点交给浏览器 UI，Shift+Tab 回来的是地址栏而不是页面。
    // 真实反向路径是：从出口 Shift+Tab 退到上一个控件，再 Tab 前进回来。
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await sleep(250);
    const back = await page.evaluate(() => {
      const a = document.activeElement;
      return {
        isLink: !!a && a.classList.contains('back-link'),
        tag: a ? a.tagName : 'none',
        inPage: !!a && a !== document.body,
      };
    });
    check('R3 Shift+Tab 反向退到页内上一个控件',
      !back.isLink && back.inPage, `now=${back.tag} isLink=${back.isLink}`);
    await page.keyboard.press('Tab');
    await sleep(300);
    const r3 = await probe();
    check('R3b Tab 正向回到出口', r3.focused, `focused=${r3.focused}`);
    check('R3c 键盘往返回来后仍不被遮挡', unobscured(r3), geo(r3));

    // R4 —— 页内查找的滚动代理：边缘对齐是最坏情况
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);
    await page.evaluate(() =>
      document.querySelector('.back-link').scrollIntoView({ block: 'end' }));
    await sleep(300);
    const r4 = await probe();
    check('R4 边缘对齐 scrollIntoView（查找代理）不被遮挡', unobscured(r4), geo(r4));

    // 同时断言**产生这个结果的机制**，而不只是几何数字 ——
    // 否则哪天规则被误删、数字恰好仍然合格时，测试会沉默地放行。
    const sm = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.back-link')).scrollMarginBottom));
    check('R4b 余量来自 scroll-margin-bottom（机制断言，非仅几何）',
      sm >= 60, `scroll-margin-bottom=${Math.round(sm)}px`);

    // 非结果页不该留这段余量（底栏藏起来时无需让位）
    await page.evaluate(() => window.show('landing'));
    await sleep(150);
    const smLanding = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.back-link')).scrollMarginBottom));
    check('R4c 非结果页不保留该余量', smLanding < 60, `${Math.round(smLanding)}px`);

    // R5 —— 键盘用户拿到焦点之后必须真的能走
    await page.evaluate(() => window.show('result'));
    await sleep(150);
    await page.focus('.back-link');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.keyboard.press('Enter'),
    ]);
    const landedText = await page.evaluate(() => document.body.innerText);
    check('R5 聚焦后按 Enter 真的激活并导航到 App 根',
      page.url() === `${base}/` && landedText.includes('APP_SPA_ROOT_MARKER'),
      page.url());
    await page.close();
  }

  console.log('\n-- 不影响答题行为 --');
  {
    const page = await newPage();
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.startQuiz());
    // 只点当前可见那一题的选项：#opts 里上一题的按钮仍在 DOM 中，
    // 程序化点击对隐藏元素照样生效，真人却点不到。
    const answerOne = () => page.evaluate(() => {
      const btn = [...document.querySelectorAll('#opts button')]
        .find(b => b.getBoundingClientRect().height > 0);
      if (btn) btn.click();
      return !!btn;
    });
    await answerOne(); await answerOne(); await answerOne();
    const before = await page.evaluate(() => window.answers.length);
    check('作答 3 题后进度为 3', before === 3, `answers.length=${before}`);
    await page.focus('.back-link');
    const after = await page.evaluate(() => window.answers.length);
    check('聚焦出口不清空进度', after === before, `仍为 ${after}`);
    await page.close();
  }

  console.log('\n-- 十题走完仍能出结果页 --');
  {
    const page = await newPage();
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.startQuiz());
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('#opts button')]
          .find(b => b.getBoundingClientRect().height > 0);
        if (btn) btn.click();
      });
    }
    const onResult = await page.evaluate(() =>
      !document.getElementById('result').classList.contains('hidden'));
    check('10 题后到达结果页', onResult);
    await page.close();
  }

  console.log('\n-- ★ 真实点击的落点 --');
  {
    const page = await newPage();
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });
    const href = await page.$eval('.back-link', a => a.href);
    check('解析后的 href 是 App 根路径', href === `${base}/`, href);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.click('.back-link'),
    ]);
    check('导航到 App 根路径', page.url() === `${base}/`, page.url());
    const landed = await page.evaluate(() => document.body.innerText);
    check('落在 App SPA 入口而不是官网',
      landed.includes('APP_SPA_ROOT_MARKER'),
      '占位首页标记命中');
    await page.close();
  }

  /* ================================================================
     同源移植验收：官网隔离分支 3faa1da / 16d893e 的焦点接管与进度语义

     这两个提交改的是官网副本；App 仓 public/discover.html 是同源副本，
     不移植就会带着旧版本（1ee9288 起就留着这条待办）。
     移植时只搬无障碍行为，App 专属的跳转与文案一律保留 ——
     上面那几段静态断言就是钉住这一点的。

     判定必须用**真实输入**：Puppeteer 的 page.click()/keyboard 走 CDP，
     是真的鼠标与键盘事件；页面内 element.click() 不会让按钮获得焦点，
     那样量到的是探针自己造出来的状态（官网那一轮在这件事上吃过亏）。
     ================================================================ */
  console.log('');
  console.log('-- ★ 移植验收：测验换题/换视图的焦点接管 --');
  {
    const page = await newPage();
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });

    /** 当前焦点落在哪个视图里（landing / quiz / result / detail），以及标签。 */
    const focusWhere = () => page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return { view: '(body)', tag: 'BODY', label: '' };
      const screen = a.closest('#landing, #quiz, #result, #detail');
      return {
        view: screen ? screen.id : '(不在任何视图里)',
        tag: a.tagName + (a.id ? '#' + a.id : ''),
        label: (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22),
      };
    });
    const progressState = () => page.evaluate(() => {
      const bar = document.querySelector('#quiz .bar');
      if (!bar) return null;
      return {
        role: bar.getAttribute('role'),
        now: bar.getAttribute('aria-valuenow'),
        max: bar.getAttribute('aria-valuemax'),
        text: bar.getAttribute('aria-valuetext'),
      };
    });
    /** 真键盘：Tab 到「开始快速探索」再按回车。 */
    const startByKeyboard = async () => {
      await page.evaluate(() => { document.activeElement?.blur(); });
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        const hit = await page.evaluate(() =>
          document.activeElement === document.querySelector('#landing .gold-btn'));
        if (hit) return true;
      }
      return false;
    };

    check('键盘能 Tab 到「开始快速探索」', await startByKeyboard());
    await page.keyboard.press('Enter');
    await sleep(400);
    let f = await focusWhere();
    check('★ 回车开始后焦点进入测验（不是掉回 body）',
      f.view === 'quiz', `${f.view} · ${f.tag}`);

    let pr = await progressState();
    check('★ 进度条有 progressbar 语义与「第几题」文字',
      !!pr && pr.role === 'progressbar' && pr.now === '0' && /第 1 题，共 \d+ 题/.test(pr.text || ''),
      JSON.stringify(pr));

    // 真键盘答一题：Tab 进选项再回车
    await page.keyboard.press('Tab');
    const onOption = await page.evaluate(() =>
      !!document.activeElement?.classList?.contains('opt'));
    check('从题卡 Tab 一次就落到选项按钮上', onOption);
    await page.keyboard.press('Enter');
    await sleep(400);
    f = await focusWhere();
    check('★ 键盘答一题后焦点仍在测验里（此前掉回 body）',
      f.view === 'quiz', `${f.view} · ${f.tag}`);
    pr = await progressState();
    check('★ 换题后进度语义同步到第 2 题',
      !!pr && pr.now === '1' && /第 2 题/.test(pr.text || ''), JSON.stringify(pr));

    // 真鼠标点「上一题」
    await page.click('#undoBtn');
    await sleep(400);
    f = await focusWhere();
    check('★ 点「上一题」后焦点仍在测验里', f.view === 'quiz', `${f.view} · ${f.tag}`);

    // 答完出结果
    const total = await page.evaluate(() => QS.length);
    for (let i = 0; i < total; i++) {
      const ok = await page.evaluate(() => {
        const b = document.querySelector('#opts .opt');
        if (!b) return false;
        b.click();       // 这里只为推进流程，焦点断言在下面用视图判定，不依赖点击是否移焦
        return true;
      });
      if (!ok) break;
      await sleep(120);
    }
    await sleep(500);
    f = await focusWhere();
    check('★ 答完出结果后焦点进入结果页（此前掉回 body）',
      f.view === 'result', `${f.view} · ${f.tag}`);

    await page.close();
  }

  console.log('');
  console.log('-- ★ 移植验收：12 个原型的键盘入口与详情焦点 --');
  {
    const page = await newPage();
    await page.goto(`${base}/discover.html`, { waitUntil: 'domcontentloaded' });

    const stripShape = await page.evaluate(() => {
      const strip = document.getElementById('strip');
      const kids = [...strip.children];
      return {
        n: kids.length,
        tags: [...new Set(kids.map(k => k.tagName))],
        focusable: kids.filter(k => k.tabIndex >= 0).length,
        named: kids.filter(k => (k.getAttribute('aria-label') || '').includes('查看倾向说明')).length,
      };
    });
    check('★ 原型条每一项都是可聚焦的 button 且有可访问名称',
      stripShape.n === 12 && stripShape.tags.length === 1 && stripShape.tags[0] === 'BUTTON'
      && stripShape.focusable === 12 && stripShape.named === 12,
      JSON.stringify(stripShape));

    // 真键盘：Tab 进原型条，焦点必须落在某一项上，而不是可滚动的容器
    await page.evaluate(() => {
      document.activeElement?.blur();
      document.getElementById('strip').scrollIntoView({ block: 'center' });
    });
    let onItem = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      onItem = await page.evaluate(() => {
        const a = document.activeElement;
        return !!a && a.tagName === 'BUTTON' && a.parentElement?.id === 'strip';
      });
      if (onItem) break;
    }
    check('★ Tab 能停在原型条的某一项上（此前只能停在可滚动容器 .strip 上）',
      onItem);

    if (onItem) {
      await page.keyboard.press('Enter');
      await sleep(500);
      const f = await page.evaluate(() => {
        const a = document.activeElement;
        const screen = a?.closest('#landing, #quiz, #result, #detail');
        return { view: screen ? screen.id : '(body)', tag: a ? a.tagName + (a.id ? '#' + a.id : '') : 'BODY' };
      });
      check('★ 回车打开倾向说明，且焦点进入详情页',
        f.view === 'detail', `${f.view} · ${f.tag}`);

      // 关闭详情：从首屏进来的，焦点该回「开始快速探索」
      await page.click('#detail .topbar .x');
      await sleep(500);
      const back = await page.evaluate(() => ({
        onLanding: !document.getElementById('landing').classList.contains('hidden'),
        isStart: document.activeElement === document.querySelector('#landing .gold-btn'),
      }));
      check('★ 关闭详情回到首屏，焦点交回「开始快速探索」',
        back.onLanding && back.isStart, JSON.stringify(back));
    }

    await page.close();
  }

  check('全程无 JS 运行时错误', errors.length === 0,
    errors.length ? errors.slice(0, 2).join(' | ') : '');
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
