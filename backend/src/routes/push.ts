import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  apnsConfigured,
  sendToToken,
  sendToMany,
  TERMINAL_REASONS,
  type PushPayload,
} from '../push/apnsClient.js';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import {
  upsertToken, deleteToken, tokensForUser, allIosTokens,
  PLATFORMS, type Platform, type PushToken,
} from '../staging/pushStore.js';

/**
 * Push notification token registry.
 *
 * Device-token plumbing (register / unregister / list / test) + real APNs
 * delivery via `../push/apnsClient.ts`. When the APNS_* env vars are not
 * set the server boots fine — `/api/push/test` returns a stub response and
 * `broadcastToAllUsers` becomes a silent no-op so other routes can
 * fire-and-forget without leaking errors.
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * 存储从 SQLite `push_tokens` 换成 Postgres `public.app_push_tokens`。
 * 主键仍是 `(user_id, token)`，所以 register 幂等、unregister 是双条件
 * DELETE —— 对外语义逐字不变。
 *
 * 身份换成 **Supabase UUID**（`principal.authId`，D-42）：`user_id` 外键到
 * `profiles.id`，写 canonical SQLite id 必然违反外键。拿不到 UUID 一律
 * 401 fail closed，**不回落**到 legacy id。
 *
 * 未配置 staging 时返回 503，绝不静默落回 SQLite（双写正是要消灭的东西）。
 */

/** 令牌数与按平台分布 —— 对外只暴露统计，不暴露 token 本身。 */
function summarize(tokens: PushToken[]): {
  count: number; platforms: Record<Platform, number>;
} {
  const platforms: Record<Platform, number> = { ios: 0, android: 0, web: 0 };
  for (const t of tokens) platforms[t.platform] += 1;
  return { count: tokens.length, platforms };
}

/** staging 未配置时明确报错，绝不静默回落到 SQLite。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

export function registerPushRoutes(app: Express): void {
  /**
   * POST /api/push/register — auth required.
   * Body: { token: string, platform: 'ios' | 'android' | 'web' }.
   * Idempotent: re-registering the same token updates `registeredAt`
   * but does not duplicate the entry. Returns the total token count
   * for the calling user.
   */
  app.post('/api/push/register', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    const { token, platform } = (req.body ?? {}) as { token?: unknown; platform?: unknown };
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'token is required.' });
    }
    if (!PLATFORMS.includes(platform as Platform)) {
      return res.status(400).json({ error: "platform must be 'ios' | 'android' | 'web'." });
    }
    if (!guardConfigured(res)) return;
    try {
      await upsertToken(uid, token, platform as Platform);
      res.status(200).json({ ok: true, count: (await tokensForUser(uid)).length });
    } catch (e) {
      console.error('[push] register failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to register push token.' });
    }
  });

  /**
   * POST /api/push/unregister — auth required.
   * Body: { token: string }. Removes the given token from the
   * caller's set. No-op if the token was never registered.
   */
  app.post('/api/push/unregister', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    const { token } = (req.body ?? {}) as { token?: unknown };
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'token is required.' });
    }
    if (!guardConfigured(res)) return;
    try {
      await deleteToken(uid, token);
      res.status(200).json({ ok: true, count: (await tokensForUser(uid)).length });
    } catch (e) {
      console.error('[push] unregister failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to unregister push token.' });
    }
  });

  /**
   * GET /api/push/tokens — auth required.
   * Returns the caller's registered-token summary. The actual token
   * strings are deliberately NOT returned — only the count and a
   * per-platform breakdown — so the UI can render "you have N devices"
   * without exposing push tokens to the JS context.
   */
  app.get('/api/push/tokens', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      res.status(200).json(summarize(await tokensForUser(uid)));
    } catch (e) {
      console.error('[push] list failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read push tokens.' });
    }
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
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    let rows: PushToken[];
    try {
      rows = await tokensForUser(uid);
    } catch (e) {
      console.error('[push] test lookup failed:', (e as Error).message);
      return res.status(502).json({ error: 'Failed to read push tokens.' });
    }
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
      await deleteToken(uid, first.token).catch(() => {});
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
  // staging 未配置时静默跳过：广播是 fire-and-forget 的附带动作，
  // 不该因为它让「发帖 / 发公告」这些主流程报错。
  if (!stagingConfigured()) return { delivered: 0, removed: 0 };

  // Collect every iOS token with its owning user_id so we can prune the
  // right row on a terminal failure.
  let targets: PushToken[];
  try {
    targets = await allIosTokens();
  } catch (e) {
    console.error('[push] broadcast lookup failed:', (e as Error).message);
    return { delivered: 0, removed: 0 };
  }
  if (targets.length === 0) return { delivered: 0, removed: 0 };

  const tokens = targets.map(t => t.token);
  const bulk = await sendToMany(tokens, payload);
  let removed = 0;
  for (const r of bulk.results) {
    if (!r.ok && r.reason && TERMINAL_REASONS.has(r.reason)) {
      const owner = targets.find(t => t.token === r.token);
      if (owner) {
        try { await deleteToken(owner.userId, r.token); removed++; } catch { /* 尽力而为 */ }
      }
    }
  }
  return { delivered: bulk.ok, removed };
}
