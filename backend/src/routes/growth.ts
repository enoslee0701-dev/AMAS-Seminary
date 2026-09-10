import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import { getUserState, putUserState } from '../staging/userStateStore.js';

/**
 * Christian growth profile sync (Christian Profile · 事奉倾向 · 实践证据).
 *
 * The client-side assessment engines produce one versioned JSON profile;
 * this endpoint is the shared, headless store for it:
 *   GET /api/growth/state  → { state: <json|null>, updatedAt: <ms|null> }
 *   PUT /api/growth/state  → { ok: true, updatedAt: <ms> }   body: { state }
 * Requires a user JWT. Merge semantics live in the frontend.
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * 存储从 SQLite `growth_state` 换成 Postgres `public.app_christian_profile`。
 * 线格式（`state` / `updatedAt` epoch 毫秒）**逐字不变**，前端不受影响。
 *
 * 形状适配见 `staging/userStateStore.ts`：SQLite 是 `state_json TEXT`，
 * Postgres 是 `state jsonb`，所以不再手工 stringify / parse。
 * `source_raw_hash` / `canonical_semantic_hash` 两列**刻意不填**。
 *
 * 身份是 **Supabase UUID**（D-42）；拿不到就 401 fail closed，不回落 legacy id。
 */

// The journal is user-typed text and can grow; 512 KB is far above any
// realistic state while still bounding a hostile payload.
const MAX_STATE_BYTES = 512 * 1024;

export function registerGrowthRoutes(app: Express): void {
  app.get('/api/growth/state', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!stagingConfigured()) {
      return res.status(503).json({ error: 'Staging database not configured.' });
    }
    try {
      const row = await getUserState('growth', uid);
      if (!row) return res.status(200).json({ state: null, updatedAt: null });
      res.status(200).json({ state: row.state, updatedAt: row.updatedAt });
    } catch (e) {
      console.error('[growth] read failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read growth state.' });
    }
  });

  app.put('/api/growth/state', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    const { state } = (req.body ?? {}) as { state?: unknown };
    if (state === null || state === undefined || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ error: 'state must be an object.' });
    }
    // 体积上限仍按序列化后的字节数判定 —— 与 SQLite 时期同一口径，
    // 即便现在不再把这个字符串存进数据库。
    let json: string;
    try { json = JSON.stringify(state); } catch {
      return res.status(400).json({ error: 'state is not serializable.' });
    }
    if (Buffer.byteLength(json, 'utf8') > MAX_STATE_BYTES) {
      return res.status(413).json({ error: 'state too large.' });
    }
    if (!stagingConfigured()) {
      return res.status(503).json({ error: 'Staging database not configured.' });
    }
    const updatedAt = Date.now();
    try {
      await putUserState('growth', uid, state, updatedAt);
      res.status(200).json({ ok: true, updatedAt });
    } catch (e) {
      console.error('[growth] write failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to store growth state.' });
    }
  });
}
