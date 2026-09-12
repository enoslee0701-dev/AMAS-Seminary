/**
 * 聊天「+」菜单的发送流程（本地实测）。
 *
 * ## 修的是什么
 *
 * 两条都实测复现过，都在这一个流程里：
 *
 * ```
 * 1. 发出去的消息看不见
 *    Message 的 type 声明了 13 种，渲染分支只接了 4 种
 *    （text / audio / image / course）。「分享经文」发的是 type:'verse'，
 *    「语音房间」发的是 type:'room-invite' —— 两种都落进没人接的分支，
 *    结果是一个空气泡，只剩下面那行时间戳。用户以为没发出去。
 * 2. 开语音房选不了主题
 *    selectedRoomType 声明了却没有任何控件去改（setSelectedRoomType 全仓
 *    零调用点），恒为 'fellowship'；THEME_CONFIGS 也只是 import 了没用过。
 *    从聊天里开的房永远只能是交通室，而校友圈那条路五种主题都能选。
 *    更早一步，房间的 icon / color / desc 还是写死的 emerald + Radio +
 *    「新房间」，选了哪种主题都长一个样。
 * ```
 *
 * ## 边界（不伪造）
 *
 * 这一版的会话是**本地 mock**：`sendMessage` 改的是本地 state，没有任何传输，
 * 消息只存在自己这边。所以邀请卡片只说「已开启」，**不说「已邀请对方」**，
 * 断言里也不去验证任何投递。真实多人投递是另一件事。
 *
 * 「立即创建并发送」会同时打开语音房覆盖层（懒加载 2MB+ 的传输 SDK，
 * 本地常年停在 Suspense 占位）。所以邀请卡片本身的断言放在覆盖层之外的
 * 那一半：面板内的主题选择、禁用态与预告文案在浏览器里验；
 * 卡片渲染由组件级单测 `tests/components/chatBubbles.test.tsx` 覆盖。
 * 两段各管各的，不把任何一段说成另一段。
 *
 * 跑法：node scripts/verify-chat-composer.mjs
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
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  await page.setViewport({ width: 375, height: 720, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('amas_current_user', JSON.stringify({
      id: 'chat-local', name: '本地验证', email: 'chat@example.com', role: 'student' }));
    localStorage.setItem('amas_offline_notice_dismissed', '1');
  });
  await page.goto(base, { waitUntil: 'networkidle2' });

  const waitForApp = async (max = 90) => {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate(() => [...document.querySelectorAll('button')]
        .some(b => (b.innerText || '').trim().endsWith('校友圈')))) return true;
      await sleep(1000);
    }
    anyFatal = true; return false;
  };
  if (!await waitForApp()) throw new Error('启动超时');

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

  /** 进到第一个会话的聊天页。 */
  const openFirstChat = async () => {
    await tab('校友圈');
    await clickTxt('通讯录'); await sleep(1100);
    await clickTxt('最近消息'); await sleep(900);
    const opened = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('div')]
        .filter(d => /rounded-\[1\.5rem\]/.test(d.className || '')
          && d.querySelector('img') && (d.innerText || '').trim().length > 0);
      rows[0]?.click();
      return !!rows[0];
    });
    await sleep(1600);
    return opened;
  };

  /** 聊天页的「+」→ 某个入口（按可访问名称点，这也是对名称的一条实测）。 */
  const openPicker = async (label) => {
    const byName = (l) => page.evaluate(x => {
      const b = [...document.querySelectorAll('button')]
        .find(e => (e.getAttribute('aria-label') || '') === x);
      b?.click(); return !!b;
    }, l);
    /* 「+」是个 toggle：菜单已经开着时再点一下会把它关掉。
       上一个面板关掉后菜单是留着的，所以先看入口在不在。 */
    const already = await page.evaluate(x => [...document.querySelectorAll('button')]
      .some(e => (e.getAttribute('aria-label') || '') === x), label);
    if (!already) {
      await page.evaluate(() => {
        const plus = [...document.querySelectorAll('button')].find(b => {
          const svg = b.querySelector('svg');
          return svg && /plus/i.test(svg.getAttribute('class') || '');
        });
        plus?.click();
      });
      await sleep(800);
    }
    const ok = await byName(label);
    await sleep(900);
    return ok;
  };

  /** 输入栏那个「发送消息...」的框在，就是进到聊天页了。 */
  const inChat = () => page.evaluate(() => [...document.querySelectorAll('input, textarea')]
    .some(e => /发送消息/.test(e.placeholder || '')));

  console.log('-- 聊天 · 进入会话 --');
  check('能从「最近消息」进到一个会话', await openFirstChat());
  check('聊天页已打开', await inChat());

  /* ---------------- 0b. 三个尚无实现的入口：不再是空白卡片 ---------------- */
  console.log('');
  console.log('-- 聊天 · 学术提问 / 递交作业 / 发布代祷 --');
  {
    /* 这三项此前点开是一张空白卡片，只剩右上角一个叉。产品决定是入口保留，
       但要么接现成流程，要么把暂不可用的原因说清楚并给返回；
       并且**一律不许伪造已提交 / 已发布 / AI 回答**，也不许往会话里误发消息。 */
    /* 数消息条数：每条消息最外层都是 `flex w-full ... animate-fade-in`。
       一开始用「时间戳有几个」来数，结果把菜单里新加的说明文字也数进去了
       （同样是 text-[9px]），三项走一圈凭空多出三条。用气泡外层才对得上。 */
    const msgCount = () => page.evaluate(
      () => document.querySelectorAll('div.flex.w-full.animate-fade-in').length);
    const before = await msgCount();

    const panelText = () => page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="发送内容"]');
      return d ? (d.innerText || '').trim() : null;
    });
    /* 「+」是个 toggle：菜单已经开着时再点一下会把它关掉。
       上一张面板关掉之后菜单是留着的，所以先看入口在不在。 */
    const openSheet = async (label) => {
      const present = () => page.evaluate(l => [...document.querySelectorAll('button')]
        .some(x => (x.getAttribute('aria-label') || '').startsWith(l)), label);
      if (!await present()) {
        await page.evaluate(() => {
          const plus = [...document.querySelectorAll('button')].find(b => {
            const svg = b.querySelector('svg');
            return svg && /plus/i.test(svg.getAttribute('class') || '');
          });
          plus?.click();
        });
        await sleep(800);
      }
      const ok = await page.evaluate(l => {
        const b = [...document.querySelectorAll('button')]
          .find(x => (x.getAttribute('aria-label') || '').startsWith(l));
        b?.click(); return !!b;
      }, label);
      await sleep(800);
      return ok;
    };
    const escClose = async () => {
      await page.keyboard.press('Escape');
      await sleep(700);
      return page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="发送内容"]'));
    };

    /* 菜单上就要看得出可用范围，不用点进去才发现。 */
    if (!await page.evaluate(() => [...document.querySelectorAll('button')]
      .some(x => (x.getAttribute('aria-label') || '').startsWith('学术提问')))) {
      await page.evaluate(() => {
        const plus = [...document.querySelectorAll('button')].find(b => {
          const svg = b.querySelector('svg');
          return svg && /plus/i.test(svg.getAttribute('class') || '');
        });
        plus?.click();
      });
      await sleep(800);
    }
    const notes = await page.evaluate(() => {
      const want = ['学术提问', '递交作业', '发布代祷'];
      const out = {};
      for (const b of document.querySelectorAll('button')) {
        const al = b.getAttribute('aria-label') || '';
        for (const w of want) if (al.startsWith(w)) out[w] = al;
      }
      return out;
    });
    check('★ 菜单上就标明了实际可用范围（学术提问 → 去图书馆）',
      /去图书馆问 AI 牧者/.test(notes['学术提问'] || ''), String(notes['学术提问']));
    check('★ 菜单上就标明了递交作业暂不可用',
      /暂不可用/.test(notes['递交作业'] || ''), String(notes['递交作业']));
    check('★ 菜单上就标明了发布代祷去祷告室代祷墙',
      /祷告室代祷墙/.test(notes['发布代祷'] || ''), String(notes['发布代祷']));

    // ---- 学术提问 ----
    check('打开「学术提问」', await openSheet('学术提问'));
    let txt = await panelText();
    check('★ 学术提问不再是空白卡片', !!txt && txt.length > 40, String(txt && txt.length));
    check('★ 说清了真正会回答的地方是图书馆的 AI 牧者',
      !!txt && txt.includes('图书馆') && txt.includes('AI 牧者'));
    check('★ 说明未配密钥时不会给编造的答案（不伪造 AI 回答）',
      !!txt && txt.includes('不会给出编造的答案'));
    check('★ 说明提问不会发到当前会话', !!txt && txt.includes('不会发到当前这个会话'));
    check('★ 有去图书馆的按钮，也有返回',
      !!txt && txt.includes('去图书馆问 AI 牧者') && txt.includes('返回'));
    check('★ 按 Esc 能关掉（此前只能点叉或点背景）', await escClose());

    // ---- 递交作业 ----
    check('打开「递交作业」', await openSheet('递交作业'));
    txt = await panelText();
    check('★ 递交作业不再是空白卡片', !!txt && txt.length > 40, String(txt && txt.length));
    check('★ 说清了暂不可用的真实原因（没有通道、没有批改回执）',
      !!txt && txt.includes('没有作业提交的通道') && txt.includes('批改'));
    check('★ 明说点一下不会有东西被交出去（不伪造已提交）',
      !!txt && txt.includes('不会有任何东西被交出去'));
    check('★ 不谎称是暂时的网络问题', !!txt && txt.includes('不是暂时的网络问题'));
    check('★ 有返回', !!txt && txt.includes('返回'));
    check('★ 按 Esc 能关掉', await escClose());

    // ---- 发布代祷 ----
    check('打开「发布代祷」', await openSheet('发布代祷'));
    txt = await panelText();
    check('★ 发布代祷不再是空白卡片', !!txt && txt.length > 40, String(txt && txt.length));
    check('★ 说清了代祷发布在祷告室的代祷墙上、仅房间成员可见',
      !!txt && txt.includes('祷告室') && txt.includes('仅该房间成员可见'));
    check('★ 说明未连接服务器时不会假装已发布（不伪造已发布代祷）',
      !!txt && txt.includes('不会假装已发布'));
    check('★ 说明打开祷告室不会往会话发消息',
      !!txt && txt.includes('不会往当前会话发任何消息'));
    check('★ 有打开祷告室的按钮，也有返回',
      !!txt && txt.includes('打开祷告室代祷墙') && txt.includes('返回'));
    check('★ 按 Esc 能关掉', await escClose());

    /* 最要紧的一条：这三项走一圈，会话里不能多出任何消息。 */
    const after = await msgCount();
    check('★ 三项点完，会话里没有多出任何消息（不误发）',
      after === before, `前 ${before} → 后 ${after}`);
  }

  /* ---------------- 1. 语音房间面板 ---------------- */
  console.log('');
  console.log('-- 聊天 · 开启语音房间 --');
  /* 这八个入口此前**只有图标、没有可访问名称**（名字在旁边的 span 上），
     读屏走过去八个都念「按钮」。下面全都按 aria-label 点，点得到就说明名称在。 */
  /* 先把「+」菜单开出来，后面才量得到名称。
     「+」是 toggle，菜单已经开着时再点会把它关掉，所以先判断。 */
  if (!await page.evaluate(() => [...document.querySelectorAll('button')]
    .some(b => (b.getAttribute('aria-label') || '').startsWith('语音房间')))) {
    await page.evaluate(() => {
      const plus = [...document.querySelectorAll('button')].find(b => {
        const svg = b.querySelector('svg');
        return svg && /plus/i.test(svg.getAttribute('class') || '');
      });
      plus?.click();
    });
    await sleep(900);
  }
  const named = await page.evaluate(() => {
    const labels = ['相册', '推荐课程', '学术提问', '递交作业', '分享经文', '发布代祷', '语音房间', '文件'];
    const got = [...document.querySelectorAll('button')]
      .map(b => b.getAttribute('aria-label')).filter(Boolean);
    // 学术提问 / 递交作业 / 发布代祷 的名称后面还带着实际可用范围，所以前缀匹配
    return labels.filter(l => got.some(g => g.startsWith(l)));
  });
  check('★「+」菜单里八个入口都有可访问名称（此前一个都没有）',
    named.length === 8, JSON.stringify(named));
  check('「+」菜单里有「语音房间」入口', await openPicker('语音房间'));

  const themes = () => page.evaluate(() => {
    const group = document.querySelector('[aria-labelledby="chat-room-type-label"]');
    if (!group) return null;
    return [...group.querySelectorAll('button[aria-pressed]')].map(b => ({
      label: (b.innerText || '').trim(),
      on: b.getAttribute('aria-pressed') === 'true',
    }));
  });
  let t = await themes();
  check('★ 面板里有「房间主题」选择器（此前一个控件都没有，恒为交通室）',
    !!t && t.length >= 5, JSON.stringify(t));
  if (!t) throw new Error('没有主题选择器');
  check('默认选中交通室，且只有一个被按下',
    t.filter(x => x.on).length === 1 && t.find(x => x.on)?.label === '交通室',
    JSON.stringify(t.filter(x => x.on)));

  const submit = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => (x.innerText || '').trim() === '立即创建并发送');
    if (!b) return null;
    const hintId = b.getAttribute('aria-describedby');
    const hint = hintId ? document.getElementById(hintId)?.innerText?.trim() : null;
    return { disabled: b.disabled, hint };
  });
  let s = await submit();
  check('★ 名称没填时提交键是禁用的（此前一直可点，点下去静悄悄 return）',
    s?.disabled === true, JSON.stringify(s));
  check('★ 并且说清了为什么不能提交', s?.hint === '请先填写房间名称', String(s?.hint));

  // 换一个主题
  await page.evaluate(() => {
    const group = document.querySelector('[aria-labelledby="chat-room-type-label"]');
    [...group.querySelectorAll('button[aria-pressed]')]
      .find(b => (b.innerText || '').trim() === '祷告室')?.click();
  });
  await sleep(500);
  t = await themes();
  check('★ 能选到别的主题，且仍然只有一个被按下',
    t.filter(x => x.on).length === 1 && t.find(x => x.on)?.label === '祷告室',
    JSON.stringify(t.filter(x => x.on)));

  /* 主题键的真实热区（伪元素/内边距都算进去，按 hit-testing 量，不看 rect）。 */
  const themeHit = await page.evaluate(() => {
    const group = document.querySelector('[aria-labelledby="chat-room-type-label"]');
    const el = [...group.querySelectorAll('button[aria-pressed]')][1];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const owns = p => { let n = p; while (n) { if (n === el) return true; n = n.parentElement; } return false; };
    const at = (x, y) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && owns(document.elementFromPoint(x, y));
    if (!at(cx, cy)) return { blocked: true };
    const grow = (dx, dy) => { let k = 0; while (k < 60 && at(cx + dx * (k + 1), cy + dy * (k + 1))) k++; return k; };
    return { w: grow(-1, 0) + grow(1, 0) + 1, h: grow(0, -1) + grow(0, 1) + 1 };
  });
  check('主题键热区 ≥ 44×44',
    !!themeHit && !themeHit.blocked && themeHit.w >= 44 && themeHit.h >= 44,
    JSON.stringify(themeHit));

  // 填名称
  await page.evaluate(() => {
    const i = document.getElementById('chat-room-name');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(i, '晨祷小组');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(500);
  s = await submit();
  check('★ 填了名称就能提交', s?.disabled === false, JSON.stringify(s));
  check('★ 预告说清了将开启什么房、什么主题',
    !!s?.hint && s.hint.includes('晨祷小组') && s.hint.includes('祷告室'), String(s?.hint));

  check('房间名称输入框有关联的标签', await page.evaluate(() => {
    const i = document.getElementById('chat-room-name');
    return !!document.querySelector('label[for="chat-room-name"]') && !!i;
  }));

  /* ---------------- 1b. 邀请卡片：发出去要看得见 ---------------- */
  /* 「立即创建并发送」会顺手打开语音房覆盖层（懒加载 2MB+ 的传输 SDK，
     本地常年停在 Suspense 占位），所以下面**只断言卡片在 DOM 里、内容对**，
     不断言它此刻肉眼可见 —— 刚开房就被房间盖住是正常的，不是缺陷。
     真实房间里的使用仍未验证，需要真机或可用的传输通道。 */
  check('提交创建并发送', await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => (x.innerText || '').trim() === '立即创建并发送');
    b?.click(); return !!b;
  }));
  await sleep(2000);

  const invite = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => /^进入语音房间 /.test(b.getAttribute('aria-label') || ''));
    if (!btn) return null;
    const card = btn.parentElement;
    return { label: btn.getAttribute('aria-label'), text: (card.innerText || '').trim() };
  });
  check('★ 邀请卡片渲染出来了（此前 type:"room-invite" 没人接，是个空气泡）',
    !!invite, JSON.stringify(invite));
  check('★ 卡片上有房间名与所选主题（不是写死的「新房间」）',
    !!invite && invite.text.includes('晨祷小组') && invite.text.includes('祷告室'),
    String(invite && invite.text));
  check('★「进入房间」有可访问名称，带房间名',
    !!invite && invite.label === '进入语音房间 晨祷小组', String(invite && invite.label));
  /* 措辞边界：这一版会话是本地 mock，消息没有任何传输，
     所以卡片只能说「已开启」，不能说「已邀请对方」。 */
  check('★ 卡片不声称已经通知到对方（本地 mock 会话，没有投递）',
    !!invite && !/已邀请|已通知|对方/.test(invite.text), String(invite && invite.text));

  /* ---------------- 2. 分享经文：发出去要看得见 ---------------- */
  console.log('');
  console.log('-- 聊天 · 分享经文发出去看得见 --');
  /* 先关掉当前面板：点它的背景遮罩（面板自己 onClick 里 stopPropagation，
     所以必须点遮罩本身才会关）。 */
  const closeSheet = async () => {
    await page.evaluate(() => {
      const back = [...document.querySelectorAll('div')].find(d =>
        getComputedStyle(d).position === 'fixed' && (d.className || '').includes('z-[110]'));
      back?.click();
    });
    await sleep(700);
    return page.evaluate(() => !document.getElementById('chat-room-name'));
  };
  check('点背景能关掉面板', await closeSheet());

  check('「+」菜单里有「分享经文」入口', await openPicker('分享经文'));
  const hasVerseInput = await page.evaluate(() => !!document.getElementById('verseInput'));
  check('分享经文面板打开了', hasVerseInput);
  if (!hasVerseInput) throw new Error('分享经文面板没打开');
  const VERSE = '我的恩典够你用的，因为我的能力是在人的软弱上显得完全。';
  await page.evaluate((v) => {
    const ta = document.getElementById('verseInput');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, v);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, VERSE);
  await sleep(400);
  check('发送经文', await clickTxt('发送经文'));
  await sleep(1200);

  const verseShown = await page.evaluate((v) => {
    const hit = [...document.querySelectorAll('div')]
      .filter(d => (d.innerText || '').includes(v));
    return { found: hit.length > 0, tagged: document.body.innerText.includes('分享经文') };
  }, VERSE);
  check('★ 发出去的经文在会话里看得见（此前 type:"verse" 没人渲染，是个空气泡）',
    verseShown.found, JSON.stringify(verseShown));
  check('★ 气泡上标明了这是分享的经文', verseShown.tagged);

  check('全程无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail || anyFatal ? 1 : 0);
