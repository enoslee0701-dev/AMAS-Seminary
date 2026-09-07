/**
 * AUTH-M7 · Runtime Identity Resolution 本地验收
 *
 * 这一套**完全本地、可重复、无外部前提**：不需要 staging.env、不需要
 * SB_ACCESS_TOKEN、不需要真实 Supabase 项目。
 *
 * 怎么做到的：起一个本地 HTTP 服务假扮 Supabase 项目，提供两个端点
 *   GET /auth/v1/.well-known/jwks.json   —— 真实的 ES256 公钥
 *   GET /rest/v1/user_roles              —— 角色现查
 * 然后把 SUPABASE_URL 指向它。
 *
 * ★ 关键：这**不是** mock，也不是测试逃生口。后端跑的是 100% 的生产代码路径
 *   （jose 远端 JWKS + ES256 验签 + iss/aud 校验 + REST 角色现查），
 *   变的只有配置里的 issuer 地址。项目明令禁止的是
 *   VOICE_GUARD_ALLOW_MOCK 那种「production 里也能打开的开关」——
 *   这里没有新增任何这类开关，生产构建里不存在任何为测试留的分支。
 *
 * 运行：npm test（本地套件的一部分，无外部依赖）
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');

const APP_SECRET = 'authm7-test-secret';
const SERVICE_KEY = 'authm7-test-service-key';

const TEST_DB_PATH = path.join(
  BACKEND_ROOT, '.tmp-test', `authm7-${process.pid}-${Date.now()}.sqlite`,
);

// ---- 身份夹具：认证身份与业务身份**故意取不同的值**，D-1 才测得出来 ----
const UUID_A = '11111111-2222-4333-8444-555555555555';   // Supabase 认证身份
const LEGACY_123 = 'legacy-123';                          // canonical SQLite 身份
const REAL_NAME = 'Real Student';
const REAL_AVATAR = '/real/avatar.png';

/** token 里塞的假资料。任何一项进入业务数据都是失败。 */
const FAKE_NAME = 'Fake Admin Name';
const FAKE_AVATAR = 'https://attacker.example/evil.png';

let privateKey: PrivateKey;
let fakeSupabase: http.Server;
let supabaseOrigin = '';
/** 本轮 /rest/v1/user_roles 要返回的角色，按 user_id 索引。 */
let rolesByUserId: Record<string, string[]> = {};
let serverProcess: ChildProcess | null = null;
let baseUrl = '';

const rmTestDb = () => {
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(TEST_DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
};

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(p));
    });
  });
}

async function request(
  method: string, pathname: string, body?: unknown, headers: Record<string, string> = {},
): Promise<{ status: number; json: any; text: string }> {
  const url = new URL(pathname, baseUrl);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      res => {
        let text = '';
        res.on('data', c => { text += c; });
        res.on('end', () => {
          let json: any = null;
          try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
          resolve({ status: res.statusCode ?? 0, json, text });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** 签一张真实可验证的 Supabase 风格 access token。 */
async function mintToken(sub: string, extra: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({
    email: `${sub}@example.test`,
    user_metadata: { name: FAKE_NAME, avatar_url: FAKE_AVATAR },
    app_metadata: { role: 'admin' },     // token 自称 admin —— 必须无效
    ...extra,
  })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setIssuer(`${supabaseOrigin}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(sub)
    .setExpirationTime('10m')
    .sign(privateKey);
}

/** 直接写 fixture 库：canonical 用户 + 映射行。刻意不经任何 HTTP 端点。 */
function seed(rows: {
  users?: { id: string; email: string; name: string; role?: string; avatar?: string | null }[];
  map?: { legacy: string | null; supabase: string | null; status: string; email?: string }[];
}): void {
  const d = new Database(TEST_DB_PATH);
  try {
    for (const u of rows.users ?? []) {
      d.prepare(
        `INSERT OR REPLACE INTO users
           (id, email, name, password_hash, salt, role, degree, avatar, bio, created_at)
         VALUES (?, ?, ?, 'x', 'x', ?, NULL, ?, NULL, ?)`,
      ).run(u.id, u.email, u.name, u.role ?? 'student', u.avatar ?? null, Date.now());
    }
    for (const m of rows.map ?? []) {
      d.prepare(
        `INSERT OR REPLACE INTO legacy_user_map
           (legacy_user_id, supabase_user_id, normalized_email, mapping_status,
            mapping_reason, migration_batch, created_at)
         VALUES (?, ?, ?, ?, 'test-fixture', 'authm7-test', ?)`,
      ).run(m.legacy ?? crypto.randomUUID(), m.supabase, m.email ?? 'x@example.test', m.status, Date.now());
    }
  } finally {
    d.close();
  }
}

/** 直接给 fixture 库播种 growth_state，用作"业务层拿到的是哪个 id"的探针。 */
function seedGrowth(userId: string, state: unknown): void {
  const d = new Database(TEST_DB_PATH);
  try {
    d.prepare(
      `INSERT OR REPLACE INTO growth_state (user_id, state_json, updated_at) VALUES (?, ?, ?)`,
    ).run(userId, JSON.stringify(state), Date.now());
  } finally {
    d.close();
  }
}

function countRows(table: string, column: string, value: string): number {
  const d = new Database(TEST_DB_PATH);
  try {
    const r = d.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`).get(value) as { n: number };
    return r.n;
  } finally {
    d.close();
  }
}

before(async () => {
  rmTestDb();
  fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });

  // ---- 本地假 Supabase：真 ES256 密钥对 + JWKS + user_roles ----
  const kp = await generateKeyPair('ES256', { extractable: true });
  privateKey = kp.privateKey;
  const publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = 'authm7-test-key';
  publicJwk.alg = 'ES256';
  publicJwk.use = 'sig';

  fakeSupabase = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (u.pathname === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    if (u.pathname === '/rest/v1/user_roles') {
      // 复刻 Supabase PostgREST 的 user_id=eq.<id> 过滤
      const filter = u.searchParams.get('user_id') ?? '';
      const id = filter.startsWith('eq.') ? decodeURIComponent(filter.slice(3)) : '';
      const roles = (rolesByUserId[id] ?? []).map(role => ({ role, expires_at: null }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(roles));
      return;
    }
    res.writeHead(404).end('{}');
  });
  const sbPort = await freePort();
  await new Promise<void>(r => fakeSupabase.listen(sbPort, '127.0.0.1', r));
  supabaseOrigin = `http://127.0.0.1:${sbPort}`;

  // ---- 起后端，指向本地假 Supabase ----
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const tsxCli = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  serverProcess = spawn(process.execPath, [tsxCli, 'src/server.ts'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      APP_SECRET,
      JWT_SECRET: 'authm7-test-jwt-secret',
      GEMINI_API_KEY: 'dummy-gemini-key-for-tests',
      LIVEKIT_URL: 'wss://dummy.livekit.cloud',
      LIVEKIT_API_KEY: 'dummy-livekit-api-key',
      LIVEKIT_API_SECRET: 'dummy-livekit-api-secret-must-be-32-chars-long-xxxx',
      AGORA_APP_ID: 'dummy-agora-app-id',
      AGORA_APP_CERTIFICATE: 'dummy-agora-app-certificate',
      CORS_ORIGINS: '*',
      NODE_ENV: 'test',
      DB_PATH: TEST_DB_PATH,
      SUPABASE_URL: supabaseOrigin,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stderr?.on('data', d => process.stderr.write(`[server.err] ${d}`));

  const start = Date.now();
  for (;;) {
    if (Date.now() - start > 20_000) throw new Error('backend did not become ready');
    try {
      const r = await request('GET', '/api/health');
      if (r.status === 200) break;
    } catch { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 150));
  }

  // canonical 用户：名字与头像都是"真的"，与 token 里的假资料完全不同
  seed({
    users: [{ id: LEGACY_123, email: 'real@example.test', name: REAL_NAME, avatar: REAL_AVATAR }],
    map: [{ legacy: LEGACY_123, supabase: UUID_A, status: 'mapped', email: 'real@example.test' }],
  });
});

after(async () => {
  serverProcess?.kill();
  await new Promise<void>(r => fakeSupabase?.close(() => r()));
  rmTestDb();
});

// ─────────────────────────── §14 双身份分离（D-1 核心验收） ───────────────────────────

test('AUTH-M7 · principal 携带两个身份：authId=Supabase UUID，user.id=canonical SQLite id', async () => {
  // 探针：growth_state 按 principal.user.id 取行。预先只给 canonical id 播种，
  // 取到它就证明业务层拿到的是 canonical SQLite 身份而非 Supabase UUID。
  seedGrowth(LEGACY_123, { marker: 'canonical' });
  seedGrowth(UUID_A, { marker: 'supabase-uuid' });   // 陷阱行：不该被读到

  const token = await mintToken(UUID_A);
  const r = await request('GET', '/api/growth/state', undefined, { authorization: `Bearer ${token}` });

  assert.equal(r.status, 200, `应放行，实际 ${r.status} ${r.text}`);
  assert.equal(r.json.state.marker, 'canonical', '业务路由必须按 canonical SQLite id 取数据');
  assert.notEqual(r.json.state.marker, 'supabase-uuid', 'principal.user.id 不得是 Supabase UUID');
});

test('AUTH-M7 · requireAdmin 用 authId 查角色（给 UUID-A 授角色 → 放行）', async () => {
  rolesByUserId = { [UUID_A]: ['super_admin'] };   // Portal 口径：registrar / academic_admin / super_admin
  const token = await mintToken(UUID_A);
  const r = await request('GET', '/api/cooperation', undefined, { authorization: `Bearer ${token}` });
  assert.notEqual(r.status, 403, `按 authId 查到 admin 角色应放行，实际 403：${r.text}`);
});

test('AUTH-M7 · D-1 回归：角色只挂在 canonical SQLite id 上时必须 403（证明查的不是 user.id）', async () => {
  // 只给 LEGACY-123 授角色。如果实现回退成 fetchActiveRoles(principal.user.id)，
  // 这里会错误地放行 —— 那正是 D-1 描述的静默故障的镜像。
  rolesByUserId = { [LEGACY_123]: ['super_admin'] };
  const token = await mintToken(UUID_A);
  const r = await request('GET', '/api/cooperation', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 403, '角色查询必须以 Supabase UUID 为键，不得使用 canonical SQLite id');
  rolesByUserId = {};
});

// ─────────────────────────── §16 资料信任边界 ───────────────────────────

test('AUTH-M7 · token 里的 name/avatar 不得进入业务身份', async () => {
  rolesByUserId = {};
  const token = await mintToken(UUID_A);
  // POST /api/posts 会把 principal.user 的 name/avatar/role 直接落库 ——
  // 这正是 ghost 身份此前能用 token 里的名字发帖的那条路径。
  const r = await request(
    'POST', '/api/posts', { content: 'identity boundary probe', category: 'general' }, { authorization: `Bearer ${token}` },
  );

  assert.equal(r.status, 200, `canonical 用户应能发帖，实际 ${r.status} ${r.text}`);
  assert.equal(r.json.userId, LEGACY_123, '业务数据必须挂在 canonical SQLite id 上');
  assert.equal(r.json.userName, REAL_NAME, '显示名必须来自服务器 canonical user');
  assert.notEqual(r.json.userName, FAKE_NAME, 'token 里的名字不得成为业务资料');
  assert.equal(r.json.userAvatar, REAL_AVATAR, '头像必须来自服务器 canonical user');
  assert.notEqual(r.json.userAvatar, FAKE_AVATAR, 'token 里的头像不得成为业务资料');
});

test('AUTH-M7 · token 自称 admin 不产生管理员权限', async () => {
  rolesByUserId = {};   // Supabase 侧没有任何角色
  const token = await mintToken(UUID_A);   // token 的 app_metadata.role = 'admin'
  const r = await request('GET', '/api/cooperation', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 403, 'token 自称的 role 不得被信任');
});

// ─────────────────────────── §15 mapping_status 门禁 ───────────────────────────

const GHOST = '99999999-8888-4777-8666-555555555555';

async function expectDenied(sub: string, why: string): Promise<void> {
  const token = await mintToken(sub);
  const r = await request('GET', '/api/growth/state', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 403, `${why}：应 403，实际 ${r.status} ${r.text}`);
  assert.equal(r.json?.code, 'IDENTITY_NOT_PROVISIONED', `${why}：错误码应为 IDENTITY_NOT_PROVISIONED`);
}

test('AUTH-M7 · mapping_status=provisioned 放行', async () => {
  const sub = '22222222-2222-4222-8222-222222222222';
  seed({
    users: [{ id: 'legacy-prov', email: 'prov@example.test', name: 'Provisioned User' }],
    map: [{ legacy: 'legacy-prov', supabase: sub, status: 'provisioned' }],
  });
  seedGrowth('legacy-prov', { marker: 'prov' });
  const token = await mintToken(sub);
  const r = await request('GET', '/api/growth/state', undefined, { authorization: `Bearer ${token}` });
  assert.equal(r.status, 200);
  assert.equal(r.json.state.marker, 'prov');
});

test('AUTH-M7 · mapping_status=needs_provision → 403', async () => {
  const sub = '33333333-3333-4333-8333-333333333333';
  seed({
    users: [{ id: 'legacy-needs', email: 'needs@example.test', name: 'Needs' }],
    map: [{ legacy: 'legacy-needs', supabase: sub, status: 'needs_provision' }],
  });
  await expectDenied(sub, 'needs_provision');
});

test('AUTH-M7 · mapping_status=provision_failed → 403', async () => {
  const sub = '44444444-4444-4444-8444-444444444444';
  seed({
    users: [{ id: 'legacy-failed', email: 'failed@example.test', name: 'Failed' }],
    map: [{ legacy: 'legacy-failed', supabase: sub, status: 'provision_failed' }],
  });
  await expectDenied(sub, 'provision_failed');
});

test('AUTH-M7 · mapping_status=skipped_test_account → 403（不得因为"表里有一行"就放行）', async () => {
  const sub = '55555555-5555-4555-8555-555555555555';
  seed({
    users: [{ id: 'legacy-test-acct', email: 'test@example.test', name: 'Test Account' }],
    map: [{ legacy: 'legacy-test-acct', supabase: sub, status: 'skipped_test_account' }],
  });
  await expectDenied(sub, 'skipped_test_account');
});

test('AUTH-M7 · 未知 mapping_status → 403（白名单，不是黑名单）', async () => {
  const sub = '66666666-6666-4666-8666-666666666666';
  seed({
    users: [{ id: 'legacy-unknown', email: 'unknown@example.test', name: 'Unknown' }],
    map: [{ legacy: 'legacy-unknown', supabase: sub, status: 'some_future_status' }],
  });
  await expectDenied(sub, 'unknown status');
});

test('AUTH-M7 · 完全没有映射 → 403', async () => {
  await expectDenied(GHOST, 'missing mapping');
});

test('AUTH-M7 · 映射行存在但 canonical SQLite 用户不存在 → 403（不得凭映射复活身份）', async () => {
  const sub = '77777777-7777-4777-8777-777777777777';
  seed({ map: [{ legacy: 'legacy-deleted-user', supabase: sub, status: 'mapped' }] });
  await expectDenied(sub, 'missing SQLite user');
});

test('AUTH-M7 · supabase_user_id 为 NULL 的映射行不可被匹配 → 403', async () => {
  const sub = '88888888-8888-4888-8888-888888888888';
  seed({
    users: [{ id: 'legacy-null-sb', email: 'nullsb@example.test', name: 'Null SB' }],
    map: [{ legacy: 'legacy-null-sb', supabase: null, status: 'mapped' }],
  });
  await expectDenied(sub, 'NULL supabase_user_id');
});

// ─────────────────────────── §17 Ghost 写入 ───────────────────────────

test('AUTH-M7 · ghost 身份无法写任何业务端点，且数据库不留痕', async () => {
  const token = await mintToken(GHOST);
  const h = { authorization: `Bearer ${token}` };

  const writes: [string, string, unknown][] = [
    ['POST', '/api/posts', { content: 'ghost post', category: 'general' }],
    ['PUT', '/api/growth/state', { v: 2, data: {} }],
    ['PUT', '/api/pt/state', { v: 1, data: {} }],
    ['POST', '/api/courses/c_bible_intro/progress', { progress: 50 }],
    ['POST', '/api/library/favorites/b1', undefined],
    ['POST', '/api/push/register', { token: 'ghost-device-token', platform: 'ios' }],
  ];

  for (const [method, pathname, body] of writes) {
    const r = await request(method, pathname, body, h);
    assert.equal(
      r.status, 403,
      `${method} ${pathname} 必须 403（认证有效但无 AMAS 身份），实际 ${r.status} ${r.text}`,
    );
    assert.equal(r.json?.code, 'IDENTITY_NOT_PROVISIONED', `${method} ${pathname} 错误码不对`);
  }

  // 一行 ghost 数据都不许落库
  for (const [table, col] of [
    ['posts', 'user_id'], ['growth_state', 'user_id'], ['pt_state', 'user_id'],
    ['course_progress', 'user_id'], ['library_favorites', 'user_id'], ['push_tokens', 'user_id'],
  ] as const) {
    assert.equal(countRows(table, col, GHOST), 0, `${table} 里出现了 ghost 用户的数据`);
  }
});

test('AUTH-M7 · ghost 身份不再靠外键约束才被挡住（应在 auth 层就 403，而非 500）', async () => {
  const token = await mintToken(GHOST);
  const r = await request(
    'POST', '/api/rooms/prayer_room/join', {}, { authorization: `Bearer ${token}` },
  );
  assert.equal(r.status, 403, `应在身份解析层拒绝，实际 ${r.status} ${r.text}`);
  assert.notEqual(r.status, 500, '不得以 SQLITE FK 错误的形式暴露"没有资格"');
});

// ─────────────────────────── 认证失败 vs 无身份，必须可区分 ───────────────────────────

test('AUTH-M7 · 无 token → 401（不是 403）', async () => {
  const r = await request('GET', '/api/growth/state');
  assert.equal(r.status, 401);
});

test('AUTH-M7 · 伪造签名的 Supabase token → 401（不是 403）', async () => {
  const otherKp = await generateKeyPair('ES256', { extractable: true });
  const forged = await new SignJWT({ email: 'x@example.test' })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setIssuer(`${supabaseOrigin}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(UUID_A)
    .setExpirationTime('10m')
    .sign(otherKp.privateKey);

  const r = await request('GET', '/api/growth/state', undefined, { authorization: `Bearer ${forged}` });
  assert.equal(r.status, 401, '验签失败是认证失败，必须 401 而不是 403');
});

test('AUTH-M7 · 过期的 Supabase token → 401', async () => {
  const expired = await new SignJWT({ email: 'x@example.test' })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setIssuer(`${supabaseOrigin}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(UUID_A)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(privateKey);

  const r = await request('GET', '/api/growth/state', undefined, { authorization: `Bearer ${expired}` });
  assert.equal(r.status, 401);
});

test('AUTH-M7 · 有效签名但 issuer 不对 → 401（绝不回退 legacy 验签）', async () => {
  const wrongIss = await new SignJWT({ email: 'x@example.test' })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setIssuer('https://evil.example/auth/v1')
    .setAudience('authenticated')
    .setSubject(UUID_A)
    .setExpirationTime('10m')
    .sign(privateKey);

  const r = await request('GET', '/api/growth/state', undefined, { authorization: `Bearer ${wrongIss}` });
  assert.notEqual(r.status, 200, 'issuer 不匹配的 token 不得被接受');
});
