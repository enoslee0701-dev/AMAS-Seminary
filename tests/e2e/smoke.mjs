// End-to-end smoke test for the AMAS app.
//
// Drives the production build in a real (headless) browser and walks every
// major screen, asserting that each one renders its expected content AND that
// no uncaught runtime error / React error / console.error fires anywhere.
//
// Run:  npm run test:e2e        (spawns `vite preview` automatically)
// Or:   BASE_URL=http://localhost:3000 node tests/e2e/smoke.mjs   (use a running server)
//
// Requires Google Chrome installed (used via puppeteer-core, no browser download).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

// Locate a Chromium-based browser per platform (Edge works too — puppeteer-core
// only needs a Chromium binary). Override with CHROME_PATH if autodetect fails.
const CHROME_CANDIDATES =
  process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];

const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('No Chrome/Edge found — set CHROME_PATH to a Chromium browser executable.');
  process.exit(1);
}
const PROVIDED_URL = process.env.BASE_URL;
const PORT = 4173;
const URL = PROVIDED_URL || `http://localhost:${PORT}/`;

// A signed-in user so the app boots straight to the dashboard (no backend needed).
const USER = {
  id: 'u1', name: '测试管理员', avatar: '',
  degree: 'M.Div', studentId: '20230045', role: 'admin',
  bio: '自动化冒烟测试用户。',
};

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
};

// ---- optionally spawn the preview server ----
let server = null;
async function startServer() {
  if (PROVIDED_URL) return;
  // Spawn vite via its JS entry with the current Node binary — `spawn('npm')`
  // is ENOENT on Windows (npm is npm.cmd there).
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview'], { cwd: process.cwd(), stdio: 'ignore' });
  // wait for the port to answer
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`preview server did not come up at ${URL}`);
}
function stopServer() { if (server) try { server.kill('SIGTERM'); } catch {} }

const clickByText = (page, text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll('button, a, div.cursor-pointer')]
      .find((e) => (e.textContent || '').includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, text);

const bodyHas = (page, text) =>
  page.evaluate((t) => document.body.innerText.includes(t), text);

const run = async () => {
  await startServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
    defaultViewport: { width: 440, height: 900, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();

  // Collect runtime errors across the whole session. We separate real JS
  // errors (uncaught exceptions, React errors) from benign network-resource
  // failures (favicon, optional backend APIs in offline mode, blocked CDN
  // images) — only the former should fail the suite.
  const jsErrors = [];
  const netErrors = [];
  const isNetwork = (s) => /Failed to load resource|net::ERR|ERR_/.test(s);
  page.on('pageerror', (e) => jsErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const txt = `console.error: ${m.text()}`;
    (isNetwork(txt) ? netErrors : jsErrors).push(txt);
  });
  page.on('requestfailed', (r) => netErrors.push(`requestfailed: ${r.url()}`));

  await page.evaluateOnNewDocument((u) => {
    localStorage.setItem('amas_current_user', JSON.stringify(u));
    localStorage.setItem('amas_lang', 'zh-CN');
    localStorage.setItem('amas_prayer_guide_dismissed', '1'); // skip first-entry guide if honored
    localStorage.setItem('amas_offline_notice_dismissed', '1'); // notice is verified separately; keep nav deterministic
  }, USER);

  // ---- Boot ----
  await page.goto(URL, { waitUntil: 'networkidle0' });
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('我的')),
      { timeout: 20000 },
    );
    record('boot: splash → dashboard + nav', true);
  } catch {
    record('boot: splash → dashboard + nav', false, 'nav never appeared');
  }

  // ---- Tab walk ----
  const tabs = [
    { tab: '首页', sentinel: '课程路径' },
    { tab: '课程', sentinel: '口袋神学' },
    { tab: '校友圈', sentinel: '代祷事项' },
    { tab: '图书馆', sentinel: '图书馆' },
    { tab: '我的', sentinel: '快捷入口' },
  ];
  for (const { tab, sentinel } of tabs) {
    try {
      await page.evaluate((t) => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().includes(t));
        b && b.click();
      }, tab);
      await page.waitForFunction((s) => document.body.innerText.includes(s), { timeout: 8000 }, sentinel);
      record(`tab: ${tab}`, true);
    } catch {
      record(`tab: ${tab}`, false, `sentinel "${sentinel}" not found`);
    }
  }

  // ---- Course path: overview + each tier detail page ----
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().includes('首页'));
    b && b.click();
  });
  await sleep(400);
  try {
    await clickByText(page, '了解更多');
    await page.waitForFunction(
      () => [...document.querySelectorAll('h2')].some((h) => h.textContent.trim() === '课程路径') && document.body.innerText.includes('学习方式'),
      { timeout: 8000 },
    );
    record('course-path: 了解更多 → overview (4 tiers + 学习方式)', true);
  } catch {
    record('course-path: 了解更多 → overview', false);
  }

  const tierCases = [
    { tier: '证书课程', program: '平信徒指导者课程' },
    { tier: '学士课程', program: '神学学士课程' },
    { tier: '硕士课程', program: '教牧学硕士课程' },
    { tier: '博士课程', program: '宣教学博士课程' },
  ];
  for (const { tier, program } of tierCases) {
    try {
      // back to home, then open the tier card
      await page.evaluate(() => { const back = document.querySelector('button'); back && back.click(); });
      await page.waitForFunction(() => [...document.querySelectorAll('section')].some((s) => s.textContent.includes('课程路径')), { timeout: 8000 });
      await page.evaluate((t) => {
        const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('课程路径'));
        [...sec.querySelectorAll('button')].find((b) => (b.textContent || '').includes(t)).click();
      }, tier);
      await page.waitForFunction((t) => [...document.querySelectorAll('h2')].some((h) => h.textContent.trim() === t), { timeout: 8000 }, tier);
      const ok = (await bodyHas(page, program)) && (await page.evaluate(() => window.scrollY === 0));
      record(`course-path tier: ${tier} (program + scroll-top)`, ok, ok ? '' : 'program missing or not at top');
    } catch {
      record(`course-path tier: ${tier}`, false);
    }
  }

  // ---- Course progress: mark a lesson complete, assert it sticks ----
  const openCorinthians = () => page.evaluate(() => {
    const leaf = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent || '').trim() === '哥林多前书');
    let n = leaf;
    for (let i = 0; i < 6 && n; i++) {
      if (n.onclick || (n.className?.toString() || '').includes('cursor-pointer')) { n.click(); return; }
      n = n.parentElement;
    }
    leaf && leaf.click();
  });
  const readProgress = () => page.evaluate(() => {
    const m = document.body.innerText.match(/已完成\s*(\d+)\s*\/\s*(\d+)/);
    return m ? { done: +m[1], total: +m[2] } : { done: null, total: null };
  });
  try {
    await page.evaluate(() => { const back = document.querySelector('button'); back && back.click(); });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === '课程'), { timeout: 8000 });
    await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '课程').click(); });
    await page.waitForFunction(() => document.body.innerText.includes('哥林多前书'), { timeout: 8000 });
    await openCorinthians();
    await page.waitForFunction(() => document.body.innerText.includes('节课程'), { timeout: 8000 });
    const before = await readProgress();
    await page.evaluate(() => { const b = document.querySelector('button[aria-label="标记为已完成"]'); b && b.click(); });
    await sleep(400);
    const after = await readProgress();
    // leave + reopen → progress must persist (App state round-trip)
    await page.evaluate(() => { const back = document.querySelector('button'); back && back.click(); });
    await page.waitForFunction(() => document.body.innerText.includes('哥林多前书'), { timeout: 8000 });
    await openCorinthians();
    await page.waitForFunction(() => document.body.innerText.includes('节课程'), { timeout: 8000 });
    const reopened = await readProgress();
    const ok = after.done === before.done + 1 && reopened.done === after.done;
    record('course-progress: mark complete → +1 & persists on reopen', ok, ok ? '' : `before ${before.done} after ${after.done} reopen ${reopened.done}`);
  } catch {
    record('course-progress: mark complete → +1 & persists on reopen', false);
  }

  // ---- Voice room overlay ----
  try {
    await page.evaluate(() => { const back = document.querySelector('button'); back && back.click(); });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('校友圈')), { timeout: 8000 });
    await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim().includes('校友圈')).click(); });
    await page.waitForFunction(() => document.body.innerText.includes('祷告室'), { timeout: 8000 });
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('div.cursor-pointer')].find((d) => { const t = d.textContent || ''; return t.includes('祷告室') && t.includes('晨更'); });
      card && card.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('本次祷告主题'), { timeout: 12000 });
    record('voice-room: enter 祷告室 → overlay renders', true);
  } catch {
    record('voice-room: enter 祷告室 → overlay renders', false);
  }

  // ---- Runtime error gate ----
  // Hard-fail only on real JS errors; report benign network failures for info.
  record(`no JS runtime errors (${jsErrors.length})`, jsErrors.length === 0, jsErrors.slice(0, 5).join(' | '));
  if (netErrors.length) console.log(`  (i) ${netErrors.length} benign network failure(s) ignored, e.g. ${netErrors[0]}`);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return failed.length === 0;
};

let ok = false;
try {
  ok = await run();
} catch (e) {
  console.error('E2E harness crashed:', e.message);
} finally {
  stopServer();
}
process.exit(ok ? 0 : 1);
