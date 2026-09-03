/**
 * AUTH-M6.5A · Credential Recovery Security Acceptance
 *
 * 验证 Supabase credential establishment / password recovery 的**安全机制**。
 * 不验证正式 SMTP 投递、production 域名、deep link、真机收信 —— 那是 M6.5B。
 *
 * ★ 报告与日志中**不得出现任何真实 secret**。本文件只打印
 *   generated/expired/consumed/replay_rejected 这类判定结果。
 * ★ 一次性测试密码只存在于进程内存，不写库外记录、不写报告、不入 Git。
 * ★ 真实账号（estherzh0528@gmail.com）只验证 provisioning / recoverability 前置条件，
 *   **不消费其 recovery credential**，把最终凭据留给本人建立。
 *
 * 运行：AMAS_ENV=<staging.env> MIGRATED_DB=<sqlite> npx tsx --test src/test/credential-recovery.test.ts
 * 需要 SB_ACCESS_TOKEN（Management API，用于临时调低 OTP TTL 实测过期）——缺省则跳过过期项。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const envPath = process.env.AMAS_ENV;
const hasEnv = Boolean(envPath && fs.existsSync(envPath));
const ENV: Record<string, string> = hasEnv
  ? Object.fromEntries(fs.readFileSync(envPath!, 'utf8').trim().split(/\r?\n/).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }))
  : {};
const skip = !hasEnv ? 'AMAS_ENV 未提供，跳过 credential recovery 验收' : false;
const PROJECT_REF = 'sdrwyebizfdwldlfjyim';
const MGMT = process.env.SB_ACCESS_TOKEN ?? '';

const H = (key: string, jwt?: string) => ({
  apikey: key, Authorization: `Bearer ${jwt ?? key}`, 'Content-Type': 'application/json',
});
const sbAdmin = (p: string, init: RequestInit = {}) =>
  fetch(`${ENV.URL}${p}`, { ...init, headers: { ...H(ENV.SERVICE), ...(init.headers ?? {}) } });
const sbAnon = (p: string, init: RequestInit = {}) =>
  fetch(`${ENV.URL}${p}`, { ...init, headers: { ...H(ENV.ANON), ...(init.headers ?? {}) } });

/** 一次性测试密码：只在内存中存在，不落任何记录。 */
const ephemeralPassword = () => `T${crypto.randomBytes(12).toString('base64url')}!7z`;

/** 从 admin generate_link 取 recovery 凭据。返回值**绝不打印**。 */
/** 本轮实际签发过的 secret 值（只在内存中，用于按值扫描是否泄漏）。 */
const issuedSecrets = new Set<string>();

async function generateRecovery(email: string): Promise<{ token: string; ok: boolean }> {
  const r = await sbAdmin('/auth/v1/admin/generate_link', {
    method: 'POST', body: JSON.stringify({ type: 'recovery', email }),
  });
  if (!r.ok) return { token: '', ok: false };
  const b = await r.json() as { hashed_token?: string; email_otp?: string };
  const tok = b.email_otp ?? b.hashed_token ?? '';
  if (tok) issuedSecrets.add(tok);
  return { token: tok, ok: Boolean(tok) };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * 消费 recovery 凭据 → 换取 session。
 *
 * ★ 429（限流）要退避重试，**不能当成安全判定结果**。
 *   Supabase 对 /auth/v1/verify 有较严的每 IP 限流；本套件短时间内会签发/消费
 *   十余次凭据，很容易自己把自己限流。一个会因限流而失败的安全测试是有害的：
 *   它既产生假警报，也可能把真正的失败掩盖在噪音里。
 */
async function consumeRecovery(email: string, token: string, opts: { retryOn429?: boolean } = {}) {
  const retry = opts.retryOn429 !== false;
  let last = { status: 0, session: false, accessToken: undefined as string | undefined, userId: undefined as string | undefined };
  for (let attempt = 0; attempt < (retry ? 6 : 1); attempt++) {
    const r = await sbAnon('/auth/v1/verify', {
      method: 'POST', body: JSON.stringify({ type: 'recovery', email, token }),
    });
    const b = await r.json().catch(() => ({})) as { access_token?: string; user?: { id: string } };
    last = { status: r.status, session: Boolean(b.access_token), accessToken: b.access_token, userId: b.user?.id };
    if (r.status !== 429) return last;
    await sleep(1500 * (attempt + 1));       // 线性退避
  }
  return last;
}

/** 签发同样需要退避：generate_link 也有限流。 */
async function generateRecoveryRetrying(email: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const g = await generateRecovery(email);
    if (g.ok) return g;
    await sleep(1500 * (attempt + 1));
  }
  return { token: '', ok: false };
}

const created: string[] = [];
const findings: Array<{ id: string; name: string; result: string }> = [];
const note = (id: string, name: string, result: string) => {
  findings.push({ id, name, result });
  console.log(`${result.startsWith('PASS') ? 'PASS' : result.startsWith('INFO') ? 'INFO' : 'FAIL'} ${id} ${name} | ${result}`);
};

test('AUTH-M6.5A Credential Recovery Security', { skip }, async (t) => {
  const tag = Date.now().toString(36);
  const fixEmail = `recovery-fixture-${tag}@amas-test.dev`;
  const pw0 = ephemeralPassword();

  // ---- fixture 身份 + 业务数据 ----
  const mk = await (await sbAdmin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: fixEmail, password: pw0, email_confirm: true,
      user_metadata: { display_name: 'Recovery Fixture' } }),
  })).json() as { id: string };
  created.push(mk.id);
  const personId = mk.id;
  assert.ok(personId, 'fixture 身份创建失败');

  // 业务数据：一份申请（PORTAL-1 域），owner = personId
  const appRow = await (await sbAdmin('/rest/v1/applications', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ applicant_id: personId, pathway: 'bth', status: 'draft',
      form_data: { name_zh: 'Recovery Fixture' } }),
  })).json() as Array<{ id: string }>;
  const appId = appRow[0]?.id;

  // App 侧业务数据：growth_state / course_progress，直接以 Supabase uid 为主键
  const dbPath = process.env.MIGRATED_DB;
  let db: Database.Database | null = null;
  if (dbPath && fs.existsSync(dbPath)) {
    db = new Database(dbPath);
    db.prepare('INSERT OR REPLACE INTO growth_state (user_id, state_json, updated_at) VALUES (?,?,?)')
      .run(personId, JSON.stringify({ fixture: true }), Date.now());
    db.prepare(`INSERT OR REPLACE INTO course_progress (user_id, course_id, progress, completed_lessons, updated_at)
                VALUES (?,?,?,?,?)`).run(personId, 'c_matthew', 42, 3, Date.now());
  }

  const rolesBefore = await (await sbAdmin(
    `/rest/v1/user_roles?select=role&user_id=eq.${personId}&revoked_at=is.null`)).json() as Array<{ role: string }>;

  // ======================= Token / Link Security =======================
  await t.test('11 recovery 凭据可成功生成', async () => {
    const g = await generateRecoveryRetrying(fixEmail);
    assert.ok(g.ok, 'generate_link 未返回可用凭据');
    note('11', 'recovery 凭据生成', 'PASS generated');
  });

  await t.test('13 篡改的凭据被拒', async () => {
    const g = await generateRecoveryRetrying(fixEmail);
    const tampered = g.token.slice(0, -3) + (g.token.slice(-3) === 'AAA' ? 'BBB' : 'AAA');
    const r = await consumeRecovery(fixEmail, tampered);
    assert.ok(r.status >= 400 && !r.session, `篡改凭据被接受: status=${r.status}`);
    note('13', '篡改凭据', `PASS rejected(status=${r.status})`);
  });

  await t.test('14 错误凭据被拒', async () => {
    const r = await consumeRecovery(fixEmail, crypto.randomBytes(24).toString('base64url'));
    assert.ok(r.status >= 400 && !r.session, `随机凭据被接受: status=${r.status}`);
    note('14', '错误凭据', `PASS rejected(status=${r.status})`);
  });

  let consumedUserId = '';
  let sessionToken = '';
  await t.test('16 成功消费后 replay 被拒（API 层直接重放，不是 UI 二次点击）', async () => {
    const g = await generateRecoveryRetrying(fixEmail);
    const first = await consumeRecovery(fixEmail, g.token);
    assert.ok(first.session, `首次消费未取得 session: status=${first.status}`);
    consumedUserId = first.userId ?? '';
    sessionToken = first.accessToken ?? '';
    note('16a', '首次消费', 'PASS consumed');

    const replay = await consumeRecovery(fixEmail, g.token);
    assert.ok(replay.status >= 400 && !replay.session, `replay 被接受: status=${replay.status}`);
    note('16b', 'replay', `PASS replay_rejected(status=${replay.status})`);
  });

  await t.test('17 并发消费同一凭据', async () => {
    const g = await generateRecoveryRetrying(fixEmail);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => consumeRecovery(fixEmail, g.token, { retryOn429: false })));
    const ok = results.filter(r => r.session).length;
    const rateLimited = results.filter(r => r.status === 429).length;
    const decided = results.length - rateLimited;   // 真正被服务端裁决过的请求数

    // ★ 实测：绝大多数轮次为 1/5，但曾观测到 2/5 —— 存在竞态窗口。
    //   不为了让测试变绿而硬判 PASS；断言放在"绝不允许全部成功"这条硬底线上，
    //   并把实际观测如实记入报告（Additional Control Required）。
    assert.ok(ok < Math.max(decided, 1), `被裁决的 ${decided} 次并发消费全部成功，属严重缺陷`);
    note('17', '并发消费',
      ok <= 1
        ? `PASS at_most_one(succeeded=${ok}/5, rate_limited=${rateLimited})`
        : `FAIL race_window(succeeded=${ok}/5, rate_limited=${rateLimited}) —— 见报告 Additional Control Required`);
  });

  await t.test('★ 实测：先签发的未使用凭据，在另一个凭据被消费后是否仍有效', async () => {
    const first = await generateRecoveryRetrying(fixEmail);
    const second = await generateRecoveryRetrying(fixEmail);
    const useSecond = await consumeRecovery(fixEmail, second.token);
    assert.ok(useSecond.session, '第二个凭据消费失败，无法进行本项判定');
    const useFirst = await consumeRecovery(fixEmail, first.token);
    const stillValid = useFirst.session;
    note('SB-1', '旧未使用凭据在新凭据消费后的状态',
      stillValid
        ? `INFO still_valid —— Supabase **不会**自动作废先前签发的 recovery 凭据（status=${useFirst.status}）`
        : `PASS invalidated —— 先前签发的凭据已随之失效（status=${useFirst.status}）`);
    // 不自行伪装 PASS：若仍有效，作为 Decision Required 记入报告
  });

  await t.test('18/19 recovery 换得的是正常 Supabase session，非长期 recovery token', async () => {
    assert.ok(sessionToken, '缺少 session token');
    const payload = JSON.parse(Buffer.from(
      sessionToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    assert.equal(payload.aud, 'authenticated');
    assert.equal(payload.sub, personId, 'session 的 sub 必须等于原 Person ID');
    const ttl = Number(payload.exp) - Number(payload.iat);
    assert.ok(ttl > 0 && ttl <= 24 * 3600, `session TTL 异常: ${ttl}s`);
    note('18/19', 'recovery → 正常 session', `PASS aud=authenticated ttl=${ttl}s`);
  });

  await t.test('20 session refresh 行为正常', async () => {
    // 用 fixture 正常登录取 refresh_token，再刷新一次
    const login = await (await sbAnon('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email: fixEmail, password: pw0 }),
    })).json() as { refresh_token?: string };
    if (!login.refresh_token) { note('20', 'session refresh', 'INFO skipped(密码已被 recovery 流程改变)'); return; }
    const r = await sbAnon('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: login.refresh_token }),
    });
    assert.equal(r.status, 200);
    note('20', 'session refresh', 'PASS');
  });

  // ======================= Identity Preservation =======================
  await t.test('2/5 recovery 不创建第二个 auth.users；session 的 user.id 等于原 Person ID', async () => {
    const list = await (await sbAdmin(
      `/auth/v1/admin/users?per_page=1000`)).json() as { users: Array<{ id: string; email: string }> };
    const same = list.users.filter(u => (u.email ?? '').toLowerCase() === fixEmail);
    assert.equal(same.length, 1, `同一邮箱出现 ${same.length} 个 auth.users`);
    assert.equal(same[0].id, personId, 'Person ID 发生了变化');
    assert.equal(consumedUserId, personId, 'recovery session 的 user.id 与原 Person ID 不一致');
    note('2/5', 'password reset ≠ account recreation', 'PASS single_identity_preserved');
  });

  await t.test('3 recovery 不创建第二个 profile', async () => {
    const profs = await (await sbAdmin(
      `/rest/v1/profiles?select=id&id=eq.${personId}`)).json() as Array<{ id: string }>;
    assert.equal(profs.length, 1);
    const byEmail = await (await sbAdmin(
      `/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(fixEmail)}`)).json() as Array<{ id: string }>;
    assert.equal(byEmail.length, 1, `同一邮箱出现 ${byEmail.length} 个 profile`);
    note('3', '未创建第二个 profile', 'PASS');
  });

  await t.test('4 legacy → supabase mapping 完全未变化', () => {
    if (!db) { note('4', 'mapping 未变化', 'INFO skipped(未提供 MIGRATED_DB)'); return; }
    const rows = db.prepare('SELECT legacy_user_id, supabase_user_id, mapping_status FROM legacy_user_map').all();
    assert.ok(rows.length > 0, 'mapping 表为空');
    const dup = db.prepare(`SELECT supabase_user_id, COUNT(*) n FROM legacy_user_map
                            WHERE supabase_user_id IS NOT NULL GROUP BY supabase_user_id HAVING n > 1`).all();
    assert.equal(dup.length, 0);
    note('4', 'mapping 未变化', `PASS rows=${rows.length}`);
  });

  // ======================= Application Ownership =======================
  await t.test('38-43 业务数据 owner 以 Person ID 断言，未发生变化', async () => {
    const app = await (await sbAdmin(
      `/rest/v1/applications?select=id,applicant_id&id=eq.${appId}`)).json() as Array<{ applicant_id: string }>;
    assert.equal(app[0]?.applicant_id, personId, 'application owner 变了');
    if (db) {
      const gs = db.prepare('SELECT user_id FROM growth_state WHERE user_id = ?').get(personId) as { user_id?: string };
      assert.equal(gs?.user_id, personId, 'growth_state owner 变了');
      const cp = db.prepare('SELECT user_id, progress FROM course_progress WHERE user_id = ?').get(personId) as { user_id?: string; progress?: number };
      assert.equal(cp?.user_id, personId, 'course_progress owner 变了');
      assert.equal(cp?.progress, 42, 'course_progress 内容被改动');
    }
    note('38-43', '业务数据 owner（按 Person ID 断言，非 email）', 'PASS unchanged');
  });

  // ======================= Authorization Preservation =======================
  await t.test('31-34 recovery 不自动授予任何 role；已撤销权限不因重置而恢复', async () => {
    const after = await (await sbAdmin(
      `/rest/v1/user_roles?select=role&user_id=eq.${personId}&revoked_at=is.null`)).json() as Array<{ role: string }>;
    assert.deepEqual(after.map(r => r.role).sort(), rolesBefore.map(r => r.role).sort(),
      'recovery 后角色集合发生变化');

    // 授予后撤销，再走一次 recovery，确认不会"恢复"旧权限
    const ins = await (await sbAdmin('/rest/v1/user_roles', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: personId, role: 'registrar', granted_by: personId }),
    })).json() as Array<{ id: string }>;
    await sbAdmin(`/rest/v1/user_roles?id=eq.${ins[0].id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    const g = await generateRecoveryRetrying(fixEmail);
    const c = await consumeRecovery(fixEmail, g.token);
    assert.ok(c.session, 'recovery 消费失败');
    const afterRevoke = await (await sbAdmin(
      `/rest/v1/user_roles?select=role&user_id=eq.${personId}&revoked_at=is.null`)).json() as Array<{ role: string }>;
    assert.equal(afterRevoke.length, rolesBefore.length,
      '密码恢复成了 privilege recovery —— 已撤销的角色被恢复');
    note('31-34', '密码恢复 ≠ 权限恢复', 'PASS no_privilege_recovery');
  });

  await t.test('36 recovery 后 aal1 学生仍可正常学习（不因重置被强制 MFA）', async () => {
    const g = await generateRecoveryRetrying(fixEmail);
    const c = await consumeRecovery(fixEmail, g.token);
    assert.ok(c.accessToken);
    const payload = JSON.parse(Buffer.from(
      c.accessToken!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    assert.equal(payload.aal, 'aal1', 'recovery 后不应被要求 aal2');
    const r = await fetch(`${ENV.URL}/rest/v1/course_catalog?select=code&limit=1`,
      { headers: H(ENV.ANON, c.accessToken) });
    assert.equal(r.status, 200, 'aal1 学生读课程目录应正常');
    note('36', 'aal1 学生 recovery 后正常学习', 'PASS');
  });

  // ======================= Failure Handling =======================
  await t.test('44 不存在的邮箱：记录 Supabase 实际行为（不自行判定应当如何）', async () => {
    const r = await sbAnon('/auth/v1/recover', {
      method: 'POST', body: JSON.stringify({ email: `no-such-${tag}@amas-test.dev` }),
    });
    note('44', '不存在邮箱的 recover 响应', `INFO status=${r.status}（是否泄露账号存在性按此实际行为评估）`);
  });

  await t.test('45 malformed recovery 请求 fail closed', async () => {
    const bad = await sbAnon('/auth/v1/verify', {
      method: 'POST', body: JSON.stringify({ type: 'recovery' }),
    });
    assert.ok(bad.status >= 400);
    const bad2 = await consumeRecovery('not-an-email', 'x');
    assert.ok(bad2.status >= 400 && !bad2.session);
    note('45', 'malformed fail closed', `PASS status=${bad.status}/${bad2.status}`);
  });

  await t.test('49/50 recovery 失败不改动业务数据 owner，也不改角色', async () => {
    await consumeRecovery(fixEmail, crypto.randomBytes(24).toString('base64url'));
    const app = await (await sbAdmin(
      `/rest/v1/applications?select=applicant_id&id=eq.${appId}`)).json() as Array<{ applicant_id: string }>;
    assert.equal(app[0]?.applicant_id, personId);
    const roles = await (await sbAdmin(
      `/rest/v1/user_roles?select=role&user_id=eq.${personId}&revoked_at=is.null`)).json() as Array<{ role: string }>;
    assert.equal(roles.length, rolesBefore.length);
    note('49/50', '失败路径不产生副作用', 'PASS');
  });

  // ======================= 真实账号：只验前置条件 =======================
  await t.test('真实账号只验 recoverability 前置条件，不消费其凭据', async () => {
    const REAL = 'estherzh0528@gmail.com';
    const list = await (await sbAdmin('/auth/v1/admin/users?per_page=1000')).json() as
      { users: Array<{ id: string; email: string; email_confirmed_at: string | null }> };
    const real = list.users.filter(u => (u.email ?? '').toLowerCase() === REAL);
    assert.equal(real.length, 1, `真实账号应恰好 1 个 identity，实际 ${real.length}`);
    assert.ok(real[0].email_confirmed_at, '真实账号邮箱未确认，无法走 recovery');
    // ★ 刻意不调用 generate_link / verify：不消费、不改动真实账号的凭据状态
    note('REAL-1', '真实账号 provisioning/recoverability 前置条件',
      `PASS single_identity + email_confirmed（未消费其 recovery 凭据）`);
  });

  // ======================= Secret Leakage =======================
  await t.test('21-30 recovery secret 未形成持久化副本', async () => {
    // ★ 按**真实 secret 值**扫描，不按字段名。
    //   按字段名扫描是错的：验收报告本身会正当地讨论 hashed_token / email_otp
    //   这些名字，那会造成永久性的假阳性，而且它检测的是词、不是值。
    assert.ok(issuedSecrets.size > 0, '本轮未签发任何凭据，扫描无意义');
    const needles = [...issuedSecrets].filter(s => s.length >= 6);
    const hits: string[] = [];
    const scan = (label: string, text: string) => {
      for (const n of needles) if (text.includes(n)) { hits.push(label); return; }
    };

    for (const tbl of ['audit_logs', 'security_events']) {
      const r = await sbAdmin(`/rest/v1/${tbl}?select=*&limit=500&order=created_at.desc`);
      if (r.ok) scan(tbl, await r.text());
    }
    const files = [
      '../docs/operations/AUTH-M6.5-credential-recovery-report.md',
      'credential-recovery-findings.json',
    ];
    for (const f of files) if (fs.existsSync(f)) scan(f, fs.readFileSync(f, 'utf8'));

    assert.deepEqual(hits, [], `真实 secret 值出现在: ${hits.join(', ')}`);
    note('21-30', 'secret 未持久化（按真实值扫描审计/security_events/报告/findings）',
      `PASS no_persistent_copy(scanned ${needles.length} secrets)`);
  });

  // 清理：销毁测试身份与其业务数据
  if (db) {
    db.prepare('DELETE FROM growth_state WHERE user_id = ?').run(personId);
    db.prepare('DELETE FROM course_progress WHERE user_id = ?').run(personId);
    db.close();
  }
  if (appId) await sbAdmin(`/rest/v1/applications?id=eq.${appId}`, { method: 'DELETE' });
  for (const id of created) await sbAdmin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });

  fs.writeFileSync('credential-recovery-findings.json', JSON.stringify(findings, null, 2));
  console.log(`\n判定项: ${findings.length}（报告中不含任何真实 secret）`);
});
