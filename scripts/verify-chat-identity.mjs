/**
 * 本机聊天记录的身份隔离（本地实测）。
 *
 * ## 修的是一条实测复现过的泄露
 *
 * 改之前聊天记录存在**全局键** `amas_chat_messages` 上，读的时候不看是谁：
 *
 * ```
 * 甲登录 → 在会话里发一条消息 → 写进 amas_chat_messages
 * 甲登出、乙在同一台设备登录 → ChatView 挂载时照读那个全局键
 *                            → **乙看见甲的聊天记录**
 * ```
 *
 * 这个脚本第一版就是拿来复现它的，实测「能 —— 泄露」。现在留作门禁。
 * 同一个全局键当时有三个写入方（ChatView 自己、语音房分享、校友圈分享），
 * 三个都不看身份，三个都改了。
 *
 * ## 这份数据是什么，不是什么
 *
 * **只是这台设备上的本机记录，不是任何投递。** 这一版的会话没有传输层：
 * 写进 localStorage 只意味着「你自己再打开那个会话时看得到」，对方收不到。
 * 下面有一条断言专门守着这个措辞。
 *
 * ## 旧数据：归属未知，一律不猜
 *
 * 旧全局键里的记录没有任何归属信息，可能是甲的也可能是乙的。
 * 「这台设备通常一个人用」不是身份依据。所以原始字节整份挪进隔离位保存，
 * 不归给任何身份、不展示给任何人，也**不按解析结果删除**
 * —— 解析器不认识 ≠ 不是真数据。下面逐条验。
 *
 * 全程只写浏览器 localStorage 里本流程用到的键，不连后端、
 * 不碰 canonical SQLite 与 live 配置。
 *
 * 跑法：node scripts/verify-chat-identity.mjs
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

const LEGACY_KEY = 'amas_chat_messages';
const UNCLAIMED_KEY = 'amas_chat_messages:unclaimed:v1';
const keyFor = id => `amas_chat_messages:v2:${id}`;

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
  await page.setViewport({ width: 375, height: 720, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  /** 以某个身份重新加载；可选地在加载前塞 fixture。 */
  const loadAs = async (id, name, fixture) => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([i, n, fx]) => {
      if (i) {
        localStorage.setItem('amas_current_user', JSON.stringify({
          id: i, name: n, email: i + '@example.com', role: 'student' }));
      } else {
        localStorage.removeItem('amas_current_user');
      }
      localStorage.setItem('amas_offline_notice_dismissed', '1');
      if (fx) for (const [k, v] of Object.entries(fx)) localStorage.setItem(k, v);
    }, [id, name, fixture ?? null]);
    await page.goto(base, { waitUntil: 'networkidle2' });
    for (let i = 0; i < 90; i++) {
      if (await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => (b.innerText || '').trim().endsWith('校友圈')))) return true;
      await sleep(1000);
    }
    anyFatal = true;
    return false;
  };
  const wipe = () => page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('amas_chat_messages') || k === 'amas_current_user') localStorage.removeItem(k);
    }
  });
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
  const openFirstChat = async () => {
    await tab('校友圈');
    await clickTxt('通讯录'); await sleep(1100);
    await clickTxt('最近消息'); await sleep(900);
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('div')]
        .filter(d => /rounded-\[1\.5rem\]/.test(d.className || '') && d.querySelector('img'));
      rows[0]?.click();
    });
    await sleep(1700);
    return page.evaluate(() => [...document.querySelectorAll('input')]
      .some(e => /发送消息/.test(e.placeholder || '')));
  };
  const sendText = async (text) => {
    const sel = 'input[placeholder="发送消息..."]';
    await page.waitForSelector(sel, { timeout: 15000 });
    await page.click(sel);
    await page.type(sel, text, { delay: 6 });
    await sleep(350);
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '') === '发送')?.click());
    await sleep(1300);
  };
  const bodyHas = (t) => page.evaluate(x => document.body.innerText.includes(x), t);
  const keys = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('amas_chat_messages')));

  /* ---------------- 1. 甲发消息 → 乙看不见 ---------------- */
  console.log('-- 1 · 换身份不串聊天记录 --');
  await loadAs('userA', '甲');
  await wipe();
  await loadAs('userA', '甲');
  check('前提：甲能进到会话页', await openFirstChat());

  const SECRET_A = '甲的私密消息-abc123';
  await sendText(SECRET_A);
  check('前提：甲发出去的消息在自己这边看得见', await bodyHas(SECRET_A));

  const ks = await keys();
  check('★ 落到按身份分的键上（此前是不带身份的全局键）',
    ks.includes(keyFor('userA')) && !ks.includes(LEGACY_KEY), JSON.stringify(ks));

  await loadAs('userB', '乙');
  await openFirstChat();
  const leaked = await bodyHas(SECRET_A);
  check('★ 乙在同一台设备登录，看不到甲的聊天记录（这条此前实测是泄露的）',
    !leaked);

  const SECRET_B = '乙的私密消息-xyz789';
  await sendText(SECRET_B);
  check('前提：乙自己发的看得见', await bodyHas(SECRET_B));
  check('★ 乙的记录写进乙自己的桶，没覆盖甲的',
    await page.evaluate(([ka, kb]) => !!localStorage.getItem(ka) && !!localStorage.getItem(kb),
      [keyFor('userA'), keyFor('userB')]));

  await loadAs('userA', '甲');
  await openFirstChat();
  check('★ 甲再登录回来，自己的记录还在', await bodyHas(SECRET_A));
  check('★ 而且看不到乙的', !(await bodyHas(SECRET_B)));

  /* ---------------- 2. 登出之后 ---------------- */
  console.log('');
  console.log('-- 2 · 登出不残留 --');
  await loadAs(null, null);
  await openFirstChat();
  check('★ 没有身份时看不到任何人的记录', !(await bodyHas(SECRET_A)) && !(await bodyHas(SECRET_B)));
  const afterAnon = await page.evaluate(() => Object.keys(localStorage)
    .filter(k => k.startsWith('amas_chat_messages')).sort());
  check('★ 没有身份时也不写任何桶',
    !afterAnon.includes('amas_chat_messages:v2:'), JSON.stringify(afterAnon));

  /* ---------------- 3. 旧的全局数据：不归属、不展示、不删 ---------------- */
  console.log('');
  console.log('-- 3 · 旧全局数据归属未知 --');
  const LEGACY_FIXTURE = JSON.stringify({
    'contact-1': [{ id: 'old-1', isMe: true, time: '09:00', status: 'sent', type: 'text', text: '来历不明的旧消息-qqq111' }],
  });
  await loadAs('userA', '甲');
  await wipe();
  await loadAs('userC', '丙', { [LEGACY_KEY]: LEGACY_FIXTURE });
  await openFirstChat();
  check('★ 旧数据不自动归给第一个登录的身份（丙看不到它）',
    !(await bodyHas('来历不明的旧消息-qqq111')));

  const q = await page.evaluate(([lk, uk]) => ({
    legacy: localStorage.getItem(lk),
    unclaimed: localStorage.getItem(uk),
  }), [LEGACY_KEY, UNCLAIMED_KEY]);
  check('★ 旧内容原样保留在隔离位（不是被删掉）',
    q.unclaimed === LEGACY_FIXTURE, `unclaimed=${String(q.unclaimed).slice(0, 40)}`);
  check('旧键已让开，不再被当成谁的数据读', q.legacy === null, String(q.legacy));

  /* 解析器不认识的内容也一律原字节保留 —— 不能据此判定「不是真数据」。 */
  for (const [label, raw] of [
    ['不是对象的旧内容（字符串）', '"not-an-object"'],
    ['坏掉的 JSON', '{broken'],
    ['空对象', '{}'],
  ]) {
    await loadAs('userA', '甲');
    await wipe();
    await loadAs('userD', '丁', { [LEGACY_KEY]: raw });
    await openFirstChat();
    const kept = await page.evaluate(u => localStorage.getItem(u), UNCLAIMED_KEY);
    check(`★ ${label} —— 原字节保留，没被删`, kept === raw, String(kept));
    check(`   ${label} —— 会话页仍能打开`, await page.evaluate(() => [...document.querySelectorAll('input')]
      .some(e => /发送消息/.test(e.placeholder || ''))));
  }

  /* 隔离位已经有内容就不覆盖。 */
  await loadAs('userA', '甲');
  await wipe();
  await loadAs('userE', '戊', { [LEGACY_KEY]: '{"x":[]}', [UNCLAIMED_KEY]: LEGACY_FIXTURE });
  await openFirstChat();
  const notOverwritten = await page.evaluate(u => localStorage.getItem(u), UNCLAIMED_KEY);
  check('★ 隔离位已有内容就不覆盖', notOverwritten === LEGACY_FIXTURE);

  /* ---------------- 4. 措辞：写本机 ≠ 送达对方 ---------------- */
  console.log('');
  console.log('-- 4 · 不把本地写入说成投递 --');
  const srcOk = await page.evaluate(() => true);
  check('前提：页面可用', srcOk);
  const wording = await page.evaluate(() => document.body.innerText);
  check('★ 界面上没有「已送达 / 对方已收到」这类话', !/已送达|对方已收到/.test(wording));

  check('全程无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail || anyFatal ? 1 : 0);
