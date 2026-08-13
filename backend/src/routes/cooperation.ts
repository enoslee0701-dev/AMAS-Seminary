import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../middleware/auth.js';
import { db } from '../db.js';

/**
 * Cooperation (institutional partnership) submissions.
 *
 * Public form submission — anyone can POST. Listing requires admin since
 * submissions may contain contact info that shouldn't be world-readable.
 *
 * Persisted to SQLite (`cooperation_submissions` table) as part of
 * Wave-2 — the previous in-memory `Map<string, CooperationRecord>` lost
 * data on every server restart.
 */
interface CooperationRow {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  message: string | null;
  type: string | null;
  received_at: number;
}

const stmtInsertSubmission = db.prepare<[
  string, string, string, string, string, string, number,
]>(`
  INSERT INTO cooperation_submissions
    (id, name, email, organization, message, type, received_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const stmtListSubmissions = db.prepare<[], CooperationRow>(
  'SELECT * FROM cooperation_submissions ORDER BY received_at DESC',
);

const stmtClearSubmissions = db.prepare('DELETE FROM cooperation_submissions');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strict per-IP limit for the public POST endpoint to slow spam. 10/min
 * matches the auth limiter posture — most legit users submit at most once.
 * In test mode the cap is widened so the suite can exercise multiple
 * scenarios from the same loopback IP.
 */
const cooperationPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions, please try again later.' },
});

function rowToWire(r: CooperationRow): unknown {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    organization: r.organization ?? '',
    message: r.message ?? '',
    type: r.type ?? '',
    receivedAt: r.received_at,
  };
}

export function registerCooperationRoutes(app: Express): void {
  /**
   * POST /api/cooperation — public.
   * Body: { name, email, organization, message, type }
   * Returns: { id, receivedAt }
   */
  app.post('/api/cooperation', cooperationPostLimiter, (req: Request, res: Response) => {
    const { name, email, organization, message, type } = (req.body ?? {}) as {
      name?: unknown; email?: unknown; organization?: unknown;
      message?: unknown; type?: unknown;
    };
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'email is required.' });
    }
    if (!EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    if (typeof organization !== 'string' || !organization.trim()) {
      return res.status(400).json({ error: 'organization is required.' });
    }
    if (typeof type !== 'string' || !type.trim()) {
      return res.status(400).json({ error: 'type is required.' });
    }
    const id = crypto.randomUUID();
    const receivedAt = Date.now();
    stmtInsertSubmission.run(
      id,
      name.trim().slice(0, 200),
      email.trim().toLowerCase().slice(0, 320),
      organization.trim().slice(0, 200),
      typeof message === 'string' ? message.slice(0, 4000) : '',
      type.trim().slice(0, 64),
      receivedAt,
    );
    res.status(200).json({ id, receivedAt });
  });

  /**
   * GET /api/cooperation — admin only. Returns all submissions, newest first.
   */
  app.get('/api/cooperation', requireAdmin, (_req: Request, res: Response) => {
    const list = stmtListSubmissions.all().map(rowToWire);
    res.status(200).json(list);
  });
}

/** Test-only: wipe the cooperation submissions table. */
export function _resetCooperation(): void {
  stmtClearSubmissions.run();
}
