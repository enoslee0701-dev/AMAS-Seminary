/**
 * POST-LEGACY AUTH · 补齐两处未被覆盖的边界
 *
 * `d564c4c` 删除 legacy user authentication 之后，smoke 套件已覆盖
 * legacy token 被拒、/api/auth/me GET/PATCH 基本路径、service principal、
 * 以及 admin 端点的 403/200。本文件只补它没覆盖的两类断言：
 *
 *   §6  PATCH /api/auth/me 的**越权面**：客户端能否借请求体改掉
 *       canonical id / role / email / 认证身份。smoke 只验了改名成功与空名 400。
 *
 *   §14 授权 Source of Truth 的**反向**证明：SQLite users.role='admin'
 *       但 Supabase user_roles 没有管理角色时必须 403。
 *       smoke 的 admin 用例两边同时给足了权限，因此无法区分
 *       「按 Supabase 角色放行」与「按 SQLite role 放行」。
 *
 * 复用 helpers/supabaseHarness.ts —— 真实 ES256 / JWKS / iss / aud / REST 角色现查，
 * 后端跑的是 100% 生产代码路径，无任何 production 可开启的 test bypass。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  startFakeSupabase, provisionUser, freePort,
  type FakeSupabase, type ProvisionedUser,
} from './helpers/supabaseHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const APP_SECRET = 'post-legacy-audit-secret';

const DB_PATH = path.join(
  BACKEND_ROOT, '.tmp-test', `post-legacy-audit-${process.pid}-${Date.now()}.sqlite`,
);

let sb: FakeSupabase;
let proc: ChildProcess | null = null;
let baseUrl = '';

function request(
  method: string, pathname: string, body?: unknown, headers: Record<string, string> = {},
): Promise<{ status: number; json: any; text: string }> {
  const url = new URL(pathname, baseUrl);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: url.hostname, port: url.port, path: url.pathname, method,
        headers: {
          ...(payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      res => {
        let text = '';
        res.on('data', c => { text += c; });
        res.on('end', () => {
          let json: any = null;
          try { json = JSON.parse(text); } catch { /* 非 JSON */ }
          resolve({ status: res.statusCode ?? 0, json, text });
        });
      },
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

/** 只读地取一行 users 记录，用来证明数据库真的没被改。 */
function readUserRow(id: string): { id: string; email: string; name: string; role: string } | undefined {
  const d = new Database(DB_PATH, { readonly: true });
  try {
    return d.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(id) as any;
  } finally {
    d.close();
  }
}

before(async () => {
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  sb = await startFakeSupabase();

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const tsxCli = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  proc = spawn(process.execPath, [tsxCli, 'src/server.ts'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      APP_SECRET,
      GEMINI_API_KEY: 'dummy-gemini-key-for-tests',
      LIVEKIT_URL: 'wss://dummy.livekit.cloud',
      LIVEKIT_API_KEY: 'dummy-livekit-api-key',
      LIVEKIT_API_SECRET: 'dummy-livekit-api-secret-must-be-32-chars-long-xxxx',
      AGORA_APP_ID: 'dummy-agora-app-id',
      AGORA_APP_CERTIFICATE: 'dummy-agora-app-certificate',
      CORS_ORIGINS: '*',
      NODE_ENV: 'test',
      DB_PATH,
      SUPABASE_URL: sb.origin,
      SUPABASE_SERVICE_ROLE_KEY: 'post-legacy-audit-service-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  proc.stderr?.on('data', d => { stderr += d.toString(); });

  const start = Date.now();
  for (;;) {
    if (Date.now() - start > 20_000) throw new Error(`server 未就绪：\n${stderr}`);
    try {
      const r = await request('GET', '/api/health');
      if (r.status === 200) break;
    } catch { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 150));
  }
});

after(async () => {
  proc?.kill();
  await sb?.stop();
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
});

// ─────────────────── §6 · PATCH /api/auth/me 越权面 ───────────────────

test('PATCH /api/auth/me · 请求体里的 id / role / email 一律不可写', async () => {
  const u: ProvisionedUser = await provisionUser(DB_PATH, sb, {
    email: 'patch-guard@example.test', name: 'Patch Guard',
  });
  const before = readUserRow(u.user.id)!;
  assert.equal(before.role, 'student');

  const r = await request('PATCH', '/api/auth/me', {
    // 允许的字段
    name: 'Renamed OK',
    // 以下全部是越权尝试
    id: 'attacker-chosen-id',
    role: 'admin',
    email: 'attacker@example.test',
    authId: 'attacker-supabase-uuid',
    supabaseUserId: 'attacker-supabase-uuid',
  }, { authorization: `Bearer ${u.accessToken}` });

  assert.equal(r.status, 200, `允许字段应更新成功，实际 ${r.status} ${r.text}`);

  const after = readUserRow(u.user.id)!;
  assert.equal(after.name, 'Renamed OK', 'name 是允许字段，应已更新');
  assert.equal(after.id, u.user.id, 'canonical id 不得被请求体改写');
  assert.equal(after.role, 'student', '★ role 不得经此端点提权');
  assert.equal(after.email, 'patch-guard@example.test', 'email 不得经此端点变更');

  // 攻击者指定的 id 不得凭空出现一行
  assert.equal(readUserRow('attacker-chosen-id'), undefined, '不得创建攻击者指定 id 的用户');
});

test('PATCH /api/auth/me · 提权尝试后该用户仍然不是管理员', async () => {
  const u = await provisionUser(DB_PATH, sb, {
    email: 'patch-escalate@example.test', name: 'Patch Escalate',
  });
  await request('PATCH', '/api/auth/me', { name: 'X', role: 'admin' },
    { authorization: `Bearer ${u.accessToken}` });

  const r = await request('GET', '/api/cooperation', undefined,
    { authorization: `Bearer ${u.accessToken}` });
  assert.equal(r.status, 403, 'PATCH 提权尝试之后仍必须是 403');
});

test('PATCH /api/auth/me · ghost 身份 → 403 IDENTITY_NOT_PROVISIONED', async () => {
  const ghost = crypto.randomUUID();
  const token = await sb.mintToken(ghost);
  const r = await request('PATCH', '/api/auth/me', { name: 'Ghost Rename' },
    { authorization: `Bearer ${token}` });

  assert.equal(r.status, 403, `无映射必须 403，实际 ${r.status} ${r.text}`);
  assert.equal(r.json?.code, 'IDENTITY_NOT_PROVISIONED');
});

test('GET /api/auth/me · token 里的 name/avatar 不得冒充 canonical 资料', async () => {
  const u = await provisionUser(DB_PATH, sb, {
    email: 'profile-boundary@example.test',
    name: 'SQLite Canonical Name',
    avatar: '/canonical/real.png',
  });
  // 同一个 Supabase 身份，另签一张塞满假资料的 token
  const spoofed = await sb.mintToken(u.supabaseUserId, {
    user_metadata: { name: 'Token Claimed Name', avatar_url: 'https://attacker.example/evil.png' },
    app_metadata: { role: 'super_admin' },
  });

  const r = await request('GET', '/api/auth/me', undefined, { authorization: `Bearer ${spoofed}` });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.id, u.user.id, 'id 必须是 canonical SQLite id');
  assert.equal(r.json.user.name, 'SQLite Canonical Name', '显示名必须来自 SQLite');
  assert.notEqual(r.json.user.name, 'Token Claimed Name');
  assert.equal(r.json.user.avatar, '/canonical/real.png', '头像必须来自 SQLite');
  assert.notEqual(r.json.user.role, 'super_admin', 'token 自称的 role 不得进入响应');
});

// ─────────────────── §14 · 授权 Source of Truth 反向证明 ───────────────────

test('角色 SoT · SQLite users.role=admin 但 Supabase 无管理角色 → 403', async () => {
  // 关键构造：canonical 行写 admin，但**不**给 Supabase user_roles 任何角色。
  // 若 requireAdmin 退回用 principal.user.role 判权，这里会错误放行。
  const u = await provisionUser(DB_PATH, sb, {
    email: 'sqlite-admin-only@example.test',
    name: 'SQLite Admin Only',
    role: 'admin',
    supabaseRole: 'student',   // 覆盖 provisionUser 对 admin 的默认 super_admin
  });
  sb.setRoles(u.supabaseUserId, []);   // 明确清空：Supabase 侧没有任何角色
  assert.equal(readUserRow(u.user.id)!.role, 'admin', '前提：SQLite 里确实是 admin');

  const r = await request('GET', '/api/cooperation', undefined,
    { authorization: `Bearer ${u.accessToken}` });
  assert.equal(
    r.status, 403,
    `★ 授权只能以 Supabase user_roles 为准；SQLite users.role 不得授予管理员权限。实际 ${r.status}`,
  );
});

test('角色 SoT · Supabase user_roles=super_admin 且 SQLite role=student → 放行', async () => {
  // 反过来：业务角色是 student，但 Supabase 授了管理角色 —— 必须放行，
  // 证明放行依据确实是 Supabase 侧的现查结果。
  const u = await provisionUser(DB_PATH, sb, {
    email: 'supabase-admin-only@example.test',
    name: 'Supabase Admin Only',
    role: 'student',
    supabaseRole: 'super_admin',
  });
  assert.equal(readUserRow(u.user.id)!.role, 'student', '前提：SQLite 里是普通学员');

  const r = await request('GET', '/api/cooperation', undefined,
    { authorization: `Bearer ${u.accessToken}` });
  assert.equal(r.status, 200, `Supabase 授了管理角色就应放行，实际 ${r.status} ${r.text}`);
});

test('角色 SoT · 角色撤销后立即失效（每次现查，不缓存）', async () => {
  const u = await provisionUser(DB_PATH, sb, {
    email: 'role-revoke@example.test', name: 'Role Revoke',
    role: 'student', supabaseRole: 'super_admin',
  });
  const ok = await request('GET', '/api/cooperation', undefined,
    { authorization: `Bearer ${u.accessToken}` });
  assert.equal(ok.status, 200, '撤销前应放行');

  sb.setRoles(u.supabaseUserId, []);   // 撤销

  const denied = await request('GET', '/api/cooperation', undefined,
    { authorization: `Bearer ${u.accessToken}` });
  assert.equal(denied.status, 403, '★ 角色撤销必须立即生效，不得因缓存继续放行');
});

// ─────────────────── §8 · service principal 未被误伤 ───────────────────

test('service auth · 有效 APP_SECRET 仍是 machine-admin', async () => {
  const r = await request('GET', '/api/cooperation', undefined,
    { authorization: `Bearer ${APP_SECRET}` });
  assert.equal(r.status, 200, `service principal 不得因删除 legacy user auth 被误伤，实际 ${r.status}`);
});

test('service auth · 错误的 APP_SECRET 被拒（401）', async () => {
  const r = await request('GET', '/api/cooperation', undefined,
    { authorization: 'Bearer wrong-app-secret-value' });
  assert.equal(r.status, 401);
});

test('service auth · service principal 不会被当成普通用户身份', async () => {
  // /api/auth/me 需要 user principal；service token 必须拿不到"我是谁"。
  const r = await request('GET', '/api/auth/me', undefined,
    { authorization: `Bearer ${APP_SECRET}` });
  assert.equal(r.status, 401, 'service principal 不得静默变成用户身份');
  assert.equal(r.json?.user, undefined, '不得返回任何用户资料');
});
