import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRoomExists, requireRoomMember } from '../middleware/roomAuth.js';
import { prayerHeartbeatLimiter } from '../middleware/rateLimit.js';
import {
  readPresence, writeHeartbeat, clearPresence,
  PRESENCE_TTL_MS, PRESENCE_HEARTBEAT_MS,
} from '../rooms/presence.js';

/**
 * 房间在线状态的通用端点（P1-1）。
 *
 * 祷告室的 presence 一直挂在 `/api/rooms/:id/prayer*` 下。读经室、讲道室、
 * 赞美室、交通室要接真时不该去调一个叫 prayer 的接口，也不该为此把祷告主题
 * 和代祷分享一起拉回来——那些数据与它们无关。
 *
 * 所以这里给出三个**只管在线状态**的端点。实现共用
 * `rooms/presence.ts`，与祷告室是同一份代码、同一个 TTL、同一套显示名清洗，
 * 不存在第二套实现。
 *
 * ## 边界
 *
 * - 只返回 presence。不返回主题、不返回分享、不返回任何房间业务内容。
 * - `role` 字段**不表示音频状态**。没有 speaker，没有「正在说话」，
 *   没有举手 —— 这些能力目前不存在，接口里也就没有对应字段。
 * - 权限：`requireAuth → requireRoomExists → requireRoomMember`。
 *   非成员一律 403，因此 A 房间的在线名单不会泄漏给 B 房间的人。
 */
export function registerRoomPresenceRoutes(app: Express): void {
  const guards = [requireAuth, requireRoomExists, requireRoomMember] as const;

  /**
   * GET /api/rooms/:roomId/presence
   *
   * onlineCount 直接由 presence 数组长度得出，不单独查一次——
   * 两个数字必须永远一致，分开算就有机会不一致。
   */
  app.get('/api/rooms/:roomId/presence', ...guards, (req: Request, res: Response) => {
    const presence = readPresence(req.params.roomId);
    res.json({
      presence,
      onlineCount: presence.length,
      serverTime: Date.now(),
      ttlMs: PRESENCE_TTL_MS,
      heartbeatMs: PRESENCE_HEARTBEAT_MS,
    });
  });

  /** POST /api/rooms/:roomId/presence/heartbeat */
  app.post('/api/rooms/:roomId/presence/heartbeat', ...guards, prayerHeartbeatLimiter,
    (req: Request, res: Response) => {
      const p = req.principal;
      const me = p && p.kind === 'user' ? p.user : null;
      if (!me) return res.status(401).json({ error: 'User token required.' });
      writeHeartbeat(req, req.params.roomId, me.id);
      res.json({ ok: true });
    });

  /**
   * DELETE /api/rooms/:roomId/presence
   *
   * 只清在线状态，**不解除 membership**——收起房间、切后台、断网都不该丢授权。
   * 解除成员关系只发生在用户显式「离开房间」时（POST /leave）。
   */
  app.delete('/api/rooms/:roomId/presence', ...guards, (req: Request, res: Response) => {
    const p = req.principal;
    const me = p && p.kind === 'user' ? p.user : null;
    if (!me) return res.status(401).json({ error: 'User token required.' });
    clearPresence(req.params.roomId, me.id);
    res.json({ ok: true });
  });
}
