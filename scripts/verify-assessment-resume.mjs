/**
 * 30 题评估的「中途退出 → 再进入 → 续答 → 完成」—— 本地实测验证。
 *
 * ## 产品原始意图（docs/CHRISTIAN_PROFILE_SPEC.md）
 *
 * 铁律 8：「每题自动保存、可退出续答、可撤销上一题。」
 * 答题体验规则：「左上角 ✕ 退出并保存会话，下次进入可『继续上次未完成的评估』
 * 或『重新开始』。」
 * 铁律 4：「评分是**确定性引擎**（同样答案永远同样结果）。」
 *
 * 所以这套断言不是凭感觉定的，是把规格里写死的三条行为逐条钉住：
 *
 *   1. 每答一题就落盘，退出后会话还在
 *   2. 再进入必须同时给出「继续上次未完成的评估（已答 n/30）」和「重新开始」
 *   3. 点续答从第 n+1 题继续，不是从头
 *   4. 「重新开始」把旧会话清掉，从第 1 题开始
 *   5. 完成后会话清除，再进入不再提示续答（否则会拿一份残留会话去覆盖档案）
 *   6. ★ 续答完成的档案，必须与一次答完完全一致 —— 这是铁律 4 的直接检验
 *
 * ## 边界
 *
 * 全程只写浏览器 localStorage（`amas_cp_session_v1` / `amas_ct_state_v2`），
 * 不连后端、不创建真实身份、不碰 canonical SQLite 与 live 配置。
 * 每个用例开始前把这两个键清掉，互不污染。
 *
 * 跑法：node scripts/verify-assessment-resume.mjs
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

const SESSION_KEY = 'amas_cp_session_v1';
const DOC_KEY = 'amas_ct_state_v2';
const TOTAL = 30;                 // 精简版题数（CP_QUICK_V1.0）

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

  const waitForApp = async (max = 90) => {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => (b.innerText || '').trim().endsWith('校友圈')))) return true;
      await sleep(1000);
    }
    return false;
  };

  /** 清空这套流程用到的两个键，再重载。绝不碰别的存储。 */
  const freshRun = async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([sk, dk]) => {
      localStorage.setItem('amas_current_user', JSON.stringify({
        id: 'cp-local', name: '本地验证', email: 'cp@example.com', role: 'student' }));
      localStorage.setItem('amas_offline_notice_dismissed', '1');
      localStorage.removeItem(sk);
      localStorage.removeItem(dk);
    }, [SESSION_KEY, DOC_KEY]);
    await page.goto(base, { waitUntil: 'networkidle2' });
    if (!await waitForApp()) { anyFatal = true; return false; }
    return true;
  };

  const clickText = (re) => page.evaluate(r => {
    const rx = new RegExp(r);
    const b = [...document.querySelectorAll('button')]
      .find(x => rx.test((x.innerText || '').replace(/\s+/g, ' ').trim()));
    b?.click(); return !!b;
  }, re.source);

  const openTab = async (t) => {
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

  /** 走到「事奉倾向画像 · 精简版」的介绍页。 */
  const openAssessmentIntro = async () => {
    await openTab('课程');
    await clickText(/进入定制化神学/);
    await sleep(1600);
    const ok = await clickText(/事奉倾向画像|测出我的事奉定位|查看我的成长档案/);
    await sleep(1600);
    return ok;
  };

  const session = () => page.evaluate(k => {
    try { const v = JSON.parse(localStorage.getItem(k) || 'null');
      return v && Array.isArray(v.answers) ? { n: v.answers.length, level: v.level, version: v.assessmentVersion } : null;
    } catch { return null; }
  }, SESSION_KEY);

  const profile = () => page.evaluate(k => {
    try {
      const p = JSON.parse(localStorage.getItem(k) || 'null')?.christianProfile;
      if (!p) return null;
      // 只取用于比对的确定性部分，时间戳之类排除在外。
      return JSON.stringify({
        label: p.combinedLabel,
        top: (p.topOrientations || []).map(t => `${t.key}:${t.score}`),
        all: (p.orientations || []).map(o => `${o.key}:${o.score}`),
      });
    } catch { return null; }
  }, DOC_KEY);

  /**
   * 当前题目的文字。答题页之前隔着一个阶段引导页（Step n of N 那一屏），
   * 所以先把引导页翻过去再读 —— 不然读到的永远是 null，
   * 「第一题 null === 续答后 null」这种断言就成了空跑。
   */
  const questionText = async () => {
    for (let i = 0; i < 3; i++) {
      const t = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
          .find(b => typeof b.className === 'string'
            && b.className.includes('text-left')
            && b.className.includes('active:scale-[0.99]'));
        if (!btn) return null;
        const box = btn.parentElement?.previousElementSibling;
        return box ? (box.textContent || '').trim().slice(0, 40) : '(找不到题干)';
      });
      if (t) return t;
      if (!await clickText(/^(开始|继续|我知道了|知道了)/)) return null;
      await sleep(600);
    }
    return null;
  };

  /** 答当前题的第 0 个选项。不在答题页时先把阶段引导页翻过去。 */
  const answerFirst = async () => {
    const done = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('button')]
        .filter(b => b.className.includes('text-left') && b.className.includes('active:scale-[0.99]'));
      if (!opts.length) return false;
      opts[0].click(); return true;
    });
    if (done) return true;
    // 阶段引导页 / 知情说明页
    const moved = await clickText(/^(开始|继续|我知道了|知道了)/);
    await sleep(500);
    return moved ? 'stage' : false;
  };

  /** 一路答到结果页。返回实际点掉的题数。 */
  const answerThrough = async (limit = TOTAL + 12) => {
    let n = 0;
    for (let i = 0; i < limit * 2 && n < limit; i++) {
      const r = await answerFirst();
      if (r === true) { n++; await sleep(300); continue; }
      if (r === 'stage') continue;
      break;    // 既不是题也不是引导页 —— 到结果页了
    }
    return n;
  };

  const exitAssessment = async () => {
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(x => ['退出', '关闭', '返回'].includes(x.getAttribute('aria-label') || ''))?.click());
    await sleep(1400);
  };

  /* ============ 用例 A：一次答完 ============ */
  console.log('\n-- A · 一次答完 30 题 --');
  if (!await freshRun()) throw new Error('启动超时');
  check('前提：能进到评估介绍页', await openAssessmentIntro());
  await clickText(/^开始/);
  await sleep(900);
  const nA = await answerThrough();
  check('答满 30 题', nA === TOTAL, `实际答了 ${nA} 题`);
  await sleep(1000);
  const profA = await profile();
  check('完成后档案已生成', !!profA, profA ? profA.slice(0, 60) + '…' : 'null');
  check('★ 完成后会话已清除（否则残留会话会覆盖档案）',
    (await session()) === null, JSON.stringify(await session()));

  await exitAssessment();
  await openAssessmentIntro();
  const staleResume = await page.evaluate(() => [...document.querySelectorAll('button')]
    .some(x => /继续上次未完成的评估/.test(x.innerText || '')));
  check('完成后再进入，不再提示「继续上次未完成的评估」', !staleResume);

  /* ============ 用例 B：答 8 题退出，再续答到完成 ============ */
  console.log('\n-- B · 答 8 题退出 → 续答 → 完成 --');
  if (!await freshRun()) throw new Error('启动超时');
  await openAssessmentIntro();
  await clickText(/^开始/);
  await sleep(900);
  const firstQ = await questionText();
  check('前提：停在第一题', !!firstQ, firstQ ?? 'null');

  let nB = 0;
  while (nB < 8) {
    const r = await answerFirst();
    if (r === true) { nB++; await sleep(300); continue; }
    if (r === 'stage') continue;
    break;
  }
  check('答了 8 题', nB === 8, `实际 ${nB}`);
  const sMid = await session();
  check('★ 每题自动保存：退出前会话里已有 8 条', sMid?.n === 8, JSON.stringify(sMid));

  await exitAssessment();
  const sAfterExit = await session();
  check('★ 退出后会话仍在（可续答）', sAfterExit?.n === 8, JSON.stringify(sAfterExit));

  await openAssessmentIntro();
  const resumeLabel = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /继续上次未完成的评估/.test(x.innerText || ''));
    return b ? b.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  check('★ 再进入给出「继续上次未完成的评估（已答 n/30）」',
    !!resumeLabel && resumeLabel.includes(`8/${TOTAL}`), resumeLabel ?? '没有这个按钮');
  const hasRestart = await page.evaluate(() => [...document.querySelectorAll('button')]
    .some(x => /^重新开始/.test((x.innerText || '').trim())));
  check('★ 同时给出「重新开始」', hasRestart);

  await clickText(/继续上次未完成的评估/);
  await sleep(1400);
  const resumedQ = await questionText();
  check('★ 续答从第 9 题继续，不是从头', !!resumedQ && resumedQ !== firstQ,
    `第一题「${firstQ}」· 续答后「${resumedQ}」`);

  const nB2 = await answerThrough(TOTAL - 8 + 6);
  await sleep(1000);
  const profB = await profile();
  check('续答后能走到结果页并生成档案', !!profB, `续答又答了 ${nB2} 题`);

  check('★ 续答完成的档案与一次答完完全一致（铁律 4：确定性引擎）',
    !!profA && profA === profB,
    profA === profB ? '两次结果逐维相同' : `A=${String(profA).slice(0, 70)} / B=${String(profB).slice(0, 70)}`);

  /* ============ 用例 C：「重新开始」必须清掉旧会话 ============ */
  console.log('\n-- C · 重新开始 --');
  if (!await freshRun()) throw new Error('启动超时');
  await openAssessmentIntro();
  await clickText(/^开始/);
  await sleep(900);
  const firstQC = await questionText();
  let nC = 0;
  while (nC < 5) {
    const r = await answerFirst();
    if (r === true) { nC++; await sleep(300); continue; }
    if (r === 'stage') continue;
    break;
  }
  await exitAssessment();
  await openAssessmentIntro();
  check('前提：有 5 条待续答', (await session())?.n === 5, JSON.stringify(await session()));
  await clickText(/^重新开始/);
  await sleep(1400);
  const afterRestartQ = await questionText();
  check('★ 点「重新开始」回到第一题', afterRestartQ === firstQC,
    `第一题「${firstQC}」· 重新开始后「${afterRestartQ}」`);
  check('★ 点「重新开始」把旧会话清掉', (await session()) === null,
    JSON.stringify(await session()));

  check('全程无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail || anyFatal ? 1 : 0);
