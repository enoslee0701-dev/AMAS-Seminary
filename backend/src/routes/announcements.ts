import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAdmin } from '../middleware/auth.js';
import { broadcastToAllUsers } from './push.js';
import { db } from '../db.js';

/**
 * School-wide announcements.
 *
 * Reads are public (anyone can see school news); writes require admin.
 * Persisted to SQLite (`announcements` table) — the wire shape is
 * unchanged so the frontend doesn't notice the swap.
 */

type AnnouncementType = 'important' | 'normal';

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  published_at: number;
  published_by: string | null;
}

const stmtInsertAnnouncement = db.prepare<[
  string, string, string, AnnouncementType, number, string,
]>(`
  INSERT INTO announcements
    (id, title, content, type, published_at, published_by)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const stmtListAnnouncements = db.prepare<[], AnnouncementRow>(
  'SELECT * FROM announcements ORDER BY published_at DESC',
);

const stmtGetAnnouncement = db.prepare<[string], AnnouncementRow>(
  'SELECT * FROM announcements WHERE id = ? LIMIT 1',
);

const stmtDeleteAnnouncement = db.prepare<[string]>(
  'DELETE FROM announcements WHERE id = ?',
);

const stmtClearAnnouncements = db.prepare('DELETE FROM announcements');

function rowToWire(r: AnnouncementRow): unknown {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    type: r.type,
    publishedAt: r.published_at,
    publishedBy: r.published_by ?? 'system',
  };
}

export function registerAnnouncementRoutes(app: Express): void {
  /**
   * GET /api/announcements — public. Newest-first.
   */
  app.get('/api/announcements', (_req: Request, res: Response) => {
    const list = stmtListAnnouncements.all().map(rowToWire);
    res.status(200).json(list);
  });

  /**
   * POST /api/announcements — admin only.
   * Body: { title, content, type? }   (type defaults to 'normal')
   */
  app.post('/api/announcements', requireAdmin, (req: Request, res: Response) => {
    const { title, content, type } = (req.body ?? {}) as {
      title?: unknown; content?: unknown; type?: unknown;
    };
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required.' });
    }
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required.' });
    }
    const t: AnnouncementType = type === 'important' ? 'important' : 'normal';
    const principal = req.principal;
    const publishedBy = principal && principal.kind === 'user'
      ? principal.user.name
      : 'system';
    const id = crypto.randomUUID();
    const publishedAt = Date.now();
    const titleTrim = title.trim().slice(0, 200);
    const contentTrim = content.slice(0, 8000);
    stmtInsertAnnouncement.run(
      id, titleTrim, contentTrim, t, publishedAt, publishedBy,
    );
    const wire = {
      id,
      title: titleTrim,
      content: contentTrim,
      type: t,
      publishedAt,
      publishedBy,
    };
    res.status(200).json(wire);

    // Fan-out push to every iOS device. Fire-and-forget so a push failure
    // never breaks announcement creation. No-op when APNs isn't configured.
    try {
      void broadcastToAllUsers({
        title: '新公告',
        body: titleTrim,
        data: { announcementId: id },
      }).catch(() => { /* swallow — push failure must not surface to clients */ });
    } catch {
      /* swallow — push failure must not surface to clients */
    }
  });

  /**
   * DELETE /api/announcements/:id — admin only.
   */
  app.delete('/api/announcements/:id', requireAdmin, (req: Request, res: Response) => {
    const id = req.params.id;
    if (!stmtGetAnnouncement.get(id)) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }
    stmtDeleteAnnouncement.run(id);
    res.status(200).json({ ok: true });
  });
}

/** Test-only: wipe the announcements table. */
export function _resetAnnouncements(): void {
  stmtClearAnnouncements.run();
}
