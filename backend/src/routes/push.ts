import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  apnsConfigured,
  sendToToken,
  sendToMany,
  TERMINAL_REASONS,
  type PushPayload,
} from '../push/apnsClient.js';
import { db } from '../db.js';

/**
 * Push notification token registry.
 *
 * Device-token plumbing (register / unregister / list / test) + real APNs
 * delivery via `../push/apnsClient.ts`. When the APNS_* env vars are not
 * set the server boots fine — `/api/push/test` returns a stub response and
 * `broadcastToAllUsers` becomes a silent no-op so other routes can
 * fire-and-forget without leaking errors.
 *
 * Storage is the SQLite `push_tokens` table; the primary key
 * `(user_id, token)` makes register idempotent and unregister a simple
 * DELETE. A future Postgres swap is a single-file change.
 */

type Platform = 'ios' | 'android' | 'web';

interface PushTokenRow {
  user_id: string;
  token: string;
  platform: Platform;
  registered_at: number;
}

const stmtUpsertToken = db.prepare<[
  string, string, Platform, number,
]>(`
  INSERT INTO push_tokens (user_id, token, platform, registered_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, token) DO UPDATE SET
    platform = excluded.platform,
    registered_at = excluded.registered_at
`);
const stmtDeleteToken = db.prepare<[string, string]>(
  'DELETE FROM push_tokens WHERE user_id = ? AND token = ?',
);
const stmtCountForUser = db.prepare<[string], { c: number }>(
  'SELECT COUNT(*) AS c FROM push_tokens WHERE user_id = ?',
);
const stmtPlatformsForUser = db.prepare<[string], { platform: Platform; c: number }>(
  `SELECT platform, COUNT(*) AS c
     FROM push_tokens
    WHERE user_id = ?
    GROUP BY platform`,
);
const stmtTokensForUser = db.prepare<[string], PushTokenRow>(
  'SELECT * FROM push_tokens WHERE user_id = ?',
);
const stmtAllIosTokens = db.prepare<[], PushTokenRow>(
  "SELECT * FROM push_tokens WHERE platform = 'ios'",
);

function countForUser(userId: string): number {
  const r = stmtCountForUser.get(userId);
  return r ? r.c : 0;
}

function platformBreakdownForUser(userId: string): Record<Platform, number> {
  const breakdown: Record<Platform, number> = { ios: 0, android: 0, web: 0 };
  for (const row of stmtPlatformsForUser.all(userId)) {
    breakdown[row.platform] = row.c;
  }
  return breakdown;
}

export function registerPushRoutes(app: Express): void {
  /**
   * POST /api/push/register — auth required.
   * Body: { token: string, platform: 'ios' | 'android' | 'web' }.
   * Idempotent: re-registering the same token updates `registeredAt`
   * but does not duplicate the entry. Returns the total token count
   * for the calling user.
   */
  app.post('/api/push/register', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const { token, platform } = (req.body ?? {}) as { token?: unknown; platform?: unknown };
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'token is required.' });
    }
    if (platform !== 'ios' && platform !== 'android' && platform !== 'web') {
      return res.status(400).json({ error: "platform must be 'ios' | 'android' | 'web'." });
    }
    stmtUpsertToken.run(principal.user.id, token, platform, Date.now());
    res.status(200).json({ ok: true, count: countForUser(principal.user.id) });
  });

  /**
   * POST /api/push/unregister — auth required.
   * Body: { token: string }. Removes the given token from the
   * caller's set. No-op if the token was never registered.
   */
  app.post('/api/push/unregister', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const { token } = (req.body ?? {}) as { token?: unknown };
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'token is required.' });
    }
    stmtDeleteToken.run(principal.user.id, token);
    res.status(200).json({ ok: true, count: countForUser(principal.user.id) });
  });

  /**
   * GET /api/push/tokens — auth required.
   * Returns the caller's registered-token summary. The actual token
   * strings are deliberately NOT returned — only the count and a
   * per-platform breakdown — so the UI can render "you have N devices"
   * without exposing push tokens to the JS context.
   */
  app.get('/api/push/tokens', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    res.status(200).json({
      count: countForUser(principal.user.id),
      platforms: platformBreakdownForUser(principal.user.id),
    });
  });

  /**
   * POST /api/push/test — auth required.
   *
   * Triggers a real APNs send to the caller's first registered iOS device
   * when APNS_KEY_PATH / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID are
   * all set. Without those env vars, returns a stub response so dev /
   * test environments don't have to ship Apple credentials.
   *
   * The response never leaks the full device token — only an 8-char
   * prefix — so logs and HTTP captures remain safe to share.
   */
  app.post('/api/push/test', requireAuth, async (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rows = stmtTokensForUser.all(principal.user.id);
    // Prefer an iOS token (only APNs is wired today); fall back to the first
    // registered token of any platform so the stub response still shows
    // something useful on web/android dev devices.
    const first = rows.find(t => t.platform === 'ios') ?? rows[0];
    if (!first) {
      return res.status(404).json({ error: 'No device tokens registered.' });
    }
    const prefix = first.token.slice(0, 8);

    if (!apnsConfigured() || first.platform !== 'ios') {
      // Stub path — no APNs creds, or token is for a non-iOS platform.
      return res.status(200).json({
        ok: true,
        wouldSendTo: `${prefix}…`,
        platform: first.platform,
        message: 'APNs not configured on server; stub response.',
      });
    }

    const result = await sendToToken(first.token, {
      title: 'AMAS',
      body: '测试推送',
    });
    if (!result.ok && result.reason && TERMINAL_REASONS.has(result.reason)) {
      // Token is dead — prune so future tests don't keep hitting it.
      stmtDeleteToken.run(principal.user.id, first.token);
    }
    return res.status(200).json({
      ok: result.ok,
      sentTo: `${prefix}…`,
      platform: first.platform,
      ...(result.ok ? {} : { reason: result.reason ?? 'Unknown' }),
    });
  });
}

/**
 * Iterate every registered iOS token across every user and broadcast a
 * single payload. Best-effort — does NOT throw; on transport failure it
 * returns `{ delivered: 0, removed: 0 }`. Tokens that APNs reports as
 * `BadDeviceToken` or `Unregistered` are pruned from the table so we
 * don't keep pushing to dead devices.
 *
 * Other routes call this fire-and-forget after creating user-visible
 * content (a new post, a new announcement). When APNs is not configured
 * we short-circuit at the apnsConfigured() check — dev / CI / unit-test
 * environments never hit the network and never emit error logs.
 */
export async function broadcastToAllUsers(
  payload: PushPayload,
): Promise<{ delivered: number; removed: number }> {
  if (!apnsConfigured()) return { delivered: 0, removed: 0 };

  // Collect every iOS token with its owning user_id so we can prune the
  // right row on a terminal failure.
  const targets = stmtAllIosTokens.all();
  if (targets.length === 0) return { delivered: 0, removed: 0 };

  const tokens = targets.map(t => t.token);
  const bulk = await sendToMany(tokens, payload);
  let removed = 0;
  for (const r of bulk.results) {
    if (!r.ok && r.reason && TERMINAL_REASONS.has(r.reason)) {
      const owner = targets.find(t => t.token === r.token);
      if (owner) {
        const info = stmtDeleteToken.run(owner.user_id, r.token);
        if (info.changes > 0) removed++;
      }
    }
  }
  return { delivered: bulk.ok, removed };
}

/** Test-only: wipe in-memory state. */
export function _resetPushTokens(): void {
  db.prepare('DELETE FROM push_tokens').run();
}
