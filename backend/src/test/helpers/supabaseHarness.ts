/**
 * 本地 Supabase 测试装置（AUTH-M7）
 *
 * ★ 这**不是** mock，也不是测试逃生口。
 *   后端跑的是 100% 生产代码路径：jose 远端 JWKS + ES256 验签 + iss/aud 校验
 *   + REST 角色现查。变的只有配置里的 issuer 地址指向本地。
 *   项目明令禁止的是「用 mock 冒充真实能力」，而这里每一步都是真的：
 *   真密钥对、真 JWKS 端点、真签名、真验签。
 *
 * 抽出成模块的原因：AUTH-M7 移除 legacy 自签认证后，
 * `smoke.test.ts` 的 103 项测试再也不能用 POST /api/auth/register 造 fixture。
 * 它们需要与 `auth-m7-identity.test.ts` 相同的能力，不应各写一份。
 */
import http from 'node:http';
import crypto from 'node:crypto';
import net from 'node:net';
import Database from 'better-sqlite3';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

export interface FakeSupabase {
  /** 后端 SUPABASE_URL 应指向的地址 */
  origin: string;
  /** 签一张真实可验证的 Supabase 风格 access token */
  mintToken(sub: string, extra?: Record<string, unknown>): Promise<string>;
  /** 设置某个 Supabase UUID 的活动角色（模拟 user_roles 表） */
  setRoles(supabaseUserId: string, roles: string[]): void;
  /**
   * 预置一个"Supabase 里已存在"的账号，供 admin API 列举。
   * 迁移脚本据此把状态判成 mapped（而不是 needs_provision）。
   */
  seedAdminUser(email: string, id?: string): { id: string; email: string };
  /** 当前 admin API 里的账号快照（断言迁移是否重复建号用） */
  listAdminUsers(): { id: string; email: string }[];
  /** 关停 */
  stop(): Promise<void>;
}

/** 取一个空闲端口。 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * 起一个本地假 Supabase：只实现后端真正会调用的两个端点。
 *   GET /auth/v1/.well-known/jwks.json   —— 供 jose 拉公钥验签
 *   GET /rest/v1/user_roles?user_id=eq.X —— 供 requireAdmin 现查角色
 */
export async function startFakeSupabase(): Promise<FakeSupabase> {
  const kp = await generateKeyPair('ES256', { extractable: true });
  const privateKey: PrivateKey = kp.privateKey;
  const publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = 'smoke-test-key';
  publicJwk.alg = 'ES256';
  publicJwk.use = 'sig';

  const rolesByUserId: Record<string, string[]> = {};

  /**
   * Admin API 的账号表。
   *
   * 为什么放进这唯一的 harness 而不是另起一个：identity-migration 脚本要打
   * `/auth/v1/admin/users`（列举 + 建号）。项目规则是**只能有一套** fake
   * Supabase —— 再写第二个 server / signer / JWKS 是明令禁止的。
   * 所以把 admin 面也并进来，迁移验收与认证验收共用同一套身份事实。
   */
  const adminUsers = new Map<string, { id: string; email: string; user_metadata?: unknown }>();

  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (u.pathname === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    // ---- Admin API：迁移脚本用它列举与建号 ----
    if (u.pathname === '/auth/v1/admin/users') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ users: [...adminUsers.values()] }));
        return;
      }
      if (req.method === 'POST') {
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', () => {
          let body: { email?: string; user_metadata?: unknown } = {};
          try { body = JSON.parse(raw || '{}'); } catch { /* 非 JSON */ }
          const email = (body.email ?? '').trim().toLowerCase();
          if (!email) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'email required' }));
            return;
          }
          // 幂等：同一邮箱重复建号返回既有账号，复刻 Supabase 的唯一性约束
          const existing = adminUsers.get(email);
          if (existing) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(existing));
            return;
          }
          const created = { id: crypto.randomUUID(), email, user_metadata: body.user_metadata };
          adminUsers.set(email, created);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(created));
        });
        return;
      }
    }

    if (u.pathname === '/rest/v1/user_roles') {
      // 复刻 PostgREST 的 user_id=eq.<id> 过滤
      const filter = u.searchParams.get('user_id') ?? '';
      const id = filter.startsWith('eq.') ? decodeURIComponent(filter.slice(3)) : '';
      const roles = (rolesByUserId[id] ?? []).map(role => ({ role, expires_at: null }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(roles));
      return;
    }
    res.writeHead(404).end('{}');
  });

  const port = await freePort();
  await new Promise<void>(r => server.listen(port, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    async mintToken(sub, extra = {}) {
      return new SignJWT({ email: `${sub}@example.test`, ...extra })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuedAt()
        .setIssuer(`${origin}/auth/v1`)
        .setAudience('authenticated')
        .setSubject(sub)
        .setExpirationTime('30m')
        .sign(privateKey);
    },
    setRoles(supabaseUserId, roles) {
      rolesByUserId[supabaseUserId] = roles;
    },
    seedAdminUser(email, id) {
      const e = email.trim().toLowerCase();
      const rec = { id: id ?? crypto.randomUUID(), email: e };
      adminUsers.set(e, rec);
      return rec;
    },
    listAdminUsers() {
      return [...adminUsers.values()].map(u => ({ id: u.id, email: u.email }));
    },
    stop() {
      return new Promise<void>(r => server.close(() => r()));
    },
  };
}

export interface ProvisionedUser {
  /** canonical SQLite 用户（业务身份） */
  user: { id: string; email: string; name: string; role: string; avatar: string | null };
  /** Supabase UUID（认证身份） */
  supabaseUserId: string;
  /** 可直接放进 Authorization: Bearer 的 token */
  accessToken: string;
}

/**
 * 直接给 fixture 库播种 canonical 用户 + 身份映射，并签发对应 token。
 *
 * **刻意不经任何 HTTP 端点** —— AUTH-M7 之后后端不再提供注册/登录端点，
 * 测试 fixture 必须自己造。这也更接近真实：正式流程里 canonical 身份来自
 * 申请→审核→录取，而不是任何自助注册接口。
 */
export async function provisionUser(
  dbPath: string,
  sb: FakeSupabase,
  opts: {
    email: string;
    name: string;
    role?: string;
    avatar?: string | null;
    /** 指定 canonical id，便于断言；默认随机 uuid */
    userId?: string;
    /** 指定 Supabase UUID；默认随机 uuid */
    supabaseUserId?: string;
    /** 映射状态，默认 provisioned（唯一放行值） */
    mappingStatus?: string;
    /** Supabase user_roles 里的角色。role='admin' 时默认 super_admin */
    supabaseRole?: string;
  },
): Promise<ProvisionedUser> {
  const userId = opts.userId ?? crypto.randomUUID();
  const supabaseUserId = opts.supabaseUserId ?? crypto.randomUUID();
  const role = opts.role ?? 'student';
  const avatar = opts.avatar ?? null;

  const d = new Database(dbPath);
  try {
    d.prepare(
      `INSERT OR REPLACE INTO users
         (id, email, name, password_hash, salt, role, degree, avatar, bio, created_at)
       VALUES (?, ?, ?, 'x', 'x', ?, NULL, ?, NULL, ?)`,
    ).run(userId, opts.email, opts.name, role, avatar, Date.now());

    d.prepare(
      `INSERT OR REPLACE INTO legacy_user_map
         (legacy_user_id, supabase_user_id, normalized_email, mapping_status,
          mapping_reason, migration_batch, created_at)
       VALUES (?, ?, ?, ?, 'test-fixture', 'smoke-test', ?)`,
    ).run(userId, supabaseUserId, opts.email.toLowerCase(), opts.mappingStatus ?? 'provisioned', Date.now());
  } finally {
    d.close();
  }

  // ★ 两套角色词表不同，必须显式转换：
  //   SQLite users.role  用 'admin'（App 自己的业务角色）
  //   Supabase user_roles 用 registrar / academic_admin / super_admin
  //                       （与 Portal 的 is_admin_any 对齐，见 auth/supabase.ts ADMIN_ROLES）
  //   直接把 'admin' 塞进 user_roles 不会被 isAdminRole 认可 —— 会静默 403。
  if (role === 'admin') sb.setRoles(supabaseUserId, [opts.supabaseRole ?? 'super_admin']);
  else if (opts.supabaseRole) sb.setRoles(supabaseUserId, [opts.supabaseRole]);

  const accessToken = await sb.mintToken(supabaseUserId);
  return {
    user: { id: userId, email: opts.email, name: opts.name, role, avatar },
    supabaseUserId,
    accessToken,
  };
}
