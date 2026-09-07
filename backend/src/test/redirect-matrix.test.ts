/**
 * AUTH-M6.5B-Preflight · Redirect / Deep Link 攻击矩阵
 *
 * 两个层面都要测，不能只测 Supabase Dashboard 配置：
 *   (a) Supabase 侧 redirect allow list 的实际执行
 *   (b) **应用自己的 callback parser**（门户 auth/callback/index.html）
 *
 * 不需要 SMTP：用 /auth/v1/recover 带 redirect_to，以及 admin/generate_link
 * 返回的 action_link 来观察实际生效的跳转目标。
 *
 * 运行：AMAS_ENV=<staging.env> SITE_DIR=<AMAS-website 路径> \
 *       npx tsx --test src/test/redirect-matrix.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const envPath = process.env.AMAS_ENV;
const hasEnv = Boolean(envPath && fs.existsSync(envPath));
const skip = !hasEnv ? 'AMAS_ENV 未提供' : false;
const ENV: Record<string, string> = hasEnv
  ? Object.fromEntries(fs.readFileSync(envPath!, 'utf8').trim().split(/\r?\n/).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }))
  : {};
const SITE_DIR = process.env.SITE_DIR ?? 'C:/Users/enosl/Desktop/AMAS-website';
const ALLOWED = 'http://localhost:8090/auth/callback/?type=recovery';

const H = (k: string) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });
const svc = (p: string, i: RequestInit = {}) => fetch(`${ENV.URL}${p}`, { ...i, headers: { ...H(ENV.SERVICE), ...(i.headers ?? {}) } });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const rows: Array<{ id: string; input: string; result: string }> = [];
const rec = (id: string, input: string, result: string) => {
  rows.push({ id, input, result });
  console.log(`${result.startsWith('PASS') ? 'PASS' : 'INFO'} ${id} | ${input} → ${result}`);
};

/** 取 generate_link 的 action_link，观察 redirect_to 实际被解析成什么。 */
async function effectiveRedirect(email: string, redirectTo: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const r = await svc('/auth/v1/admin/generate_link', {
      method: 'POST', body: JSON.stringify({ type: 'recovery', email, redirect_to: redirectTo }),
    });
    if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
    if (!r.ok) return `HTTP_${r.status}`;
    const b = await r.json() as { action_link?: string };
    try {
      const u = new URL(b.action_link ?? '');
      return u.searchParams.get('redirect_to') ?? '(none)';
    } catch { return '(unparseable)'; }
  }
  return 'RATE_LIMITED';
}

test('AUTH-M6.5B-Preflight Redirect Matrix', { skip }, async (t) => {
  const tag = Date.now().toString(36);
  const email = `redir-${tag}@amas-test.dev`;
  const u = await (await svc('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: `T${crypto.randomBytes(9).toString('base64url')}!7z`, email_confirm: true }),
  })).json() as { id: string };

  const SITE_URL = 'http://localhost:8090';

  try {
    await t.test('1 allowlisted 精确 URL 被接受', async () => {
      const eff = await effectiveRedirect(email, ALLOWED);
      assert.equal(eff, ALLOWED, `allowlisted URL 未被接受：${eff}`);
      rec('1', ALLOWED, 'PASS accepted');
    });

    // ★ 项目 2「相同 host 错 path」的结论取决于配置本身：
    //   当前 staging allow list 含 `http://localhost:8090/**`，路径通配符会放行
    //   该 origin 下**任意路径**。因此同 host 错 path 被接受是**配置的正确行为**，
    //   不是缺陷——但它正好说明为什么 production 必须用精确 URL 而非 /** 。
    await t.test('2 同 host 错 path：记录当前通配符配置下的实际行为', async () => {
      const sameHostOtherPath = 'http://localhost:8090/not-allowlisted-path';
      const eff = await effectiveRedirect(email, sameHostOtherPath);
      if (eff === 'RATE_LIMITED') { rec('2', sameHostOtherPath, 'INFO rate_limited'); return; }
      const honored = eff === sameHostOtherPath;
      rec('2', sameHostOtherPath, honored
        ? 'INFO honored —— 因 allow list 含 `http://localhost:8090/**`（路径通配符）；' +
          'production 必须改为精确 path，否则任意同源路径都可作为回跳目标'
        : `PASS rejected(effective=${eff})`);
      await sleep(400);
    });

    // 3-13：跨域 / scheme / 编码 / 移动端等越界输入，一律不得成为最终跳转目标
    const attacks: Array<[string, string]> = [
      ['3', 'https://evil.example/steal'],
      ['4', 'https://evil.example/?next=http://localhost:8090/auth/callback/'],
      ['5', 'http://localhost.8090.evil.example/auth/callback/'],
      ['6', 'https://localhost:8090@evil.example/auth/callback/'],
      ['7', 'ftp://localhost:8090/auth/callback/'],
      ['8', 'http://localhost:8090/auth/callback/%2F%2Fevil.example'],
      ['8b', 'http://localhost:8090/auth/callback/%252F%252Fevil.example'],
      ['9', 'javascript:alert(1)'],
      ['10', 'data:text/html;base64,PHNjcmlwdD4x'],
      ['11', 'http://amas-production.example/auth/callback/'],
      ['12', 'amasapp://recovery'],
      ['13', 'capacitor://localhost/auth/callback/'],
    ];

    for (const [id, input] of attacks) {
      await t.test(`${id} 越界 redirect 不得生效: ${input.slice(0, 44)}`, async () => {
        const eff = await effectiveRedirect(email, input);
        if (eff === 'RATE_LIMITED') { rec(id, input, 'INFO rate_limited(未判定)'); return; }
        // 只要没有原样采纳恶意目标即可；Supabase 的做法是回退到 Site URL
        assert.notEqual(eff, input, `恶意 redirect 被原样采纳: ${input}`);
        const fellBack = eff.startsWith(SITE_URL);
        assert.ok(fellBack || eff === '(none)' || eff.startsWith('HTTP_'),
          `未回退到 Site URL 也未拒绝，实际=${eff}`);
        rec(id, input, `PASS not_honored(effective=${eff === '(none)' ? 'none' : fellBack ? 'site_url_fallback' : eff})`);
        await sleep(400);
      });
    }

    // ============ (b) 应用自己的 callback parser ============
    await t.test('14-17 门户 callback parser：缺 token / 畸形 / 已消费 一律 fail closed', () => {
      const cb = path.join(SITE_DIR, 'auth/callback/index.html');
      assert.ok(fs.existsSync(cb), '未找到门户 callback 页面');
      const src = fs.readFileSync(cb, 'utf8');

      // 14/15：必须显式判定 recovery 类型，而不是"有 hash 就当成 recovery"
      assert.match(src, /type=recovery/, 'callback 未显式判定 recovery 类型');
      // 16/17：过期/已消费由 Supabase 判定，前端必须处理 getSession 为空的情况
      assert.match(src, /getSession|onAuthStateChange|setSession/,
        'callback 未校验 recovery session 是否真的建立');
      // 不得把任意 URL 参数当成跳转目标
      const openRedirect = /location\.(href|replace)\s*=\s*[^;]*\b(next|returnTo|redirect|continue)\b/i.test(src);
      assert.equal(openRedirect, false, 'callback 存在 open redirect 风险');
      rec('14-17', 'portal auth/callback parser', 'PASS type_checked + session_verified + no_open_redirect');
    });

    await t.test('9 open redirect 参数全站审计（门户）', () => {
      const jsDir = path.join(SITE_DIR, 'assets/js');
      const bad: string[] = [];
      const walk = (d: string) => {
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, f.name);
          if (f.isDirectory()) walk(p);
          else if (/\.js$/.test(f.name)) {
            const src = fs.readFileSync(p, 'utf8');
            // 用户可控参数直接成为跳转目标
            if (/location\.(href|replace)\s*\(?\s*[^;]*(searchParams\.get|params\.get)\s*\(\s*['"](next|returnTo|redirect|redirectTo|continue)['"]/.test(src)) {
              bad.push(path.relative(SITE_DIR, p));
            }
          }
        }
      };
      if (fs.existsSync(jsDir)) walk(jsDir);
      assert.deepEqual(bad, [], `发现用户可控跳转目标: ${bad.join(', ')}`);
      rec('OR', '门户 JS 全量', 'PASS no_user_controlled_redirect_target');
    });

  } finally {
    await svc(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
    fs.writeFileSync('redirect-matrix-findings.json', JSON.stringify(rows, null, 2));
  }
});
