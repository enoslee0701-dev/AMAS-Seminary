/**
 * 事工合作表单：本机留档的身份隔离与诚实措辞（本地实测）。
 *
 * ## 这一批修的两处
 *
 * ```
 * 1. 留档不分身份
 *    persistLocal 直接写全局键 amas_cooperation_submissions，
 *    同一台设备上换个人填表，机构名 / 联系人 / 邮箱 / 电话堆在同一份数组里。
 *    这份数据**全仓只有写、没有读**，界面上不回显 —— 所以问题在存储层，
 *    不是「乙在界面上看见了甲的邮箱」。下面的断言也只验存储层。
 * 2. 没送出去却说「已提交」
 *    后端没配 / 网络或服务端出错时，代码回落到本机留档，界面照样显示
 *    「申请已提交 …… 2 个工作日内通过邮件与您取得联系」。
 *    那是不实的：没有任何东西被送出去，也不会有人收到。
 * ```
 *
 * 本脚本在**没有配后端**的环境里跑（dev 默认如此），所以每次提交都会走到
 * 回落分支 —— 正好是第 2 条要验的那一支。
 *
 * 全程只写浏览器 localStorage 里本流程用到的键，**不连后端、不创建真实身份、
 * 不碰 canonical SQLite 与 live 配置**；填的是明显的 fixture 内容。
 *
 * 跑法：node scripts/verify-cooperation-identity.mjs
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

const COOP = 'amas_cooperation_submissions';
const scoped = id => `${COOP}:user:${id}`;

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

  /** 进「我的」→「教会与机构合作」。 */
  const openCoop = async () => {
    await tab('我的');
    await sleep(1200);
    await page.evaluate(() => [...document.querySelectorAll('*')]
      .filter(e => (e.innerText || '').trim() === '教会与机构合作')[0]?.click());
    await sleep(1800);
    return page.evaluate(() => document.querySelectorAll('input, textarea').length > 0);
  };

  /** 填表并提交。内容是明显的 fixture。 */
  const submit = async (who) => {
    const fields = await page.evaluate(() => [...document.querySelectorAll('input, textarea')]
      .map((e, i) => ({ i, tag: e.tagName, ph: e.placeholder || '' })));
    /* 表单实际是 机构 / 姓名 / 邮箱 / 留言 四个字段（没有电话）。
       邮箱必须是 ASCII：`type="email"` 的原生校验不接受中文本地部分，
       第一版用了「甲@…」，表单被浏览器拦下、submit 事件根本没触发，
       查了半天才发现是夹具值不合法，不是产品的问题。 */
    const mail = { 甲: 'jia', 乙: 'yi', 丙: 'bing' }[who] ?? 'x';
    const values = [`${who}的机构`, who, `${mail}@fixture.example.com`, '本地验证用'];
    for (let i = 0; i < Math.min(values.length, fields.length); i++) {
      await page.evaluate(([idx, v]) => {
        const el = [...document.querySelectorAll('input, textarea')][idx];
        const proto = el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, [i, values[i]]);
    }
    await sleep(400);
    /* 直接让表单自己提交。按文字找按钮会点到页面上方营销区里那个带
       「申请」字样的按钮；按坐标点又可能被固定底栏挡住。
       requestSubmit 走的是表单原生提交（含必填与格式校验）。 */
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
      else document.querySelector('button[type="submit"]')?.click();
    });
    await sleep(1800);
    return fields.length;
  };

  const bucket = (id) => page.evaluate(k => localStorage.getItem(k), scoped(id));
  const legacy = () => page.evaluate(k => localStorage.getItem(k), COOP);

  /* ---------------- 1. 甲提交 ---------------- */
  console.log('-- 1 · 甲提交一次 --');
  await loadAs('userA', '甲');
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('amas_cooperation_submissions')) localStorage.removeItem(k);
    }
  });
  await loadAs('userA', '甲');
  check('前提：能打开合作表单', await openCoop());
  await submit('甲');

  const a1 = await bucket('userA');
  check('★ 留档落到按身份分的键上（此前是不带身份的全局键）',
    !!a1 && a1.includes('jia@fixture.example.com'), String(a1).slice(0, 60));
  check('★ 不再写那个全局键', (await legacy()) === null, String(await legacy()));

  /* 没配后端 → 走回落分支，措辞必须照实说 */
  const text = await page.evaluate(() => document.body.innerText);
  check('★ 没送到服务器时不说「申请已提交」', !/申请已提交/.test(text));
  check('★ 明说还没送出、只暂存在本机',
    /申请还没送出/.test(text) && /只暂存在这台设备上/.test(text));
  check('★ 不再承诺「2 个工作日内邮件联系」', !/2 个工作日内/.test(text));

  /* ---------------- 2. 乙提交 ---------------- */
  console.log('');
  console.log('-- 2 · 乙在同一台设备提交 --');
  await loadAs('userB', '乙');
  check('前提：乙也能打开合作表单', await openCoop());
  await submit('乙');

  const a2 = await bucket('userA');
  const b2 = await bucket('userB');
  check('★ 乙的联系方式进乙自己的桶', !!b2 && b2.includes('yi@fixture.example.com'));
  check('★ 乙的桶里没有甲的邮箱', !!b2 && !b2.includes('jia@fixture.example.com'));
  check('★ 甲那份原样还在，没被乙覆盖',
    !!a2 && a2.includes('jia@fixture.example.com') && !a2.includes('yi@fixture.example.com'));
  check('★ 全局键始终没被写过', (await legacy()) === null);

  /* ---------------- 3. 旧的全局留档：归属未知 ---------------- */
  console.log('');
  console.log('-- 3 · 旧全局留档归属未知 --');
  const LEGACY = JSON.stringify([{ institution: '来历不明', email: 'unknown@fixture.example.com' }]);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('amas_cooperation_submissions')) localStorage.removeItem(key);
    }
    localStorage.setItem(k, v);
  }, [COOP, LEGACY]);
  await loadAs('userC', '丙');
  await openCoop();
  await submit('丙');

  const q = await page.evaluate(([k, u]) => ({
    legacy: localStorage.getItem(k), unclaimed: localStorage.getItem(u),
  }), [COOP, `${COOP}:unclaimed:v1`]);
  check('★ 旧留档不归给第一个登录的身份', !(await bucket('userC') || '').includes('unknown@fixture'));
  check('★ 旧内容原字节保留在隔离位（不是被删掉）', q.unclaimed === LEGACY, String(q.unclaimed).slice(0, 50));
  check('旧键已让开', q.legacy === null, String(q.legacy));

  check('全程无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
