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
  /**
   * 签一张**故意不合格**的 token，用于否定式断言：
   *   issuer   换成别的签发者（验证 iss 校验没被绕过）
   *   expired  已过期
   *   foreignKey  用另一把私钥签（验证 JWKS 验签真的在做）
   * 这些能力集中在 harness 里，测试就不必各自持有第二把密钥。
   */
  mintBadToken(sub: string, kind: 'issuer' | 'expired' | 'foreignKey'): Promise<string>;
  /** 设置某个 Supabase UUID 的活动角色（模拟 user_roles 表） */
  setRoles(supabaseUserId: string, roles: string[]): void;
  /**
   * 预置一个"Supabase 里已存在"的账号，供 admin API 列举。
   * 迁移脚本据此把状态判成 mapped（而不是 needs_provision）。
   */
  seedAdminUser(email: string, id?: string): { id: string; email: string };
  /** 当前 admin API 里的账号快照（断言迁移是否重复建号用） */
  listAdminUsers(): { id: string; email: string }[];
  /**
   * DB-12：预置某张业务表的行（模拟 staging 里已迁入的数据）。
   * 覆盖式写入——传空数组即清空该表。
   */
  seedTable(table: string, rows: Record<string, unknown>[]): void;
  /** DB-12：读回某张业务表的当前内容（断言写入是否真的落到 Postgres 路径）。 */
  tableRows(table: string): Record<string, unknown>[];
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
/**
 * ── PostgREST 过滤器求值（仅测试用）─────────────────────────────────
 *
 * 这几个函数复刻 PostgREST 的查询语义，覆盖 `staging/*.ts` 实际发出的形式。
 * 刻意**只**实现用到的算子：多实现一个，就多一条「测试能过、线上不能过」的
 * 缝隙。新增算子时请连同真实调用点一起加。
 */

/** `in.("a","b")` → ['a','b']。PostgREST 用双引号包裹每个值。 */
function parseInList(expr: string): string[] {
  const inner = expr.slice(expr.indexOf('(') + 1, expr.lastIndexOf(')'));
  if (!inner.trim()) return [];
  return inner.split(',').map(v => {
    const t = decodeURIComponent(v.trim());
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
  });
}

/**
 * 值比较。两边都能解析成有限数字就按数字比，否则按字符串比。
 *
 * 时间戳是 ISO 8601 字符串，字典序与时间序一致，因此字符串比较即正确 ——
 * 这也是 `ended_at=lt.<iso>` 这类过滤能工作的原因。
 */
function cmpValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const na = Number(a); const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && typeof a !== 'boolean' && typeof b !== 'boolean') {
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  const sa = String(a); const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** 单个 `col=<op>.<value>` 条件。 */
function matchOne(row: Record<string, unknown>, col: string, expr: string): boolean {
  const val = row[col];
  if (expr === 'is.null') return val === null || val === undefined;
  if (expr === 'not.is.null') return val !== null && val !== undefined;
  if (expr.startsWith('in.')) {
    return parseInList(expr).includes(String(val ?? ''));
  }
  const dot = expr.indexOf('.');
  if (dot < 0) return false;
  const op = expr.slice(0, dot);
  const raw = decodeURIComponent(expr.slice(dot + 1));
  switch (op) {
    case 'eq': return String(val ?? '') === raw;
    case 'neq': return String(val ?? '') !== raw;
    case 'gt': return cmpValues(val, raw) > 0;
    case 'gte': return cmpValues(val, raw) >= 0;
    case 'lt': return cmpValues(val, raw) < 0;
    case 'lte': return cmpValues(val, raw) <= 0;
    default: return false;
  }
}

/** 顶层按逗号切分，尊重括号嵌套（`and(a.eq.1,b.eq.2),c.eq.3` → 两项）。 */
function splitTerms(inner: string): string[] {
  const out: string[] = [];
  let depth = 0; let cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** `or=(...)` / `and=(...)` 的一个项：要么是嵌套组，要么是 `col.op.value`。 */
function matchTerm(row: Record<string, unknown>, term: string): boolean {
  const t = term.trim();
  const grp = /^(and|or)\((.*)\)$/s.exec(t);
  if (grp) {
    const terms = splitTerms(grp[2]!);
    return grp[1] === 'and'
      ? terms.every(x => matchTerm(row, x))
      : terms.some(x => matchTerm(row, x));
  }
  // `col.op.value` —— 第一个点之前是列名，其余交给 matchOne。
  const dot = t.indexOf('.');
  if (dot < 0) return false;
  return matchOne(row, t.slice(0, dot), t.slice(dot + 1));
}

/** 整个查询串对一行是否成立。 */
function matchesQuery(row: Record<string, unknown>, params: URLSearchParams): boolean {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    if (k === 'or') {
      const inner = v.startsWith('(') ? v.slice(1, -1) : v;
      if (!splitTerms(inner).some(t => matchTerm(row, t))) return false;
      continue;
    }
    if (k === 'and') {
      const inner = v.startsWith('(') ? v.slice(1, -1) : v;
      if (!splitTerms(inner).every(t => matchTerm(row, t))) return false;
      continue;
    }
    if (!matchOne(row, k, v)) return false;
  }
  return true;
}

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

  /** DB-12：业务表的内存存储，键为表名（仅 app_* 表）。 */
  const tables: Record<string, Record<string, unknown>[]> = {};

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
      // 复刻 PostgREST 的 user_id 过滤。两种形式都要支持：
      //   eq.<id>        —— 运行时授权现查（auth/supabase.ts）
      //   in.("a","b")   —— DB-13B 的批量显示身份解析（staging/profileStore.ts）
      const filter = u.searchParams.get('user_id') ?? '';
      let ids: string[] = [];
      if (filter.startsWith('eq.')) {
        ids = [decodeURIComponent(filter.slice(3))];
      } else if (filter.startsWith('in.')) {
        ids = parseInList(filter);
      }
      const roles = ids.flatMap(id =>
        (rolesByUserId[id] ?? []).map(role => ({
          user_id: id, role, expires_at: null, revoked_at: null,
        })));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(roles));
      return;
    }

    // ── DB-12/DB-13B：业务表的通用 PostgREST 模拟 ────────────────────
    // 只支持后端**真正用到**的子集。刻意不做成完整 PostgREST——
    // 多出来的能力只会让测试通过而线上失败。
    //
    // 覆盖范围（每一项都对应 staging/*.ts 里实际发出的查询）：
    //   过滤   eq. neq. gt. gte. lt. lte. is.null not.is.null in.(...)
    //          以及 or=(...) / and(...) 嵌套（friendStore 的无向关系查询要用）
    //   排序   order=col.dir[,col2.dir]（sessionStore 的 created_at,id 双键）
    //   分页   limit
    //   写入   POST（insert / upsert）· PATCH（条件更新）· DELETE（必须带过滤）
    const m = /^\/rest\/v1\/(app_[a-z_]+|profiles|course_catalog)$/.exec(u.pathname);
    if (m) {
      const table = m[1]!;
      const rows = tables[table] ?? (tables[table] = []);
      const RESERVED = ['select', 'order', 'limit', 'offset'];

      if (req.method === 'GET') {
        let out = rows.filter(r => matchesQuery(r, u.searchParams));
        const order = u.searchParams.get('order');
        if (order) {
          // 多键排序：`created_at.asc,id.asc`
          const keys = order.split(',').map(seg => {
            const [col, dir] = seg.split('.');
            return { col: col!, desc: dir === 'desc' };
          });
          out = [...out].sort((a, b) => {
            for (const k of keys) {
              const c = cmpValues(a[k.col], b[k.col]);
              if (c !== 0) return k.desc ? -c : c;
            }
            return 0;
          });
        }
        const limit = Number(u.searchParams.get('limit') ?? '0');
        if (limit > 0) out = out.slice(0, limit);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
      }

      if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          // 与真实实现一致：DELETE / PATCH 必须带过滤条件，拒绝全表操作。
          const hasFilter = [...u.searchParams].some(([k]) => !RESERVED.includes(k));

          if (req.method === 'DELETE') {
            if (!hasFilter) { res.writeHead(400).end('{"message":"delete requires filter"}'); return; }
            tables[table] = rows.filter(r => !matchesQuery(r, u.searchParams));
            res.writeHead(204).end();
            return;
          }

          let parsed: unknown;
          try { parsed = JSON.parse(body || '{}'); } catch {
            res.writeHead(400).end('{"message":"bad json"}'); return;
          }
          const prefer = String(req.headers['prefer'] ?? '');

          if (req.method === 'PATCH') {
            if (!hasFilter) { res.writeHead(400).end('{"message":"update requires filter"}'); return; }
            const patch = parsed as Record<string, unknown>;
            const touched: Record<string, unknown>[] = [];
            for (let i = 0; i < rows.length; i++) {
              if (!matchesQuery(rows[i]!, u.searchParams)) continue;
              rows[i] = { ...rows[i], ...patch };
              touched.push(rows[i]!);
            }
            // 返回**实际被更新的行**。空数组即「影响 0 行」——
            // 乐观并发的冲突判定就靠它（见 pgData.updateRows）。
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(touched));
            return;
          }

          const incoming = Array.isArray(parsed)
            ? parsed as Record<string, unknown>[]
            : [parsed as Record<string, unknown>];
          // 冲突键必须按表而定：app_rooms / app_course_files 等以 `id` 为主键，
          // 而 app_room_members / app_room_presence 的主键是 (room_id, user_id)、
          // 根本没有 `id` 列。若一律拿 `id` 比对，两边都是 undefined 会恒等，
          // 于是每次 upsert 都覆盖第一行 —— presence 人数会永远停在 1。
          const keyCols = (r: Record<string, unknown>): string[] => {
            if ('id' in r) return ['id'];
            for (const pair of [
              ['room_id', 'user_id'], ['post_id', 'user_id'],
              ['user_id', 'book_id'], ['user_id', 'course_code'],
              ['share_id', 'user_id'], ['user_id', 'token'],
              ['user_a', 'user_b'],
            ]) {
              if (pair.every(k => k in r)) return pair;
            }
            // 单列主键（room_id 的 reading state、user_id 的状态表）
            for (const k of ['room_id', 'user_id', 'code']) if (k in r) return [k];
            return Object.keys(r);
          };
          const sameKey = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
            keyCols(b).every(k => a[k] === b[k]);
          for (const row of incoming) {
            const i = prefer.includes('merge-duplicates')
              ? rows.findIndex(r => sameKey(r, row)) : -1;
            if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push(row);
          }
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(prefer.includes('return=representation') ? JSON.stringify(incoming) : '[]');
        });
        return;
      }
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
    async mintBadToken(sub, kind) {
      const base = () => new SignJWT({ email: `${sub}@example.test` })
        .setProtectedHeader({ alg: 'ES256' })
        .setAudience('authenticated')
        .setSubject(sub);
      if (kind === 'issuer') {
        return base().setIssuedAt().setIssuer('https://evil.example/auth/v1')
          .setExpirationTime('10m').sign(privateKey);
      }
      if (kind === 'expired') {
        const past = Math.floor(Date.now() / 1000) - 3600;
        return base().setIssuedAt(past).setIssuer(`${origin}/auth/v1`)
          .setExpirationTime(past + 60).sign(privateKey);
      }
      // foreignKey：另一把 ES256 私钥，公钥**不在** JWKS 里
      const other = await generateKeyPair('ES256', { extractable: true });
      return base().setIssuedAt().setIssuer(`${origin}/auth/v1`)
        .setExpirationTime('10m').sign(other.privateKey);
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
    seedTable(table, rows) {
      tables[table] = rows.map(r => ({ ...r }));
    },
    tableRows(table) {
      return (tables[table] ?? []).map(r => ({ ...r }));
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

  // DB-13B：同时播种 `profiles` 行。
  //
  // 切换后好友 / 带领者 / 阅读位置发布者的**显示身份**来自 `profiles`
  // （见 staging/profileStore.ts），不再来自 SQLite `users` —— 因为业务主体
  // 已经是 Supabase UUID，两者值域不同。不播种这一行，这些接口会把用户
  // 当作「profile 已不存在」而过滤掉，测试会以一个很难定位的空列表失败。
  //
  // 用 push 而非替换：一个测试里会 provision 多个用户。
  sb.seedTable('profiles', [
    ...sb.tableRows('profiles').filter(r => r.id !== supabaseUserId),
    {
      id: supabaseUserId,
      display_name: opts.name,
      legal_name: null,
      email: opts.email,
      timezone: 'Asia/Hong_Kong',
      locale: 'zh-HK',
      avatar_path: avatar,
      account_status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const accessToken = await sb.mintToken(supabaseUserId);
  return {
    user: { id: userId, email: opts.email, name: opts.name, role, avatar },
    supabaseUserId,
    accessToken,
  };
}
