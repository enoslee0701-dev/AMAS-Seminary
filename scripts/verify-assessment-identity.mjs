/**
 * 评估与成长档案的身份隔离（本地实测）。
 *
 * ## 修的是一条实测复现过的泄露
 *
 * 这两份数据原本存在**全局键**上，读的时候不看是谁：
 *
 * ```
 * amas_ct_state_v2     成长档案文档：Christian Profile 结果、事奉倾向、
 *                      实践证据、历史快照
 * amas_cp_session_v1   评估会话：每题自动保存的作答
 * ```
 *
 * 复现过：甲完成评估后登出、乙在同一台设备登录，打开「定制化神学」，
 * **界面按甲那份已完成的结果渲染**（出现「重新评估 / 删除结果 / 倾向指数」）。
 * 这是本应用里最私人的一份数据 —— 答题记录与事奉倾向画像。
 *
 * ## 还有一条更重的后果（源码级判断，**未实测**）
 *
 * `amas_ct_state_v2` 会经 `scheduleGrowthPush` 推到 `/api/growth/state`，
 * 那个请求用的是当前登录者的 access token。所以在配了后端的环境里，
 * 乙登录后只要触发一次保存，本地那份（其实是甲的）就会被 PUT 到乙的账号下。
 *
 * **这条没有实测复现** —— 复现它需要可用后端与两个真实账号，那是不能碰的。
 * 这里只如实记下机制与前提，不声称已经发生过。按身份分键之后，
 * 这条路径的前提（本地那份是别人的）不再成立。
 *
 * ## 旧数据：归属未知，一律不猜
 *
 * 旧全局键里的内容没有归属信息，可能是甲的也可能是乙的。
 * 原始字节整份挪进隔离位保存，不归给任何身份、不展示，
 * 也**不按解析结果删除** —— 解析器不认识 ≠ 不是真数据。
 *
 * 全程只写浏览器 localStorage 里本流程用到的键；评估结果用 fixture 塞进去，
 * **不做真实答题、不连后端、不碰 canonical SQLite 与 live 配置**。
 *
 * 跑法：node scripts/verify-assessment-identity.mjs
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

const DOC_KEY = 'amas_ct_state_v2';
const SESSION_KEY = 'amas_cp_session_v1';
const docKeyFor = id => `${DOC_KEY}:${id}`;
const DOC_UNCLAIMED = `${DOC_KEY}:unclaimed:v1`;

/** 一份「已完成」的档案，形状按 loadCT 的判据（v===2 且有 scores）。 */
const CT_FIXTURE = JSON.stringify({
  v: 2,
  scores: { shepherd: 88, teacher: 71, evangelist: 64, servant: 59, prophet: 55, builder: 52 },
  answers: { q1: 3, q2: 4 },
  completedAt: Date.now(),
});

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

  const loadAs = async (id, name, fixture) => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([i, n, fx]) => {
      localStorage.setItem('amas_current_user', JSON.stringify({
        id: i, name: n, email: i + '@example.com', role: 'student' }));
      localStorage.setItem('amas_offline_notice_dismissed', '1');
      if (fx) for (const [k, v] of Object.entries(fx)) localStorage.setItem(k, v);
    }, [id, name, fixture ?? null]);
    await page.goto(base, { waitUntil: 'networkidle2' });
    for (let i = 0; i < 90; i++) {
      if (await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => (b.innerText || '').trim().endsWith('校友圈')))) return true;
      await sleep(1000);
    }
    check(`前提：以「${name}」加载应用`, false, '等了 90 秒仍没起来');
    return false;
  };
  const wipe = () => page.evaluate(([d, sk]) => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(d) || k.startsWith(sk) || k === 'amas_current_user') localStorage.removeItem(k);
    }
  }, [DOC_KEY, SESSION_KEY]);
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
  /** 进「定制化神学」。返回页面是否显示成「已经有一份结果」。 */
  const openCT = async () => {
    await tab('首页');
    await sleep(1200);
    await page.evaluate(() => [...document.querySelectorAll('*')]
      .filter(e => (e.innerText || '').trim() === '定制化神学')[0]?.click());
    await sleep(2200);
    return page.evaluate(() => /重新评估|删除结果|倾向指数/.test(document.body.innerText));
  };

  /* ---------------- 1. 甲的评估结果，乙看不到 ---------------- */
  console.log('-- 1 · 换身份不串评估结果 --');
  await loadAs('userA', '甲');
  await wipe();
  await loadAs('userA', '甲', { [docKeyFor('userA')]: CT_FIXTURE });
  check('前提：甲这边显示成已有一份结果', await openCT());

  await loadAs('userB', '乙');
  const leaked = await openCT();
  check('★ 乙在同一台设备登录，看不到甲的评估结果（这条此前实测是泄露的）', !leaked);

  const buckets = await page.evaluate(d => Object.keys(localStorage)
    .filter(k => k.startsWith(d + ':') && !k.includes('unclaimed')).sort(), DOC_KEY);
  check('★ 甲那份仍在甲自己的桶里，没被乙覆盖',
    buckets.includes(docKeyFor('userA')), JSON.stringify(buckets));
  check('★ 也没有回头去写那个泄露过的全局键',
    await page.evaluate(d => localStorage.getItem(d) === null, DOC_KEY));

  await loadAs('userA', '甲');
  check('★ 甲再登录回来，自己那份还在', await openCT());

  /* ---------------- 2. 旧的全局数据：不归属、不展示、不删 ---------------- */
  console.log('');
  console.log('-- 2 · 旧全局数据归属未知 --');
  await loadAs('userA', '甲');
  await wipe();
  await loadAs('userC', '丙', { [DOC_KEY]: CT_FIXTURE });
  const shownToC = await openCT();
  check('★ 旧数据不自动归给第一个登录的身份（丙看不到那份结果）', !shownToC);

  const q = await page.evaluate(([d, u]) => ({
    legacy: localStorage.getItem(d), unclaimed: localStorage.getItem(u),
  }), [DOC_KEY, DOC_UNCLAIMED]);
  check('★ 旧内容原样保留在隔离位（不是被删掉）',
    q.unclaimed === CT_FIXTURE, `unclaimed=${String(q.unclaimed).slice(0, 40)}`);
  check('旧键已让开，不再被当成谁的数据读', q.legacy === null, String(q.legacy));

  for (const [label, raw] of [
    ['不是对象的旧内容', '"not-an-object"'],
    ['坏掉的 JSON', '{broken'],
    ['空对象', '{}'],
  ]) {
    await loadAs('userA', '甲');
    await wipe();
    await loadAs('userD', '丁', { [DOC_KEY]: raw });
    await openCT();
    const kept = await page.evaluate(u => localStorage.getItem(u), DOC_UNCLAIMED);
    check(`★ ${label} —— 原字节保留，没被删`, kept === raw, String(kept));
  }

  await loadAs('userA', '甲');
  await wipe();
  await loadAs('userE', '戊', { [DOC_KEY]: '{"v":2}', [DOC_UNCLAIMED]: CT_FIXTURE });
  await openCT();
  check('★ 隔离位已有内容就不覆盖',
    await page.evaluate(([u, f]) => localStorage.getItem(u) === f, [DOC_UNCLAIMED, CT_FIXTURE]));

  /* ---------------- 3. 会话（每题作答）同样分桶 ---------------- */
  console.log('');
  console.log('-- 3 · 每题作答的会话也分桶 --');
  await loadAs('userA', '甲');
  await wipe();
  await loadAs('userF', '己', { [SESSION_KEY]: '{"level":"short","answers":[]}' });
  await openCT();
  const sess = await page.evaluate(sk => ({
    legacy: localStorage.getItem(sk),
    unclaimed: localStorage.getItem(sk + ':unclaimed:v1'),
  }), SESSION_KEY);
  check('★ 旧的会话数据也挪进了隔离位，没归给己',
    sess.legacy === null && sess.unclaimed === '{"level":"short","answers":[]}',
    JSON.stringify(sess));

  check('全程无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
