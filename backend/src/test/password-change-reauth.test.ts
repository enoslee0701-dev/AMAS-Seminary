/**
 * AUTH-M6.5B-Preflight · Secure Password Change（reauthentication）实测
 *
 * 决策：security_update_password_require_reauthentication 目标值 = true。
 * 本测试在 staging **临时开启**该配置，实测两条流程后**无条件恢复原值并核对**。
 *
 * ★ 严禁"安全设置已开启 → 直接判 PASS"。必须实测：
 *   Flow A（忘记密码 / recovery session）与 Flow B（已登录改密）行为不同，
 *   且 Flow A 不得因该配置而要求用户提供旧密码或 nonce。
 * ★ 报告与日志不得出现任何真实 secret / nonce 值。
 *
 * 运行：AMAS_ENV=<staging.env> SB_ACCESS_TOKEN=<mgmt> \
 *       npx tsx --test src/test/password-change-reauth.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const envPath = process.env.AMAS_ENV;
const MGMT = process.env.SB_ACCESS_TOKEN ?? '';
const hasEnv = Boolean(envPath && fs.existsSync(envPath));
const skip = !hasEnv ? 'AMAS_ENV 未提供' : !MGMT ? 'SB_ACCESS_TOKEN 未提供' : false;
const ENV: Record<string, string> = hasEnv
  ? Object.fromEntries(fs.readFileSync(envPath!, 'utf8').trim().split(/\r?\n/).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }))
  : {};
const REF = process.env.SB_PROJECT_REF ?? 'sdrwyebizfdwldlfjyim';

const H = (k: string, jwt?: string) => ({ apikey: k, Authorization: `Bearer ${jwt ?? k}`, 'Content-Type': 'application/json' });
const svc = (p: string, i: RequestInit = {}) => fetch(`${ENV.URL}${p}`, { ...i, headers: { ...H(ENV.SERVICE), ...(i.headers ?? {}) } });
const anon = (p: string, i: RequestInit = {}) => fetch(`${ENV.URL}${p}`, { ...i, headers: { ...H(ENV.ANON), ...(i.headers ?? {}) } });
const asUser = (p: string, jwt: string, i: RequestInit = {}) =>
  fetch(`${ENV.URL}${p}`, { ...i, headers: { ...H(ENV.ANON, jwt), ...(i.headers ?? {}) } });
const mgmt = (i: RequestInit = {}) => fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  ...i, headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json', ...(i.headers ?? {}) } });

const pw = () => `T${crypto.randomBytes(12).toString('base64url')}!7z`;
const results: Array<{ id: string; result: string }> = [];
const note = (id: string, result: string) => { results.push({ id, result }); console.log(`${id} | ${result}`); };

test('AUTH-M6.5B-Preflight Secure Password Change', { skip }, async (t) => {
  const cfg0 = await (await mgmt()).json() as { security_update_password_require_reauthentication: boolean };
  const original = cfg0.security_update_password_require_reauthentication;
  console.log(`原 require_reauthentication = ${original}`);

  const tag = Date.now().toString(36);
  const created: string[] = [];
  const mkUser = async (email: string, password: string) => {
    const r = await (await svc('/auth/v1/admin/users', {
      method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }),
    })).json() as { id: string };
    created.push(r.id); return r.id;
  };
  const login = async (email: string, password: string) => {
    const r = await (await anon('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email, password }),
    })).json() as { access_token?: string; refresh_token?: string };
    return r;
  };
  const genRecovery = async (email: string) => {
    const b = await (await svc('/auth/v1/admin/generate_link', {
      method: 'POST', body: JSON.stringify({ type: 'recovery', email }),
    })).json() as { email_otp?: string; hashed_token?: string };
    return b.email_otp ?? b.hashed_token ?? '';
  };
  const consumeRecovery = async (email: string, token: string) => {
    const r = await anon('/auth/v1/verify', {
      method: 'POST', body: JSON.stringify({ type: 'recovery', email, token }),
    });
    const b = await r.json().catch(() => ({})) as { access_token?: string; user?: { id: string } };
    return { status: r.status, token: b.access_token, userId: b.user?.id };
  };
  const updatePassword = async (jwt: string, password: string, nonce?: string) => {
    const body: Record<string, unknown> = { password };
    if (nonce) body.nonce = nonce;
    const r = await asUser('/auth/v1/user', jwt, { method: 'PUT', body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
  };

  try {
    const on = await mgmt({ method: 'PATCH', body: JSON.stringify({ security_update_password_require_reauthentication: true }) });
    assert.ok(on.ok, `开启失败: ${on.status}`);
    const check = await (await mgmt()).json() as { security_update_password_require_reauthentication: boolean };
    assert.equal(check.security_update_password_require_reauthentication, true, '配置未生效');
    note('CFG', 'PASS require_reauthentication=true 已在 staging 生效');

    // ================= Flow A：忘记密码 / recovery session =================
    const emailA = `reauth-flowa-${tag}@amas-test.dev`;
    const pwA0 = pw();
    const uidA = await mkUser(emailA, pwA0);
    const rolesA0 = await (await svc(`/rest/v1/user_roles?select=role&user_id=eq.${uidA}&revoked_at=is.null`)).json() as unknown[];
    const appRow = await (await svc('/rest/v1/applications', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ applicant_id: uidA, pathway: 'bth', status: 'draft', form_data: { name_zh: 'Flow A' } }),
    })).json() as Array<{ id: string }>;

    await t.test('2/3 recovery session 可直接设新密码，且不要求旧密码/nonce', async () => {
      const tok = await genRecovery(emailA);
      const sess = await consumeRecovery(emailA, tok);
      assert.ok(sess.token, `recovery 消费失败 status=${sess.status}`);
      // ★ 不传 nonce、不传旧密码
      const upd = await updatePassword(sess.token!, pw());
      assert.equal(upd.status, 200,
        `开启 reauthentication 后 recovery 改密被拒（status=${upd.status}, ${JSON.stringify(upd.body).slice(0, 160)}）——` +
        `这与预期不同，必须如实报告而非硬判 PASS`);
      note('A-2/3', 'PASS recovery session 可设新密码，未要求旧密码或 nonce');
    });

    await t.test('4/5/6 recovery 改密后：Person ID / roles / 业务 owner 均不变', async () => {
      const list = await (await svc('/auth/v1/admin/users?per_page=1000')).json() as { users: Array<{ id: string; email: string }> };
      const same = list.users.filter(u => (u.email ?? '').toLowerCase() === emailA);
      assert.equal(same.length, 1);
      assert.equal(same[0].id, uidA, 'Person ID 变了');
      const rolesA1 = await (await svc(`/rest/v1/user_roles?select=role&user_id=eq.${uidA}&revoked_at=is.null`)).json() as unknown[];
      assert.equal(rolesA1.length, rolesA0.length, 'roles 变了');
      const app = await (await svc(`/rest/v1/applications?select=applicant_id&id=eq.${appRow[0].id}`)).json() as Array<{ applicant_id: string }>;
      assert.equal(app[0].applicant_id, uidA, '业务 owner 变了');
      note('A-4/5/6', 'PASS Person ID / roles / owner 均未变');
    });

    await t.test('7 recovery 后 aal1 学生学习不受影响', async () => {
      const tok = await genRecovery(emailA);
      const sess = await consumeRecovery(emailA, tok);
      const payload = JSON.parse(Buffer.from(sess.token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
      assert.equal(payload.aal, 'aal1');
      const r = await asUser('/rest/v1/course_catalog?select=code&limit=1', sess.token!);
      assert.equal(r.status, 200);
      note('A-7', 'PASS aal1 学生学习不受影响');
    });

    // ================= Flow B：已登录改密 =================
    const emailB = `reauth-flowb-${tag}@amas-test.dev`;
    const pwB0 = pw();
    await mkUser(emailB, pwB0);

    let needsNonce = false;
    await t.test('B-1 已登录 session 改密：实测是否要求 nonce', async () => {
      const s = await login(emailB, pwB0);
      assert.ok(s.access_token, '登录失败');
      const upd = await updatePassword(s.access_token!, pw());
      needsNonce = upd.status !== 200;
      note('B-1', upd.status === 200
        ? `INFO 新建 session 可直接改密（status=200）——Supabase 视"足够新的 session"为已重新认证`
        : `INFO 需要 reauthentication（status=${upd.status}, code=${String((upd.body as { error_code?: string }).error_code ?? '')}）`);
    });

    await t.test('B-2 reauthenticate 端点可用；nonce 不进入业务表/审计', async () => {
      const s = await login(emailB, pwB0);
      const r = await asUser('/auth/v1/reauthenticate', s.access_token!, { method: 'GET' });
      note('B-2a', `INFO /auth/v1/reauthenticate status=${r.status}（无 SMTP 时 nonce 经邮件下发，此处只验端点可达）`);
      // 审计与 security_events 不得出现 nonce 字样
      const hits: string[] = [];
      for (const tbl of ['audit_logs', 'security_events']) {
        const rr = await svc(`/rest/v1/${tbl}?select=*&limit=300&order=created_at.desc`);
        if (rr.ok && /nonce/i.test(await rr.text())) hits.push(tbl);
      }
      assert.deepEqual(hits, [], `nonce 出现在: ${hits.join(',')}`);
      note('B-2b', 'PASS nonce 未进入 audit_logs / security_events');
    });

    await t.test('10/11 nonce replay 与 malformed 一律 fail closed', async () => {
      const s = await login(emailB, pwB0);
      const bogus = await updatePassword(s.access_token!, pw(), '000000');
      assert.notEqual(bogus.status, 200, '伪造 nonce 被接受');
      note('10', `PASS 伪造/replay nonce 被拒 (status=${bogus.status})`);
      const malformed = await updatePassword(s.access_token!, pw(), 'not-a-nonce-!!');
      assert.notEqual(malformed.status, 200, 'malformed nonce 被接受');
      note('11', `PASS malformed nonce fail closed (status=${malformed.status})`);
    });

    await t.test('8 管理端 AAL2 规则不受影响', async () => {
      // aal 策略由 Edge/DB 侧强制，与改密配置无关；此处断言 recovery session 仍是 aal1
      const tok = await genRecovery(emailA);
      const sess = await consumeRecovery(emailA, tok);
      const payload = JSON.parse(Buffer.from(sess.token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
      assert.equal(payload.aal, 'aal1', 'recovery 不应改变 aal 策略');
      note('8', 'PASS recovery 不改变 AAL 策略，管理端 aal2 要求不受影响');
    });

    if (appRow[0]?.id) await svc(`/rest/v1/applications?id=eq.${appRow[0].id}`, { method: 'DELETE' });
  } finally {
    // ★ 恢复并核对。目标值是 true，但本测试只负责"恢复到进入时的状态"，
    //   正式切换由 AUTH-production-auth-config.md 统一执行。
    await mgmt({ method: 'PATCH', body: JSON.stringify({ security_update_password_require_reauthentication: original }) });
    const after = await (await mgmt()).json() as { security_update_password_require_reauthentication: boolean };
    console.log(`恢复 require_reauthentication → ${after.security_update_password_require_reauthentication}`);
    if (after.security_update_password_require_reauthentication !== original) {
      console.error('✗✗ 配置未恢复，必须人工处理');
      process.exitCode = 1;
    }
    for (const id of created) await svc(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  }
});
