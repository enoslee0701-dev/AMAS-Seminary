/**
 * 自建群聊的本地保存 —— 身份隔离与安全恢复（本地实测）。
 *
 * ## 先把事实摆正
 *
 * 上一轮报告里写过「自建群刷新即消失」。**那句话是错的**，本轮实测推翻：
 * `App.tsx` 的 `conversations` 初始化本来就读了 `amas_custom_groups` 并按 id
 * 去重合并，刷新后是在的。错误来自只 grep 了写入侧、没查读回侧。
 *
 * 真正的缺陷是另外两条，都实测复现过：
 *
 * ```
 * 1. 键是全局的 amas_custom_groups，不带身份
 *    甲登录建群 → 换乙登录 → 乙的会话列表里看得见甲建的群
 * 2. 只挡语法坏掉的 JSON，挡不住「合法 JSON 但类型不对」
 *    把键写成 '"not-an-array"' → JSON.parse 得到字符串 →
 *    [...INITIAL, ...'not-an-array'] 摊成一堆单字符 → 会话列表打不开
 * ```
 *
 * ## 这套数据的性质（不要说过头）
 *
 * 自建群聊一直是**纯本地**的：只存在这台设备的这个浏览器里，不同步给群里
 * 其他人，也没有任何后端记录。本轮只补身份分桶与安全恢复，**没有**引入
 * 服务端同步、没有新增真实账号、没有任何后端映射。
 *
 * ## 用例
 *
 * 全部只写浏览器 localStorage 的 `amas_current_user` 与自建群相关键，
 * 每段开始前清掉，互不污染。不连后端、不碰 canonical SQLite 与 live 配置。
 *
 * 跑法：node scripts/verify-custom-groups.mjs
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

const LEGACY_KEY = 'amas_custom_groups';
const keyFor = id => `amas_custom_groups:v2:${id}`;

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

  /** 以某个身份重新加载。可选地在加载前往存储里塞 fixture。 */
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
    anyFatal = true;
    return false;
  };
  const wipe = () => page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (/^amas_custom_groups/.test(k) || k === 'amas_current_user') localStorage.removeItem(k);
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
  const openMessages = async () => {
    await tab('校友圈');
    await clickTxt('通讯录'); await sleep(1100);
    await clickTxt('最近消息'); await sleep(900);
  };
  const createGroup = async (nm) => {
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(x => (x.getAttribute('aria-label') || '') === '发起群聊')?.click());
    await sleep(1100);
    await page.evaluate(n => {
      const inp = [...document.querySelectorAll('input')].find(i => i.type === 'text' || !i.type);
      if (!inp) return;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(inp, n); inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, nm);
    await sleep(350);
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('div,li,label')]
        .filter(d => d.className && String(d.className).includes('cursor-pointer'));
      rows[0]?.click();
    });
    await sleep(400);
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(x => /创建/.test((x.innerText || '').trim()) && !x.disabled)?.click());
    await sleep(1400);
  };
  const visible = (nm) => page.evaluate(n => document.body.innerText.includes(n), nm);
  const listOpens = () => page.evaluate(() => /最近消息/.test(document.body.innerText));
  const storageKeys = () => page.evaluate(() =>
    Object.keys(localStorage).filter(k => /custom_groups/.test(k)).sort());
  const bucket = (id) => page.evaluate(k => {
    try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return Array.isArray(v) ? v.map(g => g.userName) : v; }
    catch { return 'parse-error'; }
  }, keyFor(id));

  /* ---------------- 1. 建 → 刷新 → 仍可见 ---------------- */
  console.log('');
  console.log('-- 1 · 建群 → 刷新 → 仍可见 --');
  await wipe();
  if (!await loadAs('userA', '甲同学')) throw new Error('启动超时');
  await openMessages();
  const G1 = 'A的群-' + Date.now();
  await createGroup(G1);
  check('建群后立刻在会话列表里', await visible(G1), G1);
  check('落盘到按身份分桶的键', (await storageKeys()).includes(keyFor('userA')),
    JSON.stringify(await storageKeys()));

  await loadAs('userA', '甲同学');
  await openMessages();
  check('★ 刷新后仍可见（这一条修复前就是好的，钉住防回退）', await visible(G1));

  /* ---------------- 2. 身份之间不串 ---------------- */
  console.log('');
  console.log('-- 2 · 换身份不串数据 --');
  await loadAs('userB', '乙同学');
  await openMessages();
  check('★ 乙登录后看不到甲建的群', !(await visible(G1)));
  const G2 = 'B的群-' + Date.now();
  await createGroup(G2);
  check('乙自己建的群乙能看见', await visible(G2), G2);

  await loadAs('userA', '甲同学');
  await openMessages();
  check('★ 甲回来仍看得见自己的群', await visible(G1));
  check('★ 甲看不到乙建的群', !(await visible(G2)));
  check('两个身份各有自己的桶',
    (await storageKeys()).length === 2, JSON.stringify(await storageKeys()));

  /* ---------------- 3. 坏格式安全恢复 ---------------- */
  console.log('');
  console.log('-- 3 · 存储坏掉时的安全恢复 --');
  for (const [label, raw] of [
    ['合法 JSON 但不是数组（修复前会把会话列表弄坏）', '"not-an-array"'],
    ['合法 JSON 但是对象', '{"a":1}'],
    ['语法坏掉的 JSON', '{oops'],
    ['数组里混了坏项', '[{"id":"g-ok","userName":"好群"},null,3,{"userName":"缺 id"},{"id":"g-x"}]'],
  ]) {
    await wipe();
    await loadAs('userC', '丙同学', { [keyFor('userC')]: raw });
    await openMessages();
    const ok = await listOpens();
    check(`★ ${label} —— 会话列表仍能打开`, ok);
    if (raw.startsWith('[')) {
      check('  数组里只有合格的那一项被保留', await visible('好群') && !(await visible('缺 id')),
        JSON.stringify(await bucket('userC')));
    }
  }

  /* ---------------- 4. 旧全局键一次性迁移 ---------------- */
  console.log('');
  console.log('-- 4 · 旧格式（全局键）迁移 --');
  await wipe();
  await loadAs('userD', '丁同学', {
    [LEGACY_KEY]: '[{"id":"g-legacy","userName":"旧格式的群","userId":"g-legacy","isGroup":true}]',
  });
  await openMessages();
  check('★ 旧全局键里的群仍看得见（迁移后不丢数据）', await visible('旧格式的群'));
  const afterMigrate = await storageKeys();
  check('★ 旧全局键已删除，只剩按身份分桶的键',
    !afterMigrate.includes(LEGACY_KEY) && afterMigrate.includes(keyFor('userD')),
    JSON.stringify(afterMigrate));
  await loadAs('userE', '戊同学');
  await openMessages();
  check('★ 迁移之后别的身份看不到那份旧数据', !(await visible('旧格式的群')));

  /* ---------------- 5. 重复项 ---------------- */
  console.log('');
  console.log('-- 5 · 重复项 --');
  await wipe();
  await loadAs('userF', '己同学', {
    [keyFor('userF')]: '[{"id":"g-dup","userName":"重复群 旧"},{"id":"g-dup","userName":"重复群 新"}]',
  });
  await openMessages();
  const dupNames = await bucket('userF');
  check('★ 同 id 只保留一条（保留后出现的那条）',
    Array.isArray(dupNames) && dupNames.length === 1 && dupNames[0] === '重复群 新',
    JSON.stringify(dupNames));
  check('会话列表里也只出现一次',
    await page.evaluate(() => (document.body.innerText.match(/重复群/g) || []).length === 1));

  check('全程无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log('');
console.log(`${pass}/${pass + fail} PASS`);
process.exit(fail || anyFatal ? 1 : 0);
