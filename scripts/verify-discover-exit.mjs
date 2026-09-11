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
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() =>
        document.activeElement?.classList?.contains('back-link') === true);
    }
    check('Tab 可聚焦到出口', reached);
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

  check('全程无 JS 运行时错误', errors.length === 0,
    errors.length ? errors.slice(0, 2).join(' | ') : '');
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
