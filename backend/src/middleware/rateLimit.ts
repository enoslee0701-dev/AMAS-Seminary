import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * General per-IP rate limit applied to all `/api/*` routes (excluding
 * `/api/health`). 60 requests per minute is generous for normal client
 * behavior but blocks runaway loops and basic abuse.
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  // Tests fire many requests back-to-back against the same /api/* surface
  // (multiple suite tests share one server process). Raise the cap in
  // NODE_ENV=test so the limiter doesn't introduce spurious 429s.
  max: process.env.NODE_ENV === 'test' ? 10_000 : 60,
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
