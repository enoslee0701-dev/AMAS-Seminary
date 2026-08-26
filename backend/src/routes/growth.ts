import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db.js';

/**
 * Christian growth profile sync (定制化神学 · 恩赐辨识 · 事奉匹配).
 *
 * The client-side assessment engines produce one versioned JSON profile;
 * this endpoint is the shared, headless store for it:
 *   GET /api/growth/state  → { state: <json|null>, updatedAt: <ms|null> }
 *   PUT /api/growth/state  → { ok: true, updatedAt: <ms> }   body: { state }
 * Requires a user JWT. Merge semantics live in the frontend.
 */

// The journal is user-typed text and can grow; 512 KB is far above any
// realistic state while still bounding a hostile payload.
const MAX_STATE_BYTES = 512 * 1024;

const stmtGet = db.prepare<[string], { state_json: string; updated_at: number }>(
  'SELECT state_json, updated_at FROM growth_state WHERE user_id = ? LIMIT 1',
);

const stmtUpsert = db.prepare<[string, string, number]>(`
  INSERT INTO growth_state (user_id, state_json, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    state_json = excluded.state_json,
    updated_at = excluded.updated_at
`);

const stmtClear = db.prepare('DELETE FROM growth_state');

export function registerGrowthRoutes(app: Express): void {
  app.get('/api/growth/state', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const row = stmtGet.get(principal.user.id);
    if (!row) return res.status(200).json({ state: null, updatedAt: null });
    let state: unknown = null;
    try { state = JSON.parse(row.state_json); } catch { /* corrupt row → null */ }
    res.status(200).json({ state, updatedAt: row.updated_at });
  });

  app.put('/api/growth/state', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
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
    const updatedAt = Date.now();
    stmtUpsert.run(principal.user.id, json, updatedAt);
    res.status(200).json({ ok: true, updatedAt });
  });
}

/** Test-only: wipe the growth_state table. */
export function _resetGrowthState(): void {
  stmtClear.run();
}
