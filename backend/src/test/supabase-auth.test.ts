/**
 * AUTH-M2/M3 · Supabase 统一身份接入验收
 *
 * 需要真实 Supabase 项目：从 AMAS_ENV 指向的 staging.env 读取 URL / ANON / SERVICE。
 * 未提供时整组跳过（不让 CI 因缺环境而假失败）。
 *
 * 运行：AMAS_ENV=<path>/staging.env npx tsx --test src/test/supabase-auth.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');

const envPath = process.env.AMAS_ENV;
const hasEnv = Boolean(envPath && fs.existsSync(envPath));
const ENV: Record<string, string> = hasEnv
  ? Object.fromEntries(
      fs.readFileSync(envPath!, 'utf8').trim().split(/\r?\n/).map(l => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
    )
  : {};

const skip = !hasEnv ? 'AMAS_ENV 未提供，跳过 Supabase 接入测试' : false;

function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const a = srv.address();
      if (typeof a === 'object' && a) { const p = a.port; srv.close(() => resolve(p)); }
      else srv.close(() => reject(new Error('no free port')));
    });
  });
}

const H = (key: string, jwt?: string) => ({
  apikey: key, Authorization: `Bearer ${jwt ?? key}`, 'Content-Type': 'application/json',
});

let proc: ChildProcess | null = null;
let base = '';
let dbFile = '';
const created: string[] = [];

async function sbAdmin(path: string, init: RequestInit = {}) {
  return fetch(`${ENV.URL}${path}`, { ...init, headers: { ...H(ENV.SERVICE), ...(init.headers ?? {}) } });
}

async function mkUser(email: string, password: string) {
  const r = await (await sbAdmin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: '接入测试' } }),
  })).json() as { id: string };
  created.push(r.id);
  return r.id;
}

async function signIn(email: string, password: string) {
  const r = await (await fetch(`${ENV.URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: H(ENV.ANON), body: JSON.stringify({ email, password }),
  })).json() as { access_token: string };
  return r.access_token;
}

const api = (path: string, jwt?: string, init: RequestInit = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...(init.headers ?? {}) },
  });

test('AUTH-M2 Supabase 身份接入', { skip }, async (t) => {
  const port = await pickFreePort();
  base = `http://127.0.0.1:${port}`;
  // 独立数据库文件：不污染开发库，跑完删除
  dbFile = path.join(os.tmpdir(), `amas-authm2-${Date.now().toString(36)}.sqlite`);
  proc = spawn(process.execPath, ['--import', 'tsx', path.join(BACKEND_ROOT, 'src/server.ts')], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbFile,
      APP_SECRET: 'authm2-test-secret',
      JWT_SECRET: 'authm2-test-jwt-secret',
      SUPABASE_URL: ENV.URL,
      SUPABASE_SERVICE_ROLE_KEY: ENV.SERVICE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // 等待端口就绪
  for (let i = 0; i < 60; i++) {
    try { await fetch(`${base}/api/health`); break; } catch { await new Promise(r => setTimeout(r, 250)); }
  }

  const tag = Date.now().toString(36);
  const PW = 'AuthM2!2026x';
  const stuEmail = `authm2-stu-${tag}@amas-test.dev`;
  const admEmail = `authm2-adm-${tag}@amas-test.dev`;
  const stuId = await mkUser(stuEmail, PW);
  const admId = await mkUser(admEmail, PW);
  await sbAdmin('/rest/v1/user_roles', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: admId, role: 'registrar', granted_by: admId }),
  });
  const stuJwt = await signIn(stuEmail, PW);
  const admJwt = await signIn(admEmail, PW);

  await t.test('无凭据一律 401（不再有 dev 开门）', async () => {
    const r = await api('/api/courses/progress');
    assert.equal(r.status, 401);
  });

  await t.test('Supabase 学生 token 可通过 requireAuth', async () => {
    const r = await api('/api/courses/progress', stuJwt);
    assert.equal(r.status, 200);
  });

  await t.test('普通 student 全程无需 MFA（aal1 即可读写学习数据）', async () => {
    const payload = JSON.parse(Buffer.from(stuJwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    assert.equal(payload.aal, 'aal1', '测试前提：该 token 应为 aal1');
    const put = await api('/api/growth/state', stuJwt, {
      method: 'PUT', body: JSON.stringify({ state: { hello: 'world' } }),
    });
    assert.equal(put.status, 200, 'aal1 学生应能写成长状态，不得强制 TOTP');
    const get = await api('/api/growth/state', stuJwt);
    assert.equal(get.status, 200);
    const body = await get.json() as { state: { hello?: string } | null };
    assert.equal(body.state?.hello, 'world');
  });

  await t.test('用户数据按 Supabase uid 隔离（不另建第二套身份映射）', async () => {
    // 另一个 Supabase 用户读同一端点，必须看不到上一个用户写入的内容
    const otherEmail = `authm2-oth-${tag}@amas-test.dev`;
    await mkUser(otherEmail, PW);
    const otherJwt = await signIn(otherEmail, PW);
    const r = await api('/api/growth/state', otherJwt);
    assert.equal(r.status, 200);
    const body = await r.json() as { state: unknown };
    assert.equal(body.state, null, '不同 Supabase 用户之间的成长状态必须互相隔离');
  });

  await t.test('伪造签名的 Supabase token 被拒（不回退到 legacy 验签）', async () => {
    const [h, p] = stuJwt.split('.');
    const forged = `${h}.${p}.AAAAinvalidsignatureAAAA`;
    const r = await api('/api/courses/progress', forged);
    assert.equal(r.status, 401);
  });

  await t.test('客户端声明的 role 不构成授权', async () => {
    // 学生 token 打管理端点：JWT 里没有任何管理声明，且服务端现查角色
    const r = await api('/api/courses', stuJwt, {
      method: 'POST', body: JSON.stringify({ id: 'c_hack', title: '伪造课程' }),
    });
    assert.equal(r.status, 403);
  });

  await t.test('Supabase 管理角色可通过 requireAdmin', async () => {
    const r = await api('/api/courses', admJwt, {
      method: 'POST',
      body: JSON.stringify({ id: `c_authm2_${tag}`, title: 'AUTH-M2 测试课程',
        instructor: '测试讲师', category: 'nt', level: 'BTH' }),
    });
    assert.ok(r.status === 200 || r.status === 201, `expected 2xx, got ${r.status}`);
  });

  await t.test('★ 撤销角色后同一张旧 JWT 立即失去管理权限', async () => {
    const rows = await (await sbAdmin(
      `/rest/v1/user_roles?select=id&user_id=eq.${admId}&role=eq.registrar&revoked_at=is.null`)).json() as Array<{ id: string }>;
    await sbAdmin(`/rest/v1/user_roles?id=eq.${rows[0].id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    const r = await api('/api/courses', admJwt, {
      // 用完整合法的请求体，这样 403 只可能来自授权，不会与 400 校验错误混淆
      method: 'POST', body: JSON.stringify({ id: `c_after_${tag}`, title: '撤销后',
        instructor: '测试讲师', category: 'nt', level: 'BTH' }),
    });
    assert.equal(r.status, 403, '角色现查必须即时生效，不得等到 JWT 过期');
  });

  // 清理：整个测试库是临时文件，直接删掉即可
  for (const id of created) await sbAdmin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  proc?.kill();
  await new Promise(r => setTimeout(r, 300));
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
    try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
  }
});
