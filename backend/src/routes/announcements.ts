import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAdmin } from '../middleware/auth.js';
import { broadcastToAllUsers } from './push.js';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import {
  listAnnouncements, getAnnouncement, insertAnnouncement, deleteAnnouncement,
  type AnnouncementType, type AnnouncementRecord,
} from '../staging/announcementStore.js';

/**
 * School-wide announcements.
 *
 * Reads are public (anyone can see school news); writes require admin.
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * SQLite `announcements` → Postgres `public.app_announcements`。
 * `type` 枚举两侧取值完全一致（important / normal），无需映射。
 *
 * ── 一处对外契约的诚实变化 ───────────────────────────────────────────
 * `publishedBy` 恒为 `'system'`。SQLite 时期它是**发布者姓名**；
 * Postgres 的 `published_by` 是 uuid（外键 profiles.id）。字段保留
 * （前端把它声明为必填），但不再声称某条公告是某个人发的 ——
 * 回传裸 UUID 当展示名比原来更糟，而列表接口逐条反查显示名是 N+1。
 * `'system'` 本来就在既有取值域里（service principal 发的公告一直是这个值）。
 */

function toWire(r: AnnouncementRecord): unknown {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    type: r.type,
    publishedAt: r.publishedAt,
    publishedBy: 'system',
  };
}

/** staging 未配置时明确报错，绝不静默回落到 SQLite。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

export function registerAnnouncementRoutes(app: Express): void {
  /**
   * GET /api/announcements — public. Newest-first.
   */
  app.get('/api/announcements', async (_req: Request, res: Response) => {
    if (!guardConfigured(res)) return;
    try {
      res.status(200).json((await listAnnouncements()).map(toWire));
    } catch (e) {
      console.error('[announcements] list failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read announcements.' });
    }
  });

  /**
   * POST /api/announcements — admin only.
   * Body: { title, content, type? }   (type defaults to 'normal')
   */
  app.post('/api/announcements', requireAdmin, async (req: Request, res: Response) => {
    const { title, content, type } = (req.body ?? {}) as {
      title?: unknown; content?: unknown; type?: unknown;
    };
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required.' });
    }
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required.' });
    }
    if (!guardConfigured(res)) return;
    const t: AnnouncementType = type === 'important' ? 'important' : 'normal';
    const titleTrim = title.trim().slice(0, 200);
    const contentTrim = content.slice(0, 8000);

    let rec: AnnouncementRecord;
    try {
      rec = await insertAnnouncement({
        id: crypto.randomUUID(),
        title: titleTrim,
        content: contentTrim,
        type: t,
        // service principal（APP_SECRET）没有人类身份 → null。
        publishedByUuid: activeUserUuid(req),
      });
    } catch (e) {
      console.error('[announcements] create failed:', (e as Error).message);
      return res.status(502).json({ error: 'Failed to create announcement.' });
    }
    res.status(200).json(toWire(rec));

    // Fan-out push to every iOS device. Fire-and-forget so a push failure
    // never breaks announcement creation. No-op when APNs isn't configured.
    void broadcastToAllUsers({
      title: '新公告',
      body: titleTrim,
      data: { announcementId: rec.id },
    }).catch(() => { /* swallow — push failure must not surface to clients */ });
  });

  /**
   * DELETE /api/announcements/:id — admin only.
   */
  app.delete('/api/announcements/:id', requireAdmin, async (req: Request, res: Response) => {
    if (!guardConfigured(res)) return;
    try {
      if (!(await getAnnouncement(req.params.id))) {
        return res.status(404).json({ error: 'Announcement not found.' });
      }
      await deleteAnnouncement(req.params.id);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[announcements] delete failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to delete announcement.' });
    }
  });
}
