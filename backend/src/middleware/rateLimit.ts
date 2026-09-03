import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * **Layer A —— 认证前的 IP 保护**（SEC-3 §10）。
 *
 * 它跑在 requireAuth 之前，因此拿不到 userId，只能按 IP 计数。
 * 教会 / 学校 / 宿舍常共享 NAT，所以这一层**不承担业务级用户限流**——
 * 阈值放宽到只拦机器人、失控循环与未登录攻击。
 *
 * 业务限流由 Layer B（下方 byUser 系列）在认证之后按 userId 执行。
 * 60 → 600：单个真实用户 10 秒轮询 + 20 秒心跳远达不到，
 * 而同一 NAT 出口下几十个用户也不会互相挤爆。
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  // Tests fire many requests back-to-back against the same /api/* surface
  // (multiple suite tests share one server process). Raise the cap in
  // NODE_ENV=test so the limiter doesn't introduce spurious 429s.
  max: process.env.NODE_ENV === 'test' ? 10_000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path === '/api/health',
  message: { error: 'Too many requests, slow down.' },
});

/**
 * Stricter limiter applied to token-issuing endpoints. These mint
 * server-signed JWTs and are the most attractive abuse targets.
 */
export const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token requests, slow down.' },
});

/**
 * Strict per-IP limiter for credential endpoints (register / login).
 * Separate instance from `tokenLimiter` so brute-force attempts against
 * /auth/login don't steal budget from legitimate voice-token requests
 * (and vice versa). Tests bump the cap so the suite can register many
 * fake users in quick succession without tripping the limiter.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, slow down.' },
});

/**
 * Simple per-IP active-connection tracker for the Gemini WS proxy.
 *
 * `acquire(ip)` returns false if the cap is exceeded (caller should reject
 * the upgrade). `release(ip)` MUST be called when the connection closes.
 */
export const WS_MAX_CONNECTIONS_PER_IP = 5;

const wsConnections = new Map<string, number>();

export function acquireWsSlot(ip: string): boolean {
  const current = wsConnections.get(ip) ?? 0;
  if (current >= WS_MAX_CONNECTIONS_PER_IP) return false;
  wsConnections.set(ip, current + 1);
  return true;
}

export function releaseWsSlot(ip: string): void {
  const current = wsConnections.get(ip) ?? 0;
  if (current <= 1) {
    wsConnections.delete(ip);
  } else {
    wsConnections.set(ip, current - 1);
  }
}

/** Test-only: clear the WS connection table. */
export function _resetWsConnections(): void {
  wsConnections.clear();
}

/**
 * **Layer B —— 认证后的用户级业务限流**（SEC-3 §10）。
 *
 * key = `userId:action`。这是真正约束滥用的一层：
 * 同一 NAT 下 A 刷屏只会限制 A，B 不受影响。
 * 未认证请求回落到 IP（此时 Layer A 才是主要防线）。
 *
 * 刻意保持轻量：复用 express-rate-limit 的 keyGenerator，不引入新框架。
 */
const byUser = (suffix: string) => (req: Request): string => {
  const p = (req as { principal?: { kind: string; user?: { id: string } } }).principal;
  const id = p && p.kind === 'user' && p.user ? p.user.id : (req.ip ?? 'anon');
  return `${id}:${suffix}`;
};

/** 发布 / 删除 / 代祷：每用户 20 次/分钟。正常使用远达不到，刷屏会被挡。 */
export const prayerWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: byUser('prayer_write'),
  message: { error: 'Too many prayer actions, please slow down.' },
});

/** 心跳：客户端 20 秒一次，每用户 10 次/分钟足够覆盖重连抖动。 */
export const prayerHeartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10_000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: byUser('prayer_heartbeat'),
  message: { error: 'Too many heartbeats.' },
});

/** room.join / room.leave：正常使用极低频，20/分钟足够覆盖重连。 */
export const roomMembershipLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: byUser('room_membership'),
  message: { error: 'Too many join/leave requests.' },
});
