import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRoomExists, requireRoomMember, isMember } from '../middleware/roomAuth.js';
import { subscribeRoom, eventsSince, currentEventId, type RoomEvent } from '../realtime/roomEvents.js';

/**
 * 房间事件流（Phase 3）。
 *
 * ## Transport 选择：authenticated fetch streaming（SSE 格式）
 *
 * 本项目的 JWT 只走 `Authorization: Bearer`。浏览器的 `EventSource` 与
 * `WebSocket` 都**无法设置自定义请求头**，用它们就得把 token 塞进 URL query
 * ——会进 access log、Referer、代理日志。因此改用 `fetch()` + ReadableStream
 * 读取 SSE 文本流：能带 Bearer 头，能直接复用 Express 的
 * requireAuth → requireRoomExists → requireRoomMember 守卫链。
 *
 * Realtime 只做**失效通知**，不接受任何业务命令（§2）——
 * 这是一条单向流，写操作一律继续走 REST。
 *
 * ## 鉴权与隔离
 * - 未认证 → 401；非成员 → 403（§22）
 * - 订阅严格按 URL 上的 roomId，且该 roomId 已通过 membership 校验，
 *   因此改 roomId 订阅别人的房间会被 403（§24）
 * - 连接期间每 30 秒复查一次 membership：用户显式 Leave 后，
 *   旧连接必须失效，不能继续收事件（§23）
 */

const HEARTBEAT_MS = 25_000;      // 心跳，兼容会掐死静默连接的反向代理
const MEMBERSHIP_RECHECK_MS = 30_000;

export function registerRoomStreamRoutes(app: Express): void {
  /**
   * GET /api/rooms/:roomId/stream?since=<lastEventId>
   * `text/event-stream`，只发失效通知，不含任何业务数据。
   */
  app.get('/api/rooms/:roomId/stream', requireAuth, requireRoomExists, requireRoomMember,
    (req: Request, res: Response) => {
      const p = req.principal;
      if (!p || p.kind !== 'user') { res.status(401).end(); return; }
      const userId = p.user.id;
      const { roomId } = req.params;

      res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',   // no-transform 阻止代理/CDN 缓冲
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',                   // nginx 不缓冲
      });
      res.flushHeaders?.();

      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // 先告知当前 cursor，客户端据此对齐 lastEventId
      send('ready', { cursor: currentEventId(), serverNow: Date.now() });

      // 断线续传：把 since 之后的事件补齐。
      // 客户端拿到后仍会做一次 full refresh，因此即使补不全也不会永久 stale（§8）。
      const since = Number(req.query.since ?? 0);
      if (Number.isFinite(since) && since > 0) {
        for (const e of eventsSince(roomId, since)) send('room', e);
      }

      const unsub = subscribeRoom(roomId, (e: RoomEvent) => send('room', e));

      const hb = setInterval(() => { res.write(': hb\n\n'); }, HEARTBEAT_MS);
      // §23 membership 被撤销后必须断开，不能让旧长连接继续收事件
      const recheck = setInterval(() => {
        const stillHost = req.room?.hostId === userId;
        if (!stillHost && !isMember(roomId, userId)) {
          send('closed', { reason: 'membership_revoked' });
          cleanup();
          res.end();
        }
      }, MEMBERSHIP_RECHECK_MS);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(hb);
        clearInterval(recheck);
        unsub();
      };
      req.on('close', cleanup);
      res.on('close', cleanup);
    });
}
