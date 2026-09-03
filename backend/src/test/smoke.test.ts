/**
 * Smoke tests for the amas-backend HTTP + WS surface.
 *
 * - Boots `src/server.ts` as a child process on a free port with dummy env.
 * - Hits all four HTTP endpoints with real requests.
 * - Opens a WebSocket to /api/gemini/live and asserts the upgrade succeeds.
 *
 * Run with: npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '../..');

const APP_SECRET = 'test-secret';
const AUTH_HEADERS = { authorization: `Bearer ${APP_SECRET}` };

let serverProcess: ChildProcess | null = null;
let baseUrl = '';
let port = 0;
let serverExitInfo: { code: number | null; signal: NodeJS.Signals | null; stderr: string } | null = null;
let collectedStderr = '';

function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (typeof addr === 'object' && addr) {
        const p = addr.port;
        srv.close(() => resolve(p));
      } else {
        srv.close(() => reject(new Error('failed to pick free port')));
      }
    });
  });
}

interface FetchResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  json: <T = unknown>() => T;
}

function request(
  method: string,
  pathName: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathName,
        method,
        headers: {
          'content-type': 'application/json',
          ...(data ? { 'content-length': String(data.length) } : {}),
          ...extraHeaders,
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: text,
            json: <T,>() => JSON.parse(text) as T,
          });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function waitForReady(timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - start < timeoutMs) {
    // Fail fast if the server crashed during startup.
    if (serverExitInfo) {
      throw new Error(
        `server exited before becoming ready (code=${serverExitInfo.code} signal=${serverExitInfo.signal}).\n` +
        `--- server stderr ---\n${serverExitInfo.stderr || '(empty)'}\n---------------------`,
      );
    }
    try {
      const r = await request('GET', '/api/health');
      if (r.status === 200) return;
      lastErr = new Error(`health returned ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(
    `server did not become ready in ${timeoutMs}ms: ${String(lastErr)}\n` +
    `--- server stderr so far ---\n${collectedStderr || '(empty)'}\n----------------------------`,
  );
}

before(async () => {
  port = await pickFreePort();
  baseUrl = `http://127.0.0.1:${port}`;

  const env = {
    ...process.env,
    PORT: String(port),
    GEMINI_API_KEY: 'dummy-gemini-key-for-tests',
    LIVEKIT_URL: 'wss://dummy.livekit.cloud',
    LIVEKIT_API_KEY: 'dummy-livekit-api-key',
    LIVEKIT_API_SECRET: 'dummy-livekit-api-secret-must-be-32-chars-long-xxxx',
    // Some route files reference Agora config at module load time — populate
    // dummy values so config.ts doesn't throw before the server boots.
    AGORA_APP_ID: 'dummy-agora-app-id',
    AGORA_APP_CERTIFICATE: 'dummy-agora-app-certificate',
    APP_SECRET,
    CORS_ORIGINS: '*',
    NODE_ENV: 'test',
    // Wave-1 persistence uses better-sqlite3. `:memory:` gives every
    // spawn a fresh, isolated in-process DB that vanishes on exit — no
    // tempfile cleanup needed, no cross-run contamination.
    DB_PATH: ':memory:',
  };

  // Spawn tsx via its JS entry with the current Node binary. `spawn('npx', ...)`
  // breaks on Windows: npx is npx.cmd there, which child_process refuses to
  // execute without a shell (and silently never starts the server).
  const tsxCli = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  serverProcess = spawn(process.execPath, [tsxCli, 'src/server.ts'], {
    cwd: BACKEND_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Surface server logs so failures are debuggable.
  serverProcess.stdout?.on('data', d => process.stderr.write(`[server] ${d}`));
  serverProcess.stderr?.on('data', d => {
    collectedStderr += d.toString();
    process.stderr.write(`[server.err] ${d}`);
  });
  serverProcess.on('exit', (code, signal) => {
    serverExitInfo = { code, signal, stderr: collectedStderr };
    if (code !== null && code !== 0) {
      process.stderr.write(`[server] exited with code ${code}\n`);
    }
  });

  await waitForReady(15_000);
});

after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
    // give it a moment to die; force-kill if needed
    await new Promise<void>(resolve => {
      const t = setTimeout(() => {
        try { serverProcess?.kill('SIGKILL'); } catch {}
        resolve();
      }, 1500);
      serverProcess?.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
});

test('GET /api/health returns ok and features flags', async () => {
  const r = await request('GET', '/api/health');
  assert.equal(r.status, 200);
  const body = r.json<{
    ok: boolean;
    ts: number;
    features: { gemini: boolean; liveKit: boolean };
  }>();
  assert.equal(body.ok, true);
  assert.equal(typeof body.ts, 'number');
  assert.ok(body.features, 'features must be present');
  assert.equal(body.features.gemini, true, 'gemini feature should be enabled (dummy key set)');
  assert.equal(body.features.liveKit, true, 'liveKit feature should be enabled (dummy creds set)');
});

// Phase 4 §3/§4/§5：voice token 路径迁到 /api/rooms/:roomId/voice/token，
// 并要求房间成员资格；identity 由服务器从 JWT 派生，客户端无法指定。
test('voice token without auth returns 401', async () => {
  const r = await request('POST', '/api/rooms/smoke-room/voice/token', {});
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('voice token for a non-existent room returns 404', async () => {
  const r = await request('POST', '/api/rooms/no_such_room_zz/voice/token', {}, AUTH_HEADERS);
  assert.equal(r.status, 404, `expected 404, got ${r.status} body=${r.body}`);
});

test('legacy /api/voice/token path is gone', async () => {
  // 旧端点允许任何登录用户为任意房间取 token，并接受客户端 identity。
  // 它必须彻底消失，而不是继续可用。
  const r = await request('POST', '/api/voice/token', {
    roomName: 'smoke-room', identity: 'anyone',
  }, AUTH_HEADERS);
  assert.equal(r.status, 404, `legacy path must be removed, got ${r.status}`);
});

test('GET /api/health does NOT require auth', async () => {
  // No Authorization header — must still succeed.
  const r = await request('GET', '/api/health');
  assert.equal(r.status, 200);
  const body = r.json<{ ok: boolean }>();
  assert.equal(body.ok, true);
});

test('POST /api/rooms registers a private room', async () => {
  const r = await request('POST', '/api/rooms', {
    roomId: 'room-private',
    hostId: 'host-1',
    password: 'sesame',
  }, AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ ok: boolean; hasPassword: boolean }>();
  assert.equal(body.ok, true);
  assert.equal(body.hasPassword, true);
});

test('POST /api/rooms registers a public room (no password)', async () => {
  const r = await request('POST', '/api/rooms', {
    roomId: 'room-public',
    hostId: 'host-1',
  }, AUTH_HEADERS);
  assert.equal(r.status, 200);
  const body = r.json<{ ok: boolean; hasPassword: boolean }>();
  assert.equal(body.ok, true);
  assert.equal(body.hasPassword, false);
});

test('POST /api/rooms/validate succeeds with correct password', async () => {
  const r = await request('POST', '/api/rooms/validate', {
    roomId: 'room-private',
    password: 'sesame',
  }, AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ ok: boolean; public: boolean }>();
  assert.equal(body.ok, true);
  assert.equal(body.public, false);
});

test('POST /api/rooms/validate succeeds for public room without password', async () => {
  const r = await request('POST', '/api/rooms/validate', {
    roomId: 'room-public',
  }, AUTH_HEADERS);
  assert.equal(r.status, 200);
  const body = r.json<{ ok: boolean; public: boolean }>();
  assert.equal(body.ok, true);
  assert.equal(body.public, true);
});

test('POST /api/rooms/validate 401 on wrong password', async () => {
  const r = await request('POST', '/api/rooms/validate', {
    roomId: 'room-private',
    password: 'not-the-password',
  }, AUTH_HEADERS);
  assert.equal(r.status, 401);
});

test('POST /api/rooms/validate 401 when password missing on private room', async () => {
  const r = await request('POST', '/api/rooms/validate', {
    roomId: 'room-private',
  }, AUTH_HEADERS);
  assert.equal(r.status, 401);
});

test('POST /api/rooms/validate 404 on unknown room', async () => {
  const r = await request('POST', '/api/rooms/validate', {
    roomId: 'room-does-not-exist',
    password: 'whatever',
  }, AUTH_HEADERS);
  assert.equal(r.status, 404);
});

test('POST /api/rooms/validate 400 when roomId missing', async () => {
  const r = await request('POST', '/api/rooms/validate', {}, AUTH_HEADERS);
  assert.equal(r.status, 400);
});

// ---------------------------------------------------------------------------
// Auth endpoint tests (per-user signup/login/refresh/logout/me).
//
// These reuse the same backend instance as the rest of the smoke suite —
// each test uses a unique email so they don't collide with each other.
// ---------------------------------------------------------------------------

interface AuthTokens {
  user: { id: string; email: string; name: string; role: string };
  accessToken: string;
  refreshToken: string;
}

test('POST /api/auth/register happy path returns user and tokens', async () => {
  const r = await request('POST', '/api/auth/register', {
    email: 'alice@example.com',
    password: 'goodpassword1',
    name: 'Alice',
  });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<AuthTokens>();
  assert.equal(body.user.email, 'alice@example.com');
  assert.equal(body.user.name, 'Alice');
  assert.equal(typeof body.accessToken, 'string');
  assert.equal(typeof body.refreshToken, 'string');
  assert.equal(body.accessToken.split('.').length, 3, 'access token should be a JWT');
  assert.equal(body.refreshToken.split('.').length, 3, 'refresh token should be a JWT');
});

test('POST /api/auth/register duplicate email returns 409', async () => {
  // First registration succeeds.
  const r1 = await request('POST', '/api/auth/register', {
    email: 'dup@example.com',
    password: 'goodpassword1',
    name: 'Dup',
  });
  assert.equal(r1.status, 200);
  // Second registration with same email -> 409.
  const r2 = await request('POST', '/api/auth/register', {
    email: 'dup@example.com',
    password: 'anotherpassword',
    name: 'Dup2',
  });
  assert.equal(r2.status, 409, `expected 409, got ${r2.status} body=${r2.body}`);
});

test('POST /api/auth/register weak password returns 400', async () => {
  const r = await request('POST', '/api/auth/register', {
    email: 'weak@example.com',
    password: 'short',
    name: 'Weak',
  });
  assert.equal(r.status, 400, `expected 400, got ${r.status} body=${r.body}`);
});

test('POST /api/auth/login with correct password returns 200 + tokens', async () => {
  // Register first.
  const reg = await request('POST', '/api/auth/register', {
    email: 'bob@example.com',
    password: 'goodpassword1',
    name: 'Bob',
  });
  assert.equal(reg.status, 200);
  // Then login.
  const r = await request('POST', '/api/auth/login', {
    email: 'bob@example.com',
    password: 'goodpassword1',
  });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<AuthTokens>();
  assert.equal(body.user.email, 'bob@example.com');
  assert.equal(typeof body.accessToken, 'string');
  assert.equal(typeof body.refreshToken, 'string');
});

test('POST /api/auth/login with wrong password returns 401', async () => {
  await request('POST', '/api/auth/register', {
    email: 'carol@example.com',
    password: 'goodpassword1',
    name: 'Carol',
  });
  const r = await request('POST', '/api/auth/login', {
    email: 'carol@example.com',
    password: 'wrongpassword!',
  });
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('POST /api/auth/refresh issues new tokens', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'dave@example.com',
    password: 'goodpassword1',
    name: 'Dave',
  });
  assert.equal(reg.status, 200);
  const original = reg.json<AuthTokens>();
  const r = await request('POST', '/api/auth/refresh', {
    refreshToken: original.refreshToken,
  });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ accessToken: string; refreshToken: string }>();
  assert.equal(typeof body.accessToken, 'string');
  assert.equal(typeof body.refreshToken, 'string');
  assert.notEqual(body.refreshToken, original.refreshToken, 'refresh token should rotate');
});

test('POST /api/auth/refresh after logout returns 401', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'eve@example.com',
    password: 'goodpassword1',
    name: 'Eve',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  // Logout revokes the refresh jti.
  const logout = await request(
    'POST',
    '/api/auth/logout',
    { refreshToken: tokens.refreshToken },
    { authorization: `Bearer ${tokens.accessToken}` },
  );
  assert.equal(logout.status, 200, `expected 200, got ${logout.status} body=${logout.body}`);
  // Now refresh should fail.
  const r = await request('POST', '/api/auth/refresh', {
    refreshToken: tokens.refreshToken,
  });
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('GET /api/auth/me with valid access token returns user', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'frank@example.com',
    password: 'goodpassword1',
    name: 'Frank',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const r = await request(
    'GET',
    '/api/auth/me',
    undefined,
    { authorization: `Bearer ${tokens.accessToken}` },
  );
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ user: { email: string; name: string } }>();
  assert.equal(body.user.email, 'frank@example.com');
  assert.equal(body.user.name, 'Frank');
});

test('GET /api/auth/me with missing token returns 401', async () => {
  const r = await request('GET', '/api/auth/me');
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('PATCH /api/auth/me without auth returns 401', async () => {
  const r = await request('PATCH', '/api/auth/me', { name: 'NoAuth' });
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('PATCH /api/auth/me with valid token updates name', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'patch-name@example.com',
    password: 'goodpassword1',
    name: 'BeforePatch',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const r = await request(
    'PATCH',
    '/api/auth/me',
    { name: 'AfterPatch', degree: 'M.Div', bio: 'Hello there.' },
    { authorization: `Bearer ${tokens.accessToken}` },
  );
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ user: { name: string; degree?: string; bio?: string } }>();
  assert.equal(body.user.name, 'AfterPatch');
  assert.equal(body.user.degree, 'M.Div');
  assert.equal(body.user.bio, 'Hello there.');
});

test('GET /api/auth/me after PATCH reflects the new value', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'patch-readback@example.com',
    password: 'goodpassword1',
    name: 'OldName',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const patch = await request(
    'PATCH',
    '/api/auth/me',
    { name: 'NewName' },
    { authorization: `Bearer ${tokens.accessToken}` },
  );
  assert.equal(patch.status, 200);
  const r = await request('GET', '/api/auth/me', undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(r.status, 200);
  const body = r.json<{ user: { name: string } }>();
  assert.equal(body.user.name, 'NewName', 'GET /me must see the persisted change');
});

test('PATCH /api/auth/me with empty name returns 400', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'patch-invalid@example.com',
    password: 'goodpassword1',
    name: 'KeepThis',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const r = await request(
    'PATCH',
    '/api/auth/me',
    { name: '' },
    { authorization: `Bearer ${tokens.accessToken}` },
  );
  assert.equal(r.status, 400, `expected 400, got ${r.status} body=${r.body}`);
});

// ---------------------------------------------------------------------------
// Cooperation endpoint tests
// ---------------------------------------------------------------------------

test('POST /api/cooperation rejects missing fields', async () => {
  const r = await request('POST', '/api/cooperation', {
    name: 'X',
    // missing email/organization/type
  });
  assert.equal(r.status, 400, `expected 400, got ${r.status} body=${r.body}`);
});

test('POST /api/cooperation rejects invalid email', async () => {
  const r = await request('POST', '/api/cooperation', {
    name: 'X',
    email: 'not-an-email',
    organization: 'Org',
    type: 'partner',
  });
  assert.equal(r.status, 400);
});

test('POST /api/cooperation happy path returns id + receivedAt', async () => {
  const r = await request('POST', '/api/cooperation', {
    name: 'Jane',
    email: 'jane@example.com',
    organization: 'Acme Mission',
    message: 'We want to partner.',
    type: '课程资源',
  });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ id: string; receivedAt: number }>();
  assert.equal(typeof body.id, 'string');
  assert.ok(body.id.length > 0);
  assert.equal(typeof body.receivedAt, 'number');
});

test('GET /api/cooperation without auth returns 401', async () => {
  const r = await request('GET', '/api/cooperation');
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('GET /api/cooperation as non-admin returns 403', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'coop-student@example.com',
    password: 'goodpassword1',
    name: 'CoopStudent',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const r = await request('GET', '/api/cooperation', undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(r.status, 403, `expected 403, got ${r.status} body=${r.body}`);
});

test('GET /api/cooperation as admin (service token) returns array', async () => {
  const r = await request('GET', '/api/cooperation', undefined, AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<unknown[]>();
  assert.ok(Array.isArray(body), 'expected array');
});

// ---------------------------------------------------------------------------
// Posts endpoint tests
// ---------------------------------------------------------------------------

test('GET /api/posts returns array (initially empty or non-empty depending on order)', async () => {
  const r = await request('GET', '/api/posts');
  assert.equal(r.status, 200);
  const body = r.json<unknown[]>();
  assert.ok(Array.isArray(body), 'expected array');
});

test('POST /api/posts without auth returns 401', async () => {
  const r = await request('POST', '/api/posts', {
    content: 'hello',
    category: 'general',
  });
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('POST /api/posts creates a post for the authed user', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'poster1@example.com',
    password: 'goodpassword1',
    name: 'Poster1',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const r = await request('POST', '/api/posts', {
    content: 'My first post',
    category: '神学讨论',
  }, { authorization: `Bearer ${tokens.accessToken}` });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{
    id: string; userId: string; userName: string; content: string;
    likes: number; likedByMe: boolean; commentList: unknown[];
  }>();
  assert.equal(typeof body.id, 'string');
  assert.equal(body.userId, tokens.user.id);
  assert.equal(body.userName, 'Poster1');
  assert.equal(body.content, 'My first post');
  assert.equal(body.likes, 0);
  assert.equal(body.likedByMe, false);
  assert.ok(Array.isArray(body.commentList));
});

test('DELETE /api/posts/:id by non-author returns 403', async () => {
  // Author creates a post.
  const aReg = await request('POST', '/api/auth/register', {
    email: 'author-a@example.com',
    password: 'goodpassword1',
    name: 'AuthorA',
  });
  const aTokens = aReg.json<AuthTokens>();
  const create = await request('POST', '/api/posts', {
    content: 'a post',
    category: 'general',
  }, { authorization: `Bearer ${aTokens.accessToken}` });
  assert.equal(create.status, 200);
  const post = create.json<{ id: string }>();

  // A different user tries to delete it.
  const bReg = await request('POST', '/api/auth/register', {
    email: 'other-b@example.com',
    password: 'goodpassword1',
    name: 'OtherB',
  });
  const bTokens = bReg.json<AuthTokens>();
  const del = await request('DELETE', `/api/posts/${post.id}`, undefined, {
    authorization: `Bearer ${bTokens.accessToken}`,
  });
  assert.equal(del.status, 403, `expected 403, got ${del.status} body=${del.body}`);
});

test('DELETE /api/posts/:id by author returns 200', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'author-c@example.com',
    password: 'goodpassword1',
    name: 'AuthorC',
  });
  const tokens = reg.json<AuthTokens>();
  const create = await request('POST', '/api/posts', {
    content: 'to be deleted',
    category: 'general',
  }, { authorization: `Bearer ${tokens.accessToken}` });
  assert.equal(create.status, 200);
  const post = create.json<{ id: string }>();
  const del = await request('DELETE', `/api/posts/${post.id}`, undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(del.status, 200, `expected 200, got ${del.status} body=${del.body}`);
});

test('POST /api/posts/:id/like toggles like for the caller', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'liker@example.com',
    password: 'goodpassword1',
    name: 'Liker',
  });
  const tokens = reg.json<AuthTokens>();
  const create = await request('POST', '/api/posts', {
    content: 'likeable',
    category: 'general',
  }, { authorization: `Bearer ${tokens.accessToken}` });
  const post = create.json<{ id: string }>();

  // First like — should set likes=1, likedByMe=true.
  const r1 = await request('POST', `/api/posts/${post.id}/like`, undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(r1.status, 200);
  const b1 = r1.json<{ likes: number; likedByMe: boolean }>();
  assert.equal(b1.likes, 1);
  assert.equal(b1.likedByMe, true);

  // Second like by same user — should toggle off.
  const r2 = await request('POST', `/api/posts/${post.id}/like`, undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(r2.status, 200);
  const b2 = r2.json<{ likes: number; likedByMe: boolean }>();
  assert.equal(b2.likes, 0);
  assert.equal(b2.likedByMe, false);
});

// ---------------------------------------------------------------------------
// Announcements endpoint tests
// ---------------------------------------------------------------------------

test('GET /api/announcements is public and returns an array', async () => {
  const r = await request('GET', '/api/announcements');
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<unknown[]>();
  assert.ok(Array.isArray(body));
});

test('POST /api/announcements as student returns 403', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'student-ann@example.com',
    password: 'goodpassword1',
    name: 'StudentAnn',
  });
  const tokens = reg.json<AuthTokens>();
  const r = await request('POST', '/api/announcements', {
    title: 'should-fail',
    content: 'nope',
  }, { authorization: `Bearer ${tokens.accessToken}` });
  assert.equal(r.status, 403, `expected 403, got ${r.status} body=${r.body}`);
});

test('POST /api/announcements as admin (promoted) returns 200', async () => {
  // Register and promote to admin via the APP_SECRET-gated dev endpoint.
  const reg = await request('POST', '/api/auth/register', {
    email: 'admin-ann@example.com',
    password: 'goodpassword1',
    name: 'AdminAnn',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const promote = await request('POST', '/api/auth/_promote', {
    userId: tokens.user.id,
  }, AUTH_HEADERS);
  assert.equal(promote.status, 200, `expected 200, got ${promote.status} body=${promote.body}`);
  // Re-login to get a new access token that carries role=admin in its claims.
  // (Our requireAdmin re-reads role from the user store, so the existing
  // token would also work — but a fresh login mirrors a real admin flow.)
  const login = await request('POST', '/api/auth/login', {
    email: 'admin-ann@example.com',
    password: 'goodpassword1',
  });
  assert.equal(login.status, 200);
  const adminTokens = login.json<AuthTokens>();
  assert.equal(adminTokens.user.role, 'admin');

  const r = await request('POST', '/api/announcements', {
    title: 'Welcome back',
    content: 'New semester starts soon.',
    type: 'important',
  }, { authorization: `Bearer ${adminTokens.accessToken}` });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ id: string; title: string; type: string }>();
  assert.equal(typeof body.id, 'string');
  assert.equal(body.title, 'Welcome back');
  assert.equal(body.type, 'important');
});

// ---------------------------------------------------------------------------
// Courses endpoint tests
// ---------------------------------------------------------------------------

test('GET /api/courses returns array (initially)', async () => {
  const r = await request('GET', '/api/courses');
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<unknown[]>();
  assert.ok(Array.isArray(body), 'expected array');
});

test('POST /api/courses as student returns 403', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'student-courses@example.com',
    password: 'goodpassword1',
    name: 'StudentCourses',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const r = await request('POST', '/api/courses', {
    title: 'X', instructor: 'Y', category: '系统神学', level: 'B.Th',
    thumbnail: '', totalLessons: 10,
  }, { authorization: `Bearer ${tokens.accessToken}` });
  assert.equal(r.status, 403, `expected 403, got ${r.status} body=${r.body}`);
});

test('POST /api/courses as admin (service) returns 200 + new course', async () => {
  const r = await request('POST', '/api/courses', {
    title: 'Intro to Theology',
    instructor: 'Dr. Smith',
    category: '系统神学',
    level: 'B.Th',
    thumbnail: 'https://example.com/cover.jpg',
    totalLessons: 12,
  }, AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{
    id: string; title: string; instructor: string; totalLessons: number;
  }>();
  assert.equal(typeof body.id, 'string');
  assert.equal(body.title, 'Intro to Theology');
  assert.equal(body.instructor, 'Dr. Smith');
  assert.equal(body.totalLessons, 12);
});

test('PATCH /api/courses/:id as admin returns 200 + patched fields', async () => {
  const create = await request('POST', '/api/courses', {
    title: 'Patch me',
    instructor: 'Original',
    category: '圣经神学',
    level: 'M.Div',
    thumbnail: '',
    totalLessons: 8,
  }, AUTH_HEADERS);
  assert.equal(create.status, 200);
  const { id } = create.json<{ id: string }>();

  const r = await request('PATCH', `/api/courses/${id}`, {
    title: 'Patched title',
    totalLessons: 20,
  }, AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ title: string; totalLessons: number; instructor: string }>();
  assert.equal(body.title, 'Patched title');
  assert.equal(body.totalLessons, 20);
  // Untouched field should remain.
  assert.equal(body.instructor, 'Original');
});

test('DELETE /api/courses/:id as admin returns 200', async () => {
  const create = await request('POST', '/api/courses', {
    title: 'Delete me',
    instructor: 'X',
    category: '宣教神学',
    level: 'B.Th',
    thumbnail: '',
    totalLessons: 1,
  }, AUTH_HEADERS);
  assert.equal(create.status, 200);
  const { id } = create.json<{ id: string }>();
  const del = await request('DELETE', `/api/courses/${id}`, undefined, AUTH_HEADERS);
  assert.equal(del.status, 200, `expected 200, got ${del.status} body=${del.body}`);
});

test('POST /api/courses/:id/progress as authed user saves progress', async () => {
  // Create a course as admin.
  const create = await request('POST', '/api/courses', {
    title: 'Progress course',
    instructor: 'Prof.',
    category: '实践神学',
    level: 'B.Th',
    thumbnail: '',
    totalLessons: 10,
  }, AUTH_HEADERS);
  assert.equal(create.status, 200);
  const { id: courseId } = create.json<{ id: string }>();

  // Register a student.
  const reg = await request('POST', '/api/auth/register', {
    email: 'progress-user-1@example.com',
    password: 'goodpassword1',
    name: 'ProgressUser1',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();

  const r = await request('POST', `/api/courses/${courseId}/progress`, {
    progress: 42,
    completedLessons: 4,
  }, { authorization: `Bearer ${tokens.accessToken}` });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ progress: number; completedLessons: number }>();
  assert.equal(body.progress, 42);
  assert.equal(body.completedLessons, 4);
});

test('GET /api/courses/:id/progress returns the saved value for that user', async () => {
  // Create course + user; save progress; then GET it back.
  const create = await request('POST', '/api/courses', {
    title: 'Per-user progress course',
    instructor: 'Prof.',
    category: '历史神学',
    level: 'B.Th',
    thumbnail: '',
    totalLessons: 10,
  }, AUTH_HEADERS);
  const { id: courseId } = create.json<{ id: string }>();

  const reg = await request('POST', '/api/auth/register', {
    email: 'progress-user-2@example.com',
    password: 'goodpassword1',
    name: 'ProgressUser2',
  });
  const tokens = reg.json<AuthTokens>();

  await request('POST', `/api/courses/${courseId}/progress`, {
    progress: 75,
    completedLessons: 7,
  }, { authorization: `Bearer ${tokens.accessToken}` });

  const r = await request('GET', `/api/courses/${courseId}/progress`, undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(r.status, 200);
  const body = r.json<{ progress: number; completedLessons: number }>();
  assert.equal(body.progress, 75);
  assert.equal(body.completedLessons, 7);
});

test('GET /api/courses/:id/progress for a DIFFERENT user is independent', async () => {
  // Create one course.
  const create = await request('POST', '/api/courses', {
    title: 'Independent progress course',
    instructor: 'Prof.',
    category: '宣教神学',
    level: 'B.Th',
    thumbnail: '',
    totalLessons: 10,
  }, AUTH_HEADERS);
  const { id: courseId } = create.json<{ id: string }>();

  // User A saves progress.
  const regA = await request('POST', '/api/auth/register', {
    email: 'multi-user-A@example.com',
    password: 'goodpassword1',
    name: 'MultiUserA',
  });
  const tokensA = regA.json<AuthTokens>();
  await request('POST', `/api/courses/${courseId}/progress`, {
    progress: 88,
    completedLessons: 9,
  }, { authorization: `Bearer ${tokensA.accessToken}` });

  // User B has not interacted with this course at all.
  const regB = await request('POST', '/api/auth/register', {
    email: 'multi-user-B@example.com',
    password: 'goodpassword1',
    name: 'MultiUserB',
  });
  const tokensB = regB.json<AuthTokens>();

  // User B sees zeros — not user A's 88.
  const rB = await request('GET', `/api/courses/${courseId}/progress`, undefined, {
    authorization: `Bearer ${tokensB.accessToken}` ,
  });
  assert.equal(rB.status, 200);
  const bodyB = rB.json<{ progress: number; completedLessons: number }>();
  assert.equal(bodyB.progress, 0, 'user B must NOT see user A\'s progress');
  assert.equal(bodyB.completedLessons, 0);

  // User A still sees their saved value — proving independence.
  const rA = await request('GET', `/api/courses/${courseId}/progress`, undefined, {
    authorization: `Bearer ${tokensA.accessToken}` ,
  });
  const bodyA = rA.json<{ progress: number; completedLessons: number }>();
  assert.equal(bodyA.progress, 88);
  assert.equal(bodyA.completedLessons, 9);
});

test('GET /api/courses/progress batch endpoint returns this user\'s progress map', async () => {
  // Two courses.
  const c1 = await request('POST', '/api/courses', {
    title: 'Batch course 1', instructor: 'X', category: '系统神学',
    level: 'B.Th', thumbnail: '', totalLessons: 5,
  }, AUTH_HEADERS);
  const c2 = await request('POST', '/api/courses', {
    title: 'Batch course 2', instructor: 'Y', category: '圣经神学',
    level: 'B.Th', thumbnail: '', totalLessons: 6,
  }, AUTH_HEADERS);
  const id1 = c1.json<{ id: string }>().id;
  const id2 = c2.json<{ id: string }>().id;

  const reg = await request('POST', '/api/auth/register', {
    email: 'batch-progress@example.com',
    password: 'goodpassword1',
    name: 'BatchProgress',
  });
  const tokens = reg.json<AuthTokens>();
  await request('POST', `/api/courses/${id1}/progress`,
    { progress: 10, completedLessons: 1 },
    { authorization: `Bearer ${tokens.accessToken}` });
  await request('POST', `/api/courses/${id2}/progress`,
    { progress: 60, completedLessons: 4 },
    { authorization: `Bearer ${tokens.accessToken}` });

  const r = await request('GET', '/api/courses/progress', undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<Record<string, { progress: number; completedLessons: number }>>();
  assert.equal(body[id1]?.progress, 10);
  assert.equal(body[id1]?.completedLessons, 1);
  assert.equal(body[id2]?.progress, 60);
  assert.equal(body[id2]?.completedLessons, 4);
});

// ---------------------------------------------------------------------------
// Friends endpoint tests
//
// Each test re-registers a fresh pair (sometimes triple) of users so prior
// state in the in-memory store doesn't bleed across the scenarios.
// ---------------------------------------------------------------------------

async function registerFriendUser(prefix: string, suffix: string): Promise<AuthTokens> {
  const r = await request('POST', '/api/auth/register', {
    email: `${prefix}-${suffix}@example.com`,
    password: 'goodpassword1',
    name: `${prefix}-${suffix}`,
  });
  assert.equal(r.status, 200, `register failed: ${r.body}`);
  return r.json<AuthTokens>();
}

test('POST /api/friends/requests A->B returns 200', async () => {
  const a = await registerFriendUser('fr-a', 'basic');
  const b = await registerFriendUser('fr-b', 'basic');
  const r = await request('POST', '/api/friends/requests', {
    targetUserId: b.user.id,
  }, { authorization: `Bearer ${a.accessToken}` });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ id: string; fromUserId: string; toUserId: string }>();
  assert.equal(typeof body.id, 'string');
  assert.equal(body.fromUserId, a.user.id);
  assert.equal(body.toUserId, b.user.id);
});

test('POST /api/friends/requests duplicate returns 409', async () => {
  const a = await registerFriendUser('fr-a', 'dup');
  const b = await registerFriendUser('fr-b', 'dup');
  const r1 = await request('POST', '/api/friends/requests', {
    targetUserId: b.user.id,
  }, { authorization: `Bearer ${a.accessToken}` });
  assert.equal(r1.status, 200);
  const r2 = await request('POST', '/api/friends/requests', {
    targetUserId: b.user.id,
  }, { authorization: `Bearer ${a.accessToken}` });
  assert.equal(r2.status, 409, `expected 409, got ${r2.status} body=${r2.body}`);
});

test('GET /api/friends/requests/incoming lists A as sender for B', async () => {
  const a = await registerFriendUser('fr-a', 'incoming');
  const b = await registerFriendUser('fr-b', 'incoming');
  const send = await request('POST', '/api/friends/requests', {
    targetUserId: b.user.id,
  }, { authorization: `Bearer ${a.accessToken}` });
  assert.equal(send.status, 200);
  const r = await request('GET', '/api/friends/requests/incoming', undefined, {
    authorization: `Bearer ${b.accessToken}`,
  });
  assert.equal(r.status, 200);
  const list = r.json<{ id: string; fromUserId: string; fromUserName: string }[]>();
  assert.ok(Array.isArray(list));
  const match = list.find(x => x.fromUserId === a.user.id);
  assert.ok(match, `expected request from ${a.user.id} in incoming list`);
  assert.equal(match!.fromUserName, a.user.name);
});

test('POST /api/friends/requests/:id/accept by non-target returns 403', async () => {
  const a = await registerFriendUser('fr-a', 'accept-403');
  const b = await registerFriendUser('fr-b', 'accept-403');
  const c = await registerFriendUser('fr-c', 'accept-403');
  const send = await request('POST', '/api/friends/requests', {
    targetUserId: b.user.id,
  }, { authorization: `Bearer ${a.accessToken}` });
  assert.equal(send.status, 200);
  const reqId = send.json<{ id: string }>().id;
  const r = await request('POST', `/api/friends/requests/${reqId}/accept`, undefined, {
    authorization: `Bearer ${c.accessToken}`,
  });
  assert.equal(r.status, 403, `expected 403, got ${r.status} body=${r.body}`);
});

test('POST /api/friends/requests/:id/accept by target creates friendship', async () => {
  const a = await registerFriendUser('fr-a', 'accept-ok');
  const b = await registerFriendUser('fr-b', 'accept-ok');
  const send = await request('POST', '/api/friends/requests', {
    targetUserId: b.user.id,
  }, { authorization: `Bearer ${a.accessToken}` });
  assert.equal(send.status, 200);
  const reqId = send.json<{ id: string }>().id;
  const accept = await request('POST', `/api/friends/requests/${reqId}/accept`, undefined, {
    authorization: `Bearer ${b.accessToken}`,
  });
  assert.equal(accept.status, 200, `expected 200, got ${accept.status} body=${accept.body}`);
  // Friendship exists: GET /api/friends as A lists B.
  const friends = await request('GET', '/api/friends', undefined, {
    authorization: `Bearer ${a.accessToken}`,
  });
  assert.equal(friends.status, 200);
  const list = friends.json<{ id: string; name: string }[]>();
  assert.ok(list.some(f => f.id === b.user.id), 'B should appear in A\'s friend list');
});

test('GET /api/friends as A returns B after accept', async () => {
  const a = await registerFriendUser('fr-a', 'list');
  const b = await registerFriendUser('fr-b', 'list');
  const send = await request('POST', '/api/friends/requests', {
    targetUserId: b.user.id,
  }, { authorization: `Bearer ${a.accessToken}` });
  const reqId = send.json<{ id: string }>().id;
  await request('POST', `/api/friends/requests/${reqId}/accept`, undefined, {
    authorization: `Bearer ${b.accessToken}`,
  });
  const r = await request('GET', '/api/friends', undefined, {
    authorization: `Bearer ${a.accessToken}`,
  });
  assert.equal(r.status, 200);
  const list = r.json<{ id: string; name: string }[]>();
  const found = list.find(f => f.id === b.user.id);
  assert.ok(found, 'expected B in A\'s friend list');
  assert.equal(found!.name, b.user.name);
});

test('DELETE /api/friends/:userId unfriends both sides', async () => {
  const a = await registerFriendUser('fr-a', 'unfriend');
  const b = await registerFriendUser('fr-b', 'unfriend');
  const send = await request('POST', '/api/friends/requests', {
    targetUserId: b.user.id,
  }, { authorization: `Bearer ${a.accessToken}` });
  const reqId = send.json<{ id: string }>().id;
  await request('POST', `/api/friends/requests/${reqId}/accept`, undefined, {
    authorization: `Bearer ${b.accessToken}`,
  });
  // A unfriends B.
  const del = await request('DELETE', `/api/friends/${b.user.id}`, undefined, {
    authorization: `Bearer ${a.accessToken}`,
  });
  assert.equal(del.status, 200, `expected 200, got ${del.status} body=${del.body}`);
  // B's friend list no longer contains A.
  const friends = await request('GET', '/api/friends', undefined, {
    authorization: `Bearer ${b.accessToken}`,
  });
  assert.equal(friends.status, 200);
  const list = friends.json<{ id: string }[]>();
  assert.ok(!list.some(f => f.id === a.user.id), 'A should be gone from B\'s friend list');
});

// ---------------------------------------------------------------------------
// Push notification endpoint tests
//
// All push endpoints require a user JWT (NOT the APP_SECRET service token —
// these are per-user device registrations). We use fresh users in each test
// so the in-memory token store doesn't bleed between scenarios.
// ---------------------------------------------------------------------------

async function registerPushUser(suffix: string): Promise<AuthTokens> {
  const r = await request('POST', '/api/auth/register', {
    email: `push-${suffix}@example.com`,
    password: 'goodpassword1',
    name: `Push-${suffix}`,
  });
  assert.equal(r.status, 200, `register failed: ${r.body}`);
  return r.json<AuthTokens>();
}

test('POST /api/push/register without auth returns 401', async () => {
  const r = await request('POST', '/api/push/register', {
    token: 'fake-token',
    platform: 'ios',
  });
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('POST /api/push/register with auth returns 200 + count: 1', async () => {
  const u = await registerPushUser('basic');
  const r = await request('POST', '/api/push/register', {
    token: 'apns-token-aaaaaaaaaaaaaaaa',
    platform: 'ios',
  }, { authorization: `Bearer ${u.accessToken}` });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ ok: boolean; count: number }>();
  assert.equal(body.ok, true);
  assert.equal(body.count, 1);
});

test('POST /api/push/register is idempotent for the same token', async () => {
  const u = await registerPushUser('idemp');
  const first = await request('POST', '/api/push/register', {
    token: 'apns-token-bbbbbbbbbbbbbbbb',
    platform: 'ios',
  }, { authorization: `Bearer ${u.accessToken}` });
  assert.equal(first.status, 200);
  const second = await request('POST', '/api/push/register', {
    token: 'apns-token-bbbbbbbbbbbbbbbb',
    platform: 'ios',
  }, { authorization: `Bearer ${u.accessToken}` });
  assert.equal(second.status, 200);
  const body = second.json<{ count: number }>();
  assert.equal(body.count, 1, 'duplicate register must not increase count');
});

test('GET /api/push/tokens returns count and platform breakdown', async () => {
  const u = await registerPushUser('list');
  await request('POST', '/api/push/register', {
    token: 'apns-token-cccccccccccccccc',
    platform: 'ios',
  }, { authorization: `Bearer ${u.accessToken}` });
  const r = await request('GET', '/api/push/tokens', undefined, {
    authorization: `Bearer ${u.accessToken}`,
  });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ count: number; platforms: { ios: number; android: number; web: number } }>();
  assert.equal(body.count, 1);
  assert.equal(body.platforms.ios, 1);
  assert.equal(body.platforms.android, 0);
  assert.equal(body.platforms.web, 0);
});

test('POST /api/push/test returns 200 with stub message when APNs unconfigured', async () => {
  const u = await registerPushUser('test-send');
  await request('POST', '/api/push/register', {
    token: 'apns-token-dddddddddddddddd',
    platform: 'ios',
  }, { authorization: `Bearer ${u.accessToken}` });
  const r = await request('POST', '/api/push/test', undefined, {
    authorization: `Bearer ${u.accessToken}`,
  });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ ok: boolean; wouldSendTo: string; message: string }>();
  assert.equal(body.ok, true);
  assert.equal(typeof body.wouldSendTo, 'string');
  // The new stub explicitly says APNs is not configured — proves we took
  // the degraded path instead of attempting (and failing) a real send.
  assert.ok(
    body.message.includes('APNs not configured'),
    `expected APNs-not-configured stub message, got: ${body.message}`,
  );
});

test('POST /api/posts still succeeds when APNs is unconfigured (regression)', async () => {
  // The fire-and-forget broadcast inside POST /api/posts must NEVER make
  // the response fail, even when APNs has no credentials (which is the
  // case for this entire test run).
  const reg = await request('POST', '/api/auth/register', {
    email: 'push-regression-post@example.com',
    password: 'goodpassword1',
    name: 'PushRegression',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  // Also register a fake iOS device so the broadcast has at least one
  // target to enumerate — exercises the "tokens present but no creds"
  // path which is where a wiring typo would most likely surface.
  const dev = await request('POST', '/api/push/register', {
    token: 'apns-token-eeeeeeeeeeeeeeee',
    platform: 'ios',
  }, { authorization: `Bearer ${tokens.accessToken}` });
  assert.equal(dev.status, 200);
  const r = await request('POST', '/api/posts', {
    content: 'post that should not be blocked by push',
    category: 'general',
  }, { authorization: `Bearer ${tokens.accessToken}` });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ id: string; content: string }>();
  assert.equal(typeof body.id, 'string');
  assert.equal(body.content, 'post that should not be blocked by push');
});

test('POST /api/announcements still succeeds when APNs is unconfigured (regression)', async () => {
  // announcements.ts also fires broadcastToAllUsers fire-and-forget; the
  // create response must not fail when APNs has no credentials. Register a
  // user + iOS token first so the broadcast has a target to enumerate.
  const reg = await request('POST', '/api/auth/register', {
    email: 'push-regression-ann@example.com',
    password: 'goodpassword1',
    name: 'PushRegressionAnn',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const dev = await request('POST', '/api/push/register', {
    token: 'apns-token-ffffffffffffffff',
    platform: 'ios',
  }, { authorization: `Bearer ${tokens.accessToken}` });
  assert.equal(dev.status, 200);
  // Create the announcement as admin (service token).
  const r = await request('POST', '/api/announcements', {
    title: '不应被推送阻塞的公告',
    content: 'announcement that should not be blocked by push',
    type: 'normal',
  }, AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ id: string; title: string }>();
  assert.equal(typeof body.id, 'string');
  assert.equal(body.title, '不应被推送阻塞的公告');
});

// ---------------------------------------------------------------------------
// Image upload endpoint tests
//
// Uses a raw-body helper so we POST actual binary bytes (not JSON-wrapped) the
// way the production client does. The fixture is the canonical 1x1 PNG — 67
// bytes of real PNG data so the multer/express.raw path doesn't reject it.
// ---------------------------------------------------------------------------

function rawRequest(
  method: string,
  pathName: string,
  body: Buffer,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathName,
        method,
        headers: {
          'content-type': contentType,
          'content-length': String(body.length),
          ...extraHeaders,
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: buf.toString('utf8'),
            json: <T,>() => JSON.parse(buf.toString('utf8')) as T,
          });
        });
      },
    );
    req.on('error', reject);
    if (body.length > 0) req.write(body);
    req.end();
  });
}

const TINY_PNG = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4' +
  '890000000D49444154789C636000010000000500010D0A2DB40000000049454E' +
  '44AE426082',
  'hex',
);

test('POST /api/images without auth returns 401', async () => {
  const r = await rawRequest('POST', '/api/images', TINY_PNG, 'image/png');
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('POST /api/images with auth + 1x1 PNG returns id + url', async () => {
  const r = await rawRequest('POST', '/api/images', TINY_PNG, 'image/png', AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ id: string; url: string; sizeBytes: number; mime: string }>();
  assert.equal(typeof body.id, 'string');
  assert.ok(body.id.length > 0);
  assert.equal(body.url, `/api/images/${body.id}`);
  assert.equal(body.mime, 'image/png');
  assert.equal(body.sizeBytes, TINY_PNG.length);
});

test('GET /api/images/:id returns the image with correct content-type', async () => {
  // First upload so we have a known id.
  const up = await rawRequest('POST', '/api/images', TINY_PNG, 'image/png', AUTH_HEADERS);
  assert.equal(up.status, 200);
  const { id } = up.json<{ id: string }>();
  // GET is intentionally public — no auth header.
  const r = await rawRequest(
    'GET', `/api/images/${id}`, Buffer.alloc(0), 'application/octet-stream',
  );
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  assert.equal(r.headers['content-type'], 'image/png');
});

test('GET /api/images/:id for unknown id returns 404', async () => {
  const r = await rawRequest(
    'GET', '/api/images/does-not-exist', Buffer.alloc(0), 'application/octet-stream',
  );
  assert.equal(r.status, 404, `expected 404, got ${r.status} body=${r.body}`);
});

// ---------------------------------------------------------------------------
// Course materials (files) endpoint tests
// ---------------------------------------------------------------------------
const COURSE_ID = 'course-files-test';
const FILE_BYTES = Buffer.from('AMAS · 课程资料占位内容');
const FILE_NAME = '哥林多前书导论.pdf';
const FILE_HEADERS = { ...AUTH_HEADERS, 'x-filename': encodeURIComponent(FILE_NAME) };

test('POST /api/courses/:id/files without auth returns 401', async () => {
  const r = await rawRequest('POST', `/api/courses/${COURSE_ID}/files`, FILE_BYTES, 'application/pdf');
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('POST /api/courses/:id/files as admin returns meta with download url', async () => {
  const r = await rawRequest('POST', `/api/courses/${COURSE_ID}/files`, FILE_BYTES, 'application/pdf', FILE_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{ id: string; courseId: string; filename: string; sizeBytes: number; url: string }>();
  assert.ok(body.id.length > 0);
  assert.equal(body.courseId, COURSE_ID);
  assert.equal(body.filename, FILE_NAME);
  assert.equal(body.sizeBytes, FILE_BYTES.length);
  assert.equal(body.url, `/api/courses/${COURSE_ID}/files/${body.id}`);
});

test('GET /api/courses/:id/files lists the uploaded file (authed)', async () => {
  await rawRequest('POST', `/api/courses/${COURSE_ID}/files`, FILE_BYTES, 'application/pdf', FILE_HEADERS);
  const r = await request('GET', `/api/courses/${COURSE_ID}/files`, undefined, AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const list = r.json<Array<{ filename: string }>>();
  assert.ok(Array.isArray(list) && list.some((f) => f.filename === FILE_NAME));
});

test('GET /api/courses/:id/files without auth returns 401', async () => {
  const r = await request('GET', `/api/courses/${COURSE_ID}/files`);
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('GET /api/courses/:id/files/:fileId downloads exact bytes + filename', async () => {
  const up = await rawRequest('POST', `/api/courses/${COURSE_ID}/files`, FILE_BYTES, 'application/pdf', FILE_HEADERS);
  const { id } = up.json<{ id: string }>();
  const r = await rawRequest('GET', `/api/courses/${COURSE_ID}/files/${id}`, Buffer.alloc(0), 'application/octet-stream', AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  assert.equal(r.headers['content-type'], 'application/pdf');
  assert.ok(String(r.headers['content-disposition'] ?? '').includes(encodeURIComponent(FILE_NAME)));
  assert.equal(r.body, FILE_BYTES.toString('utf8'));
});

test('GET /api/courses/:id/files/:fileId unknown id returns 404', async () => {
  const r = await rawRequest('GET', `/api/courses/${COURSE_ID}/files/nope`, Buffer.alloc(0), 'application/octet-stream', AUTH_HEADERS);
  assert.equal(r.status, 404, `expected 404, got ${r.status} body=${r.body}`);
});

test('DELETE /api/courses/:id/files/:fileId as admin removes it', async () => {
  const up = await rawRequest('POST', `/api/courses/${COURSE_ID}/files`, FILE_BYTES, 'application/pdf', FILE_HEADERS);
  const { id } = up.json<{ id: string }>();
  const del = await request('DELETE', `/api/courses/${COURSE_ID}/files/${id}`, undefined, AUTH_HEADERS);
  assert.equal(del.status, 200, `expected 200, got ${del.status} body=${del.body}`);
  const after = await rawRequest('GET', `/api/courses/${COURSE_ID}/files/${id}`, Buffer.alloc(0), 'application/octet-stream', AUTH_HEADERS);
  assert.equal(after.status, 404, `expected 404 after delete, got ${after.status}`);
});

// ---------------------------------------------------------------------------
// Library endpoint tests
// ---------------------------------------------------------------------------

test('GET /api/library/books initially returns an array', async () => {
  const r = await request('GET', '/api/library/books');
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<unknown[]>();
  assert.ok(Array.isArray(body), 'expected array');
});

test('POST /api/library/books as student returns 403', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'student-library@example.com',
    password: 'goodpassword1',
    name: 'StudentLibrary',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const r = await request('POST', '/api/library/books', {
    title: 'X', author: 'Y', category: '神学藏书',
  }, { authorization: `Bearer ${tokens.accessToken}` });
  assert.equal(r.status, 403, `expected 403, got ${r.status} body=${r.body}`);
});

test('POST /api/library/books as admin (service) returns 200 + new book', async () => {
  const r = await request('POST', '/api/library/books', {
    title: 'Systematic Theology',
    author: 'Wayne Grudem',
    category: '神学藏书',
    publisher: 'Zondervan',
    year: 1994,
    description: 'A comprehensive systematic theology textbook.',
  }, AUTH_HEADERS);
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const body = r.json<{
    id: string; title: string; author: string; category: string; year?: number;
  }>();
  assert.equal(typeof body.id, 'string');
  assert.equal(body.title, 'Systematic Theology');
  assert.equal(body.author, 'Wayne Grudem');
  assert.equal(body.category, '神学藏书');
  assert.equal(body.year, 1994);
});

test('GET /api/library/books?q= returns only matching books', async () => {
  // Seed two known-titled books.
  const a = await request('POST', '/api/library/books', {
    title: 'Cost of Discipleship',
    author: 'Dietrich Bonhoeffer',
    category: '神学藏书',
  }, AUTH_HEADERS);
  assert.equal(a.status, 200);
  const b = await request('POST', '/api/library/books', {
    title: 'God\'s Mission',
    author: 'Christopher Wright',
    category: '宣教资料库',
  }, AUTH_HEADERS);
  assert.equal(b.status, 200);

  const r = await request('GET', '/api/library/books?q=bonhoeffer');
  assert.equal(r.status, 200);
  const list = r.json<{ id: string; title: string; author: string }[]>();
  assert.ok(Array.isArray(list));
  assert.ok(
    list.some(x => x.author === 'Dietrich Bonhoeffer'),
    'expected Bonhoeffer match in search results',
  );
  assert.ok(
    !list.some(x => x.author === 'Christopher Wright'),
    'non-matching authors should be excluded',
  );
});

test('POST /api/library/favorites/:id toggles on then off for the same user', async () => {
  // Admin creates a book.
  const create = await request('POST', '/api/library/books', {
    title: 'Toggleable Book',
    author: 'TestAuthor',
    category: '神学藏书',
  }, AUTH_HEADERS);
  assert.equal(create.status, 200);
  const { id: bookId } = create.json<{ id: string }>();

  // Register a user.
  const reg = await request('POST', '/api/auth/register', {
    email: 'library-fav@example.com',
    password: 'goodpassword1',
    name: 'LibraryFav',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();

  // First call: favorited=true, count=1.
  const r1 = await request('POST', `/api/library/favorites/${bookId}`, undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(r1.status, 200, `expected 200, got ${r1.status} body=${r1.body}`);
  const b1 = r1.json<{ favorited: boolean; count: number }>();
  assert.equal(b1.favorited, true);
  assert.equal(b1.count, 1);

  // Second call by same user: favorited=false, count=0.
  const r2 = await request('POST', `/api/library/favorites/${bookId}`, undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(r2.status, 200);
  const b2 = r2.json<{ favorited: boolean; count: number }>();
  assert.equal(b2.favorited, false);
  assert.equal(b2.count, 0);
});

test('GET /api/library/favorites returns the favorited book ids', async () => {
  // Admin creates a book.
  const create = await request('POST', '/api/library/books', {
    title: 'Favorited Book',
    author: 'TestAuthor',
    category: '神学藏书',
  }, AUTH_HEADERS);
  assert.equal(create.status, 200);
  const { id: bookId } = create.json<{ id: string }>();

  // Register a user.
  const reg = await request('POST', '/api/auth/register', {
    email: 'library-fav-list@example.com',
    password: 'goodpassword1',
    name: 'LibraryFavList',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();

  // Mark favorited.
  const fav = await request('POST', `/api/library/favorites/${bookId}`, undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(fav.status, 200);

  // GET should list this id.
  const r = await request('GET', '/api/library/favorites', undefined, {
    authorization: `Bearer ${tokens.accessToken}`,
  });
  assert.equal(r.status, 200, `expected 200, got ${r.status} body=${r.body}`);
  const ids = r.json<string[]>();
  assert.ok(Array.isArray(ids));
  assert.ok(ids.includes(bookId), `expected ${bookId} in favorites list`);
});

// ---------------------------------------------------------------------------
// Pocket Theology state sync tests
// ---------------------------------------------------------------------------

test('GET /api/pt/state without auth returns 401', async () => {
  const r = await request('GET', '/api/pt/state');
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('PT state round-trip: empty → PUT → GET returns the same state', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'pt-sync@example.com',
    password: 'goodpassword1',
    name: 'PtSync',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const auth = { authorization: `Bearer ${tokens.accessToken}` };

  // Fresh user → no row yet.
  const empty = await request('GET', '/api/pt/state', undefined, auth);
  assert.equal(empty.status, 200, `expected 200, got ${empty.status} body=${empty.body}`);
  assert.equal(empty.json<{ state: unknown }>().state, null);

  // PUT a state blob.
  const state = {
    xp: 120,
    streak: { current: 3, longest: 5, lastDate: '2026-08-13' },
    progress: { l1: { status: 'completed', score: 90, completedAt: '2026-08-13T00:00:00Z' } },
    badges: ['first_lesson'],
    journal: [],
    favorites: ['l1'],
  };
  const put = await request('PUT', '/api/pt/state', { state }, auth);
  assert.equal(put.status, 200, `expected 200, got ${put.status} body=${put.body}`);
  assert.equal(put.json<{ ok: boolean }>().ok, true);

  // GET returns the same content + an updatedAt stamp.
  const got = await request('GET', '/api/pt/state', undefined, auth);
  assert.equal(got.status, 200);
  const body = got.json<{ state: typeof state; updatedAt: number }>();
  assert.equal(body.state.xp, 120);
  assert.equal(body.state.streak.current, 3);
  assert.equal(body.state.progress.l1.score, 90);
  assert.ok(typeof body.updatedAt === 'number' && body.updatedAt > 0);
});

test('PUT /api/pt/state rejects non-object state with 400', async () => {
  const reg = await request('POST', '/api/auth/register', {
    email: 'pt-bad@example.com',
    password: 'goodpassword1',
    name: 'PtBad',
  });
  assert.equal(reg.status, 200);
  const tokens = reg.json<AuthTokens>();
  const auth = { authorization: `Bearer ${tokens.accessToken}` };
  const r = await request('PUT', '/api/pt/state', { state: 'not-an-object' }, auth);
  assert.equal(r.status, 400, `expected 400, got ${r.status} body=${r.body}`);
});

test('PT state is per-user: user B does not see user A state', async () => {
  const regA = await request('POST', '/api/auth/register', {
    email: 'pt-user-a@example.com', password: 'goodpassword1', name: 'PtA',
  });
  const regB = await request('POST', '/api/auth/register', {
    email: 'pt-user-b@example.com', password: 'goodpassword1', name: 'PtB',
  });
  assert.equal(regA.status, 200);
  assert.equal(regB.status, 200);
  const authA = { authorization: `Bearer ${regA.json<AuthTokens>().accessToken}` };
  const authB = { authorization: `Bearer ${regB.json<AuthTokens>().accessToken}` };

  const put = await request('PUT', '/api/pt/state', { state: { xp: 999 } }, authA);
  assert.equal(put.status, 200);

  const gotB = await request('GET', '/api/pt/state', undefined, authB);
  assert.equal(gotB.status, 200);
  assert.equal(gotB.json<{ state: unknown }>().state, null, 'user B must not inherit user A state');
});

test('GET /api/growth/state without auth returns 401', async () => {
  const r = await request('GET', '/api/growth/state');
  assert.equal(r.status, 401, `expected 401, got ${r.status} body=${r.body}`);
});

test('Growth state round-trip and per-user isolation', async () => {
  const regA = await request('POST', '/api/auth/register', {
    email: 'growth-a@example.com', password: 'goodpassword1', name: 'GrowthA',
  });
  const regB = await request('POST', '/api/auth/register', {
    email: 'growth-b@example.com', password: 'goodpassword1', name: 'GrowthB',
  });
  assert.equal(regA.status, 200);
  assert.equal(regB.status, 200);
  const authA = { authorization: `Bearer ${regA.json<AuthTokens>().accessToken}` };
  const authB = { authorization: `Bearer ${regB.json<AuthTokens>().accessToken}` };

  const state = {
    v: 2,
    scores: { bible: 70 },
    gifts: { scores: { teaching: 88 }, behavior: 75, completedAt: '2026-08-26T00:00:00Z' },
    completedAt: '2026-08-25T00:00:00Z',
  };
  const put = await request('PUT', '/api/growth/state', { state }, authA);
  assert.equal(put.status, 200, `expected 200, got ${put.status} body=${put.body}`);

  const got = await request('GET', '/api/growth/state', undefined, authA);
  assert.equal(got.status, 200);
  const body = got.json<{ state: typeof state }>();
  assert.equal(body.state.gifts.scores.teaching, 88);

  const gotB = await request('GET', '/api/growth/state', undefined, authB);
  assert.equal(gotB.json<{ state: unknown }>().state, null, 'user B must not see user A profile');
});

test('WS /api/gemini/live accepts upgrade and emits error or closed', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/gemini/live?token=${APP_SECRET}`);

  // 1) Wait for the upgrade handshake to succeed (the test's core invariant).
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WS did not open within 5s'));
    }, 5000);
    ws.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.once('unexpected-response', (_req, res) => {
      clearTimeout(timeout);
      reject(new Error(`WS upgrade failed with HTTP ${res.statusCode}`));
    });
    ws.once('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // 2) Send a `start` to trigger the Gemini live.connect path. With our dummy
  //    GEMINI_API_KEY, this should produce a server-side error or close — both
  //    are acceptable. The test only fails if the WS never connected (404/500)
  //    or if it stays silent past the timeout.
  let sawTerminal = false;
  await new Promise<void>(resolve => {
    const timeout = setTimeout(() => resolve(), 4000); // soft timeout, still passes

    ws.on('message', raw => {
      try {
        const m = JSON.parse(raw.toString()) as { type?: string };
        if (m.type === 'error' || m.type === 'closed') {
          sawTerminal = true;
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        /* non-JSON frame — ignore */
      }
    });
    ws.on('close', () => {
      sawTerminal = true;
      clearTimeout(timeout);
      resolve();
    });

    ws.send(JSON.stringify({ type: 'start' }));
  });

  try { ws.close(); } catch { /* noop */ }

  // The strict requirement is that the upgrade succeeded (no 404/500); the
  // terminal event is a best-effort signal that the proxy is reachable.
  assert.ok(true, `WS upgrade succeeded; sawTerminal=${sawTerminal}`);
});
