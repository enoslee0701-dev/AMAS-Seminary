import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import { getUserState, putUserState } from '../staging/userStateStore.js';

/**
 * Pocket Theology state sync.
 *
 * The frontend keeps PTUserState (xp / streak / progress / badges /
 * journal / favorites) in localStorage and treats the server copy as a
 * cross-device backup. The whole state travels as one JSON document:
 *
 *   GET /api/pt/state  → { state: <json|null>, updatedAt: <ms|null> }
 *   PUT /api/pt/state  → { ok: true, updatedAt: <ms> }   body: { state }
 *
 * Both require a user JWT (service APP_SECRET callers have no user id to
 * key the row by, so they are rejected). Merge semantics live in the
 * frontend (services/ptSyncService.ts) — the server is a dumb store.
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * 存储从 SQLite `pt_state` 换成 Postgres
 * `public.app_practice_training_state`（pt = practice training）。
 * 线格式逐字不变；`state_json TEXT` → `state jsonb` 的适配见
 * `staging/userStateStore.ts`。身份是 Supabase UUID（D-42），
 * 拿不到就 401 fail closed。
 */

// The journal is user-typed text and can grow; 512 KB is far above any
// realistic state while still bounding a hostile payload.
const MAX_STATE_BYTES = 512 * 1024;

export function registerPtRoutes(app: Express): void {
  app.get('/api/pt/state', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!stagingConfigured()) {
      return res.status(503).json({ error: 'Staging database not configured.' });
    }
    try {
      const row = await getUserState('pt', uid);
      if (!row) return res.status(200).json({ state: null, updatedAt: null });
      res.status(200).json({ state: row.state, updatedAt: row.updatedAt });
    } catch (e) {
      console.error('[pt] read failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read PT state.' });
    }
  });

  app.put('/api/pt/state', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    const { state } = (req.body ?? {}) as { state?: unknown };
    if (state === null || state === undefined || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ error: 'state must be an object.' });
    }
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
      await putUserState('pt', uid, state, updatedAt);
      res.status(200).json({ ok: true, updatedAt });
    } catch (e) {
      console.error('[pt] write failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to store PT state.' });
    }
  });
}
