/**
 * Phase 5 真实验证：真后端 + 真 SQLite + 真浏览器。
 *
 * 单元测试只能证明纯函数对；这个脚本要证明**用户真的能看到**。
 * 流程：
 *   1. 用临时 DB 起真实 backend
 *   2. 走真实 HTTP 造一场完整祷告会（建房 → 建会 → 开始 → 推进 → 分享 → 结束）
 *   3. 起 vite dev 指向该 backend
 *   4. Chrome 里种登录态，打开祷告室 → 历次祷告会 → 纪要，截图并断言页面文字
 *
 * 运行：node scripts/verify-phase5.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH
  || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`]
    .find(p => existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }

const TMP = '.tmp-phase5';
const OUT = 'screenshots/phase5';
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.unref(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

let backend = null, vite = null, browser = null;
const cleanup = () => {
  for (const p of [backend, vite]) { try { p?.kill(); } catch { /* already gone */ } }
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);

async function waitFor(url, label, timeoutMs = 40000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error(`${label} 未在 ${timeoutMs}ms 内就绪：${url}`);
}

const api = (base) => async (method, path, body, token) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text };
};

// ---------------------------------------------------------------- 1. backend
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const apiPort = await freePort();
const webPort = await freePort();
const apiBase = `http://127.0.0.1:${apiPort}`;
const webBase = `http://localhost:${webPort}/`;
backend = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
  cwd: 'backend',
  stdio: 'ignore',
  env: { ...process.env, PORT: String(apiPort), APP_SECRET: 'phase5-verify',
         DB_PATH: `../${TMP}/phase5.db`, JWT_SECRET: 'phase5-jwt-secret-value',
         // 白名单必须精确到本次随机端口，否则浏览器侧全部 CORS 失败
         CORS_ORIGINS: `http://localhost:${webPort}` },
});
await waitFor(`${apiBase}/api/health`, 'backend');
console.log(`backend up on ${apiPort}`);

// ------------------------------------------------- 2. 造一场真实的完整祷告会
const call = api(apiBase);
const reg = async (name) => {
  const r = await call('POST', '/api/auth/register',
    { email: `${name}-${Date.now()}@example.com`, password: 'goodpassword1', name });
  if (r.status !== 200) throw new Error(`register ${name} 失败: ${r.text}`);
  return r.json;
};
const host = await reg('林牧师');
const guest = await reg('陈弟兄');

// 必须用 App 里那张「祷告室」卡片真正打开的房间 id（CommunityView 的 prayer_room），
// 否则种好的数据在界面上根本不在同一个房间里。
const roomId = 'prayer_room';
/**
 * 内置公共房间的 host_id 是 'system'（db.ts 刻意如此：由谁担任房主是产品决策）。
 * 没有 manager 就建不了祷告会，所以在这个**一次性临时库**里把房主指给测试用户。
 * 这是测试夹具，不是产品行为——改完之后所有操作照样全走真实 API。
 */
{
  const { default: Database } = await import('../backend/node_modules/better-sqlite3/lib/index.js');
  const d = new Database(`${TMP}/phase5.db`);
  d.prepare('UPDATE rooms SET host_id = ? WHERE room_id = ?').run(host.user.id, roomId);
  d.close();
}
for (const [who, tok] of [['host', host.accessToken], ['guest', guest.accessToken]]) {
  const jn = await call('POST', `/api/rooms/${roomId}/join`, {}, tok);
  if (jn.status !== 200) throw new Error(`${who} 加入失败 ${jn.status}: ${jn.text}`);
}

const created = await call('POST', `/api/rooms/${roomId}/prayer-sessions`, {
  title: '周三晚间祷告会',
  items: [
    { title: '为教会同心', description: '求主使弟兄姊妹在真道上合一。', scriptureRef: '以弗所书 4:3' },
    { title: '为宣教工场', description: '记念在亚洲各地服事的同工。', scriptureRef: '马太福音 28:19' },
    { title: '为身体软弱的肢体', scriptureRef: '雅各书 5:14' },
    { title: '为下一代', description: '这一项本次没有进行到。' },
  ],
}, host.accessToken);
if (!created.json?.session) throw new Error(`建会失败 ${created.status}: ${created.text}`);
let sess = created.json.session;

const cmd = async (action, extra = {}) => {
  const r = await call('POST', `/api/rooms/${roomId}/prayer-sessions/${sess.id}/${action}`,
    { expectedRevision: sess.revision, ...extra }, host.accessToken);
  if (r.status !== 200) throw new Error(`${action} 失败: ${r.text}`);
  sess = r.json.session;
};

await cmd('start');
await sleep(1200);
await cmd('advance');
await call('POST', `/api/rooms/${roomId}/prayer/shares`,
  { text: '求主医治我母亲的病，也求主赐我们家人平安。' }, guest.accessToken);
await call('POST', `/api/rooms/${roomId}/prayer/shares`,
  { text: '为工作上的抉择求智慧，盼望走在主的心意中。', isAnonymous: true }, guest.accessToken);
await sleep(900);
await cmd('advance');
await sleep(700);
await cmd('end');
console.log('已造出一场完整的祷告会（4 项计划 / 3 项进行 / 2 条代祷）');

// 顺带确认后端返回的确没有任何参与人数字段
const sumRaw = (await call('GET', `/api/rooms/${roomId}/prayer-sessions/${sess.id}/summary`,
  undefined, host.accessToken)).text;
check('后端 summary 不含任何参与人数字段',
  !/participant|attendee|presenceCount|totalPrayers|人次/i.test(sumRaw));

// -------------------------------------------------------------------- 3. vite
vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(webPort), '--strictPort'], {
  stdio: 'ignore',
  env: { ...process.env, VITE_API_BASE_URL: apiBase, VITE_VOICE_TRANSPORT: '' },
});
await waitFor(webBase, 'vite');
console.log(`vite up on ${webPort}`);

// ---------------------------------------------------------------- 4. browser
browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

/**
 * 只对真正的 JS 运行时错误把关。
 * Gemini Live 的 WebSocket 在没有 GEMINI_API_KEY 时必然握手失败——
 * 那是既有的、与 Phase 5 无关的环境问题，单独列出来但不判 FAIL。
 */
const errors = [];
const benign = [];
const bucket = (msg) => (/gemini\/live|WebSocket connection/i.test(msg) ? benign : errors).push(msg);
page.on('pageerror', e => bucket(String(e)));
page.on('console', m => { if (m.type() === 'error') bucket(m.text()); });

await page.goto(webBase, { waitUntil: 'domcontentloaded' });
await page.evaluate((h) => {
  localStorage.setItem('amas_access_token', JSON.stringify(h.accessToken));
  localStorage.setItem('amas_refresh_token', JSON.stringify(h.refreshToken));
  localStorage.setItem('amas_user', JSON.stringify(h.user));
  localStorage.setItem('amas_current_user', JSON.stringify({ ...h.user, role: 'admin', avatar: '' }));
  localStorage.setItem('amas_lang', 'zh-CN');
}, host);
await page.goto(webBase, { waitUntil: 'networkidle2' });
await sleep(1500);

/** 按可见文字点击。React 组件没有测试 id，按文字点是最接近真实用户的做法。 */
const clickText = async (text, timeout = 8000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const done = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const hit = els.find(e => (e.innerText || '').replace(/\s+/g, '').includes(t.replace(/\s+/g, '')));
      if (hit) { hit.click(); return true; }
      return false;
    }, text);
    if (done) return true;
    await sleep(250);
  }
  return false;
};
const bodyText = () => page.evaluate(() => document.body.innerText);

// 走真实用户路径：底部导航「校友圈」→ 点「祷告室」卡片
check('切到校友圈', await clickText('校友圈'));
await sleep(1500);
// 房间列表上不得再出现编造的在线人数与恒亮的「语音中」
const listText = await page.evaluate(() => document.body.innerText);
check('房间列表不再显示编造的「N 人在听」', !/人在听/.test(listText));
check('房间列表不再显示恒亮的「语音中」', !/语音中/.test(listText));
await page.screenshot({ path: `${OUT}/room-list.png` });
const enteredRoom = await page.evaluate(() => {
  const card = [...document.querySelectorAll('div.cursor-pointer')]
    .find(d => (d.textContent || '').includes('祷告室'));
  if (!card) return false;
  card.click();
  return true;
});
check('进入祷告室', enteredRoom);
await page.waitForFunction(() => document.body.innerText.includes('本次祷告主题'), { timeout: 15000 })
  .catch(() => {});
await sleep(2500);

check('祷告室出现「历次祷告会」入口', (await bodyText()).includes('历次祷告会'));
check('点击历次祷告会', await clickText('历次祷告会'));
await sleep(1800);

let t = await bodyText();
check('历史列表显示刚结束的那场', t.includes('周三晚间祷告会'), t.slice(0, 120).replace(/\n/g, ' | '));
check('历史列表写「进行了 3 项」而不是计划的 4 项', t.includes('进行了 3 项'));
check('历史列表不出现参与人数', !/人参与|人次|参与人数/.test(t));
await page.screenshot({ path: `${OUT}/history-list.png` });

check('点开纪要', await clickText('周三晚间祷告会'));
await sleep(1800);

t = await bodyText();
check('纪要显示「今日共同祷告了什么」', t.includes('今日共同祷告了什么'));
check('纪要按实际带领序列列出三项',
  t.includes('为教会同心') && t.includes('为宣教工场') && t.includes('为身体软弱的肢体'));
check('未进行的项目单列在「本次未进行」', t.includes('本次未进行') && t.includes('为下一代'));
check('会中分享的代祷出现在纪要里', t.includes('求主医治我母亲'));
check('匿名分享标为「匿名分享」', t.includes('匿名分享'));
check('纪要提供「继续为此代祷」', t.includes('继续为此代祷'));
check('纪要不出现任何参与人数', !/人参与|人次|参与人数/.test(t));
check('纪要没有把未知时长写成 0 分钟', !/\b0 分钟/.test(t));
await page.screenshot({ path: `${OUT}/summary-top.png` });
// fixed 覆盖层用 fullPage 会把背后的页面一起拍进来，改为滚动覆盖层自身再拍视口
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find(d => d.scrollHeight > d.clientHeight + 40
    && (d.textContent || '').includes('祷告会期间分享的代祷'));
  if (sc) sc.scrollTop = sc.scrollHeight;
});
await sleep(600);
await page.screenshot({ path: `${OUT}/summary-bottom.png` });

// 继续代祷：点一下，再刷新，确认真的落库了（不是只改了本地 state）
check('点击「继续为此代祷」', await clickText('继续为此代祷'));
await sleep(1200);
t = await bodyText();
check('登记后按钮变为「我在为此代祷」', t.includes('我在为此代祷'));
check('登记后显示真实代祷人数', t.includes('1 人正在代祷'));
await page.screenshot({ path: `${OUT}/intercede.png` });

const persisted = (await call('GET', `/api/rooms/${roomId}/prayer-sessions/${sess.id}/summary`,
  undefined, host.accessToken)).json;
check('代祷登记真的写进了数据库（服务端复核）',
  persisted.shares.some(s => s.intercessions === 1 && s.didIntercede === true));

check('全程无 JS 运行时错误', errors.length === 0, errors[0]?.slice(0, 160) ?? '');
if (benign.length) {
  console.log(`  (i) 忽略 ${benign.length} 条与 Phase 5 无关的既有网络错误，例如：`);
  console.log(`      ${benign[0].slice(0, 120)}`);
}

await browser.close();
cleanup();

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} PASS`);
console.log(`截图：${OUT}/`);
process.exit(failed.length === 0 ? 0 : 1);
