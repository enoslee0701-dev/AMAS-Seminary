/**
 * 第三批私人记录的身份隔离 + 举报流程的诚实措辞（本地实测）。
 *
 * ## 这一批处理的五个键
 *
 * 监督定的判据是「设备偏好可以留在设备级，私人记录按人分」。逐个看下来，
 * **五个全是私人记录**：加入的群组、校友圈封面、下载过哪些课件、
 * 举报过哪门课、隐私开关。真正属于设备偏好的（语言、推送开关、
 * 各种「不再提示」标记）本轮刻意没动。
 *
 * ## 顺带修的一条不实
 *
 * 举报课程原来显示「已收到您的反馈 …… 我们将在 1–3 个工作日内核实并回复」。
 * 查过了：`backend/src/routes` 里只有房间范围的代祷分享举报，
 * **没有课程举报的通道**；那条记录全仓只有写、没有读，教务处收不到任何东西。
 * 安全相关的路径上这么说尤其不该 —— 举报有害内容的人会以为已经在处理了。
 *
 * 全程只写浏览器 localStorage 里本流程用到的键，**不连后端、不碰真实数据**。
 *
 * 跑法：node scripts/verify-personal-records-identity.mjs
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

const KEYS = ['amas_joined_groups', 'amas_feed_cover', 'amas_downloaded_files',
  'amas_course_reports', 'amas_privacy'];
const scoped = (base, id) => `${base}:user:${id}`;

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
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 140)));
  await page.setViewport({ width: 375, height: 720, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  const loadAs = async (id, name) => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([i, n]) => {
      localStorage.setItem('amas_current_user', JSON.stringify({
        id: i, name: n, email: i + '@example.com', role: 'student' }));
      localStorage.setItem('amas_offline_notice_dismissed', '1');
    }, [id, name]);
    await page.goto(base, { waitUntil: 'networkidle2' });
    for (let i = 0; i < 90; i++) {
      if (await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => (b.innerText || '').trim().endsWith('校友圈')))) return true;
      await sleep(1000);
    }
    check(`前提：以「${name}」加载应用`, false, '等了 90 秒仍没起来');
    return false;
  };
  const wipe = () => page.evaluate((keys) => {
    for (const k of Object.keys(localStorage)) {
      if (keys.some(base => k.startsWith(base))) localStorage.removeItem(k);
    }
  }, KEYS);
  const tab = async (t) => {
    await page.evaluate(l => {
      const bar = [...document.querySelectorAll('body *')].find(e => {
        if (getComputedStyle(e).position !== 'fixed') return false;
        const r = e.getBoundingClientRect();
        return r.height > 20 && r.height < 200
          && Math.abs(r.bottom - window.innerHeight) < 2
          && r.width > window.innerWidth * 0.8;
      });
      [...(bar || document).querySelectorAll('button')]
        .find(x => (x.innerText || '').trim().endsWith(l))?.click();
    }, t);
    await sleep(1400);
  };
  const clickTxt = (t) => page.evaluate(x => {
    const b = [...document.querySelectorAll('button')]
      .find(e => (e.innerText || '').trim() === x);
    b?.click(); return !!b;
  }, t);
  const raw = (k) => page.evaluate(key => localStorage.getItem(key), k);

  /* ---------------- 1. 隐私开关按身份分 ---------------- */
  console.log('-- 1 · 隐私开关 --');
  await loadAs('userA', '甲');
  await wipe();
  await loadAs('userA', '甲');

  /* 「我的」是懒加载的，首次进去可能还没挂上来 —— 固定 sleep 会随机失败
     （第一版就是这样：同一段代码这次绿下次红）。改成轮询等到目标出现。 */
  const waitFor = async (pred, tries = 20) => {
    for (let i = 0; i < tries; i++) {
      if (await page.evaluate(pred)) return true;
      await sleep(500);
    }
    return false;
  };
  const openPrivacy = async () => {
    await tab('我的');
    /* 「设置」是右上角那个**纯图标钮**（aria-label="设置"），不是一行文字 ——
       第一版按 innerText 找，永远找不到，面板根本没打开。 */
    await waitFor(() => [...document.querySelectorAll('button')]
      .some(b => (b.getAttribute('aria-label') || '') === '设置'));
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '') === '设置')?.click());
    await waitFor(() => [...document.querySelectorAll('button')]
      .some(b => (b.innerText || '').trim() === '隐私设置'));
    await clickTxt('隐私设置');
    return waitFor(() => document.body.innerText.includes('允许私信'));
  };
  check('前提：能打开隐私设置', await openPrivacy());
  check('★ 面板说明了这些选项只保存在本机、按身份分开',
    await page.evaluate(() => document.body.innerText.includes('按登录身份分开存放')));

  /* 拨一个开关。选择器要取**最贴近那一行**的容器 ——
     第一版用 `div.innerText.startsWith('允许私信')` 会命中整块面板，
     它的第一个 button 是返回键，一点就跳走了。 */
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')]
      .filter(d => (d.innerText || '').startsWith('允许私信') && d.querySelector('button'));
    const row = rows[rows.length - 1];        // 最内层那个
    row?.querySelector('button')?.click();
  });
  await sleep(700);
  const pA = await raw(scoped('amas_privacy', 'userA'));
  check('★ 隐私选择落到按身份分的键上', !!pA, String(pA));
  check('★ 不再写不带身份的全局键', (await raw('amas_privacy')) === null);

  await loadAs('userB', '乙');
  await openPrivacy();
  const pB = await raw(scoped('amas_privacy', 'userB'));
  check('★ 乙不继承甲的隐私选择（乙自己那格还没有内容）', pB === null, String(pB));
  check('★ 甲那份原样还在', (await raw(scoped('amas_privacy', 'userA'))) === pA);

  /* ---------------- 2. 举报课程：措辞不再承诺有人处理 ---------------- */
  console.log('');
  console.log('-- 2 · 举报课程 --');
  await loadAs('userA', '甲');
  await tab('课程');
  await sleep(1200);
  await page.evaluate(() => [...document.querySelectorAll('[role="button"]')]
    .find(x => /打开课程/.test(x.getAttribute('aria-label') || ''))?.click());
  await sleep(2000);
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(b => (b.getAttribute('aria-label') || '') === '更多操作')?.click());
  await sleep(800);
  /* 菜单里那一项叫「报告问题」，不叫「举报」—— 第一版按「举报」找，
     根本没点开弹窗，后面一串断言全是在空页面上跑的。 */
  const openedReport = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => /报告问题/.test((x.innerText || '').trim()));
    b?.click(); return !!b;
  });
  check('前提：能打开举报弹窗', openedReport);
  await sleep(900);

  const beforeText = await page.evaluate(() => document.body.innerText);
  check('★ 选原因这一步就说清楚还没接通受理通道',
    /还没有接通受理通道/.test(beforeText) && !/教务处将在 1–3 个工作日内核实处理/.test(beforeText));

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => /内容不适|版权|质量|其他|不实/.test((x.innerText || '').trim()));
    b?.click();
  });
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(x => (x.innerText || '').trim() === '提交举报')?.click());
  await sleep(1200);

  const afterText = await page.evaluate(() => document.body.innerText);
  check('★ 提交后不说「已收到您的反馈」', !/已收到您的反馈/.test(afterText));
  check('★ 明说举报还没送出、教务处不会收到',
    /举报还没有送出/.test(afterText) && /不会/.test(afterText));
  check('★ 不再承诺「1–3 个工作日内核实并回复」', !/1–3 个工作日内核实并回复/.test(afterText));
  check('★ 给了一条真的可用的路（直接联系教务处）', /直接联系教务处/.test(afterText));

  const rA = await raw(scoped('amas_course_reports', 'userA'));
  check('★ 举报记录按身份留在本机', !!rA, String(rA).slice(0, 60));
  check('★ 不再写不带身份的全局键', (await raw('amas_course_reports')) === null);

  await loadAs('userB', '乙');
  check('★ 乙读不到甲举报过什么',
    (await raw(scoped('amas_course_reports', 'userB'))) === null);

  /* ---------------- 3. 旧的全局内容：归属未知 ---------------- */
  console.log('');
  console.log('-- 3 · 旧全局内容归属未知 --');
  await loadAs('userA', '甲');
  await wipe();
  await page.evaluate(() => {
    localStorage.setItem('amas_privacy', '{"allowDM":true}');
    localStorage.setItem('amas_joined_groups', '["g-old"]');
  });
  await loadAs('userC', '丙');
  /* 隔离是**在访问到那个键时**发生的，不是启动时全仓扫一遍
     （那样等于替用户决定动哪些数据）。所以两处都要真的走到：
     校友圈会读加入记录，设置页会读隐私开关。 */
  await tab('校友圈');
  await sleep(1400);
  await openPrivacy();
  const q = await page.evaluate(() => ({
    legacyPrivacy: localStorage.getItem('amas_privacy'),
    unclaimedPrivacy: localStorage.getItem('amas_privacy:unclaimed:v1'),
    legacyJoined: localStorage.getItem('amas_joined_groups'),
    unclaimedJoined: localStorage.getItem('amas_joined_groups:unclaimed:v1'),
    bucketC: localStorage.getItem('amas_privacy:user:userC'),
  }));
  check('★ 旧隐私设置不归给第一个登录的身份', q.bucketC === null, String(q.bucketC));
  check('★ 旧隐私设置原字节保留在隔离位',
    q.unclaimedPrivacy === '{"allowDM":true}', String(q.unclaimedPrivacy));
  check('★ 旧的加入记录同样原字节隔离',
    q.unclaimedJoined === '["g-old"]', String(q.unclaimedJoined));
  check('两个旧键都已让开', q.legacyPrivacy === null && q.legacyJoined === null);

  check('全程无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
