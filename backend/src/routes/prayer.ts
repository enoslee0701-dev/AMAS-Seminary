import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import {
  requireRoomExists, requireRoomMember, requireRoomManager, activeUserUuid,
} from '../middleware/roomAuth.js';
import { inspectPrayerText } from '../middleware/textSafety.js';
import { readPresence, writeHeartbeat, clearPresence } from '../rooms/presence.js';
import { prayerWriteLimiter, prayerHeartbeatLimiter } from '../middleware/rateLimit.js';
import { emitRoomEvent } from '../realtime/roomEvents.js';
import { stagingConfigured } from '../staging/pgData.js';
import {
  listTopics, replaceTopics,
  listShares, getShare, findShareByIdem, insertShare, softDeleteShare,
  hideShare, unhideShare,
  intercede, unintercede, intercessionsFor, intercessionCount,
  createReport, reportsOfRoom, REPORT_REASONS, type ReportReason,
} from '../staging/prayerStore.js';

/**
 * 祷告室（Prayer Room）后端。
 *
 * 设计要点（见 docs/PRAYER_ROOM_REDESIGN.md）：
 *  - 祷告主题取代原先只存在 localStorage 的「祷告墙」，房主编辑后全房可见；
 *  - 祷告分享常含第三方敏感信息，因此**仅房内可见 / 支持匿名 / 发布者可自删**；
 *  - 「代祷」不是点赞：给「求主医治我母亲」点赞在语义上是错的，
 *    因此接口叫 intercede，返回的是「多少人正在为此祷告」；
 *  - 在线成员用心跳 + 超时判定，不需要 WebSocket（轮询档）。
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * SQLite `room_prayer_topics` / `prayer_shares` / `prayer_intercessions` /
 * `prayer_share_reports` → 对应的 Postgres `app_*` 表。
 *
 * 身份统一 **Supabase UUID**（D-42）：这四张表的身份列都外键到 `profiles.id`。
 * 因此「是不是我发的」「我有没有代祷」这类判定全部按 UUID 比对，
 * 不再用 canonical SQLite id。
 *
 * SQLite 里那 15 行历史分享/代祷/主题已由 STAGING-1A11 永久裁定 SKIP
 * （13 行源自 D-34 测试装置，2 行是父房间不存在的孤儿），
 * **不复制、不重建** —— 这些表为空是正确终态。
 */

// PRESENCE_TTL / 心跳 / 在线名单已迁至 rooms/presence.ts，与其它四个房间共用。
const MAX_TEXT = 500;
const MAX_TOPICS = 12;
const SHARE_PAGE = 50;

const uid = () => crypto.randomBytes(9).toString('hex');
const now = () => Date.now();

/** 房主判定统一走 roomAuth 中间件解析出的 req.room，避免两处实现漂移。 */
const isHostReq = (req: Request): boolean => Boolean(req.room?.isHost);

/** staging 未配置时明确报错，绝不静默回落到 SQLite。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

export function registerPrayerRoutes(app: Express): void {
  /**
   * GET /api/rooms/:roomId/prayer
   * 一次取回整个祷告室状态（主题 + 在线成员 + 分享 + 我的代祷）。
   * 客户端 10 秒轮询这一个接口即可，避免打 4 个请求。
   */
  app.get('/api/rooms/:roomId/prayer',
    requireAuth, requireRoomExists, requireRoomMember,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      const { roomId } = req.params;
      try {
        // 在线名单与祷告室之外的四个房间共用同一份实现（rooms/presence.ts），
        // 免得 TTL、显示名清洗、role 判定在两处慢慢漂移。
        const [presence, topics, rawShares] = await Promise.all([
          readPresence(roomId),
          listTopics(roomId),
          listShares(roomId, SHARE_PAGE),
        ]);
        // 代祷数与「我是否代祷」一次批量取回，不在循环里逐条查。
        const inter = await intercessionsFor(rawShares.map(s => s.id), me);

        const isManager = Boolean(req.room?.isManager);
        const shares = rawShares.map(s => {
          const hidden = s.hiddenAt != null;
          const isMine = s.userId === me;
          // 被隐藏的内容**不向普通成员返回正文**。作者本人与 manager 需要知情，
          // 但连 manager 也拿不到匿名帖的作者身份（§9）。
          const text = !hidden ? s.text
            : isMine ? '（此内容已被管理员隐藏，仅你可见此提示）'
              : isManager ? s.text
                : '（此内容已被管理员隐藏）';
          const n = inter.get(s.id) ?? { count: 0, mine: false };
          return {
            id: s.id,
            // 匿名分享不向任何人暴露 user_id——包括 moderator 与房主
            userId: s.isAnonymous ? null : s.userId,
            // 作者已注销与作者主动匿名是两回事，前端必须能区分（D-AUTH-1 第 4/5 条）
            authorState: s.authorState,
            isAnonymous: s.isAnonymous,
            isMine,
            text,
            hidden,
            hiddenReason: hidden && (isMine || isManager) ? s.hiddenReason : null,
            createdAt: s.createdAt,
            intercessions: n.count,
            didIntercede: n.mine,
          };
        });

        res.json({
          topics,
          presence,
          shares,
          isHost: isHostReq(req),
          isManager,
          isModerator: Boolean(req.room?.isModerator),
          serverTime: now(),
        });
      } catch (e) {
        console.error('[prayer] read failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to read prayer room.' });
      }
    });

  /**
   * PUT /api/rooms/:roomId/prayer/topics
   * 房主整体替换本次祷告主题。Body: { topics: string[] }
   */
  app.put('/api/rooms/:roomId/prayer/topics',
    requireAuth, requireRoomExists, requireRoomMember, requireRoomManager,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      const { roomId } = req.params;
      const raw = (req.body ?? {}).topics;
      if (!Array.isArray(raw)) return res.status(400).json({ error: 'topics must be an array.' });
      if (!guardConfigured(res)) return;
      const topics = raw
        .map((t: unknown) => String(t ?? '').trim())
        .filter(t => t.length > 0)
        .slice(0, MAX_TOPICS)
        .map(t => t.slice(0, MAX_TEXT));

      try {
        const saved = await replaceTopics(roomId, topics, me, uid, now());
        void emitRoomEvent(roomId, 'theme.changed');
        res.json({ ok: true, topics: saved });
      } catch (e) {
        console.error('[prayer] topics write failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to store prayer topics.' });
      }
    });

  /**
   * POST /api/rooms/:roomId/prayer/shares
   * Body: { text, isAnonymous? }
   */
  app.post('/api/rooms/:roomId/prayer/shares',
    requireAuth, requireRoomExists, requireRoomMember, prayerWriteLimiter,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      const { roomId } = req.params;
      const body = (req.body ?? {}) as {
        text?: string; isAnonymous?: boolean; clientRequestId?: string;
      };
      const { text } = inspectPrayerText(String(body.text ?? ''), MAX_TEXT);
      if (!text) return res.status(400).json({ error: 'text is required.' });
      if (!guardConfigured(res)) return;

      // §12 幂等：同 room + 同 user（来自 JWT，不信 body）+ 同 clientRequestId
      // 只能产生一条。重复请求返回 200 + 既有资源；首次创建返回 201。
      const cid = body.clientRequestId ? String(body.clientRequestId).slice(0, 64) : null;
      try {
        if (cid) {
          const existing = await findShareByIdem(roomId, me, cid);
          if (existing) {
            return res.status(200).json({ ok: true, id: existing.id, idempotentReplay: true });
          }
        }
        const id = uid();
        try {
          await insertShare({
            id, roomId, userUuid: me, text,
            isAnonymous: Boolean(body.isAnonymous), clientRequestId: cid,
          });
        } catch (e) {
          // 并发下唯一索引兜底：另一请求已抢先写入，返回它。
          const existing = cid ? await findShareByIdem(roomId, me, cid) : undefined;
          if (existing) {
            return res.status(200).json({ ok: true, id: existing.id, idempotentReplay: true });
          }
          throw e;
        }
        void emitRoomEvent(roomId, 'prayer.changed', id);
        res.status(cid ? 201 : 200).json({ ok: true, id, idempotentReplay: false });
      } catch (e) {
        console.error('[prayer] share write failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to store prayer share.' });
      }
    });

  /**
   * DELETE /api/rooms/:roomId/prayer/shares/:shareId
   * 只有发布者本人或房主可以删（软删除，内容不再返回）。
   */
  app.delete('/api/rooms/:roomId/prayer/shares/:shareId',
    requireAuth, requireRoomExists, requireRoomMember, prayerWriteLimiter,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      const { roomId, shareId } = req.params;
      try {
        const row = await getShare(shareId);
        if (!row || row.roomId !== roomId) {
          return res.status(404).json({ error: 'Share not found.' });
        }
        if (row.userId !== me && !isHostReq(req)) {
          return res.status(403).json({ error: 'Only the author or host can delete.' });
        }
        await softDeleteShare(shareId, now());
        void emitRoomEvent(roomId, 'prayer.changed', shareId);
        res.json({ ok: true });
      } catch (e) {
        console.error('[prayer] share delete failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to delete prayer share.' });
      }
    });

  /**
   * POST   /api/rooms/:roomId/prayer/shares/:shareId/intercede   登记「我为你祷告」
   * DELETE 同路径                                                取消登记
   * 这不是点赞：返回的是正在为此代祷的人数。
   */
  const setIntercede = (add: boolean) => async (req: Request, res: Response) => {
    const me = activeUserUuid(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    const { roomId, shareId } = req.params;
    try {
      const row = await getShare(shareId);
      if (!row || row.roomId !== roomId) {
        return res.status(404).json({ error: 'Share not found.' });
      }
      if (add) await intercede(shareId, me, now());
      else await unintercede(shareId, me);
      const n = await intercessionCount(shareId);
      void emitRoomEvent(roomId, 'prayer.changed', shareId, n);
      res.json({ ok: true, intercessions: n, didIntercede: add });
    } catch (e) {
      console.error('[prayer] intercede failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to update intercession.' });
    }
  };
  app.post('/api/rooms/:roomId/prayer/shares/:shareId/intercede',
    requireAuth, requireRoomExists, requireRoomMember, prayerWriteLimiter, setIntercede(true));
  app.delete('/api/rooms/:roomId/prayer/shares/:shareId/intercede',
    requireAuth, requireRoomExists, requireRoomMember, prayerWriteLimiter, setIntercede(false));

  /**
   * POST /api/rooms/:roomId/prayer/shares/:shareId/hide     隐藏不当内容（manager）
   * POST /api/rooms/:roomId/prayer/shares/:shareId/unhide   取消隐藏（manager）
   *
   * 与「删除」区分：删除是作者对自己内容的权利；隐藏是治理手段。
   * **不物理删除记录**——正文保留，供治理与申诉。
   * Moderator 不应通过 delete 冒充作者删除内容。
   */
  app.post('/api/rooms/:roomId/prayer/shares/:shareId/hide',
    requireAuth, requireRoomExists, requireRoomMember, requireRoomManager, prayerWriteLimiter,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      const { roomId, shareId } = req.params;
      try {
        const row = await getShare(shareId);
        if (!row || row.roomId !== roomId) {
          return res.status(404).json({ error: 'Share not found.' });
        }
        const reason = String((req.body ?? {}).reason ?? 'other').slice(0, 200);
        await hideShare(shareId, me, reason, now());
        void emitRoomEvent(roomId, 'moderation.changed', shareId);
        res.json({ ok: true, hidden: true });
      } catch (e) {
        console.error('[prayer] hide failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to hide prayer share.' });
      }
    });

  app.post('/api/rooms/:roomId/prayer/shares/:shareId/unhide',
    requireAuth, requireRoomExists, requireRoomMember, requireRoomManager, prayerWriteLimiter,
    async (req: Request, res: Response) => {
      if (!guardConfigured(res)) return;
      const { roomId, shareId } = req.params;
      try {
        const row = await getShare(shareId);
        if (!row || row.roomId !== roomId) {
          return res.status(404).json({ error: 'Share not found.' });
        }
        await unhideShare(shareId);
        void emitRoomEvent(roomId, 'moderation.changed', shareId);
        res.json({ ok: true, hidden: false });
      } catch (e) {
        console.error('[prayer] unhide failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to unhide prayer share.' });
      }
    });

  /**
   * POST /api/rooms/:roomId/prayer/shares/:shareId/report   举报（任何成员）
   * Body: { reason: privacy|harassment|spam|unsafe|other }
   * 同一人对同一条重复举报不产生新行。
   */
  app.post('/api/rooms/:roomId/prayer/shares/:shareId/report',
    requireAuth, requireRoomExists, requireRoomMember, prayerWriteLimiter,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      const reason = String((req.body ?? {}).reason ?? 'other');
      if (!REPORT_REASONS.includes(reason as ReportReason)) {
        return res.status(400).json({ error: 'Invalid reason.' });
      }
      if (!guardConfigured(res)) return;
      const { roomId, shareId } = req.params;
      try {
        const row = await getShare(shareId);
        if (!row || row.roomId !== roomId) {
          return res.status(404).json({ error: 'Share not found.' });
        }
        const created = await createReport({
          id: uid(), shareId, reporterUuid: me,
          reason: reason as ReportReason, at: now(),
        });
        // 只通知「有举报状态变化」，**不含举报人身份**
        if (created) void emitRoomEvent(roomId, 'moderation.changed', shareId);
        res.json({ ok: true, created });
      } catch (e) {
        console.error('[prayer] report failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to report prayer share.' });
      }
    });

  /**
   * GET /api/rooms/:roomId/prayer/reports   查看本房举报（manager 专属）
   * 返回里**不含举报人与被举报者身份**——匿名帖的作者对 manager 同样不可见（§9）。
   */
  app.get('/api/rooms/:roomId/prayer/reports',
    requireAuth, requireRoomExists, requireRoomMember, requireRoomManager,
    async (req: Request, res: Response) => {
      if (!guardConfigured(res)) return;
      try {
        const rows = await reportsOfRoom(req.params.roomId);
        res.json({
          reports: rows.map(r => ({
            id: r.report.id,
            shareId: r.report.shareId,
            reason: r.report.reason,
            status: r.report.status,
            createdAt: r.report.createdAt,
            hidden: r.hidden,
            excerpt: r.excerpt,
          })),
        });
      } catch (e) {
        console.error('[prayer] reports read failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to read reports.' });
      }
    });

  /**
   * POST   /api/rooms/:roomId/prayer/heartbeat   Body: { name, avatar?, role? }
   * DELETE /api/rooms/:roomId/prayer/presence    离开房间
   */
  app.post('/api/rooms/:roomId/prayer/heartbeat',
    requireAuth, requireRoomExists, requireRoomMember, prayerHeartbeatLimiter,
    async (req: Request, res: Response) => {
      // SEC-2 §7 的「显示名只从服务器读取」与 §15 的 bidi 清洗都在
      // rooms/presence.ts 里，两条路径共用同一份实现。
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      await writeHeartbeat(req, req.params.roomId, me);
      res.json({ ok: true });
    });

  app.delete('/api/rooms/:roomId/prayer/presence',
    requireAuth, requireRoomExists, requireRoomMember,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      await clearPresence(req.params.roomId, me);
      res.json({ ok: true });
    });
}
