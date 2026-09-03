import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRoomExists, requireRoomMember } from '../middleware/roomAuth.js';
import { db } from '../db.js';

/**
 * 祷告会历史沉淀（Phase 5）。**只读。零 schema 变更。**
 *
 * 在此之前，`/prayer-session/current` 只取 active/scheduled，
 * 一场祷告会 end 之后就从 UI 上彻底消失——数据都还在库里，只是没有入口。
 * 本模块补上入口。
 *
 * ## 唯一的硬规矩
 *
 * **没有真实数据，就不做看起来很真实的 UI。**
 *
 * 具体到这里：参与人数、累计人次、每人时长——一个都不返回。
 * 不是返回 0，是**字段根本不存在**，客户端连把它渲染成 0 的机会都没有。
 * 原因见 docs/PRAYER_ROOM_PHASE5_AUDIT.md §2.4：room_presence 在 leave 和
 * 超时清扫时都是 DELETE，只存当下不存历史，祷告会一结束就查不回来了。
 * 想要这些指标，得先做 Presence Snapshot，那是独立的一件事。
 *
 * ## 计划过 != 进行过
 *
 * 「今日共同祷告了什么」由 prayer_session_events 推导，不是直接列 items。
 * 清单里存在但从未被切换到的项目是**没有祷告过**的，单独归入 notVisited。
 * 不静默丢弃（会歪曲计划），也不混进 journey（会歪曲事实）。
 */

const now = () => Date.now();
const HISTORY_PAGE_DEFAULT = 20;
const HISTORY_PAGE_MAX = 50;

interface SessionRow {
  id: string; room_id: string; title: string | null;
  facilitator_user_id: string | null;
  started_at: number | null; ended_at: number | null;
  current_item_id: string | null;
}
interface ItemRow {
  id: string; position: number; title: string;
  description: string | null; scripture_ref: string | null; scripture_text: string | null;
}
interface EventRow {
  event_type: 'created' | 'started' | 'item_changed' | 'facilitator_changed' | 'ended';
  from_item_id: string | null; to_item_id: string | null; created_at: number;
}
interface ShareRow {
  id: string; user_id: string; text: string; is_anonymous: number; created_at: number;
}

const stmtEndedPage = db.prepare<[string, number, number], SessionRow & { ended_at: number }>(
  `SELECT id, room_id, title, facilitator_user_id, started_at, ended_at, current_item_id
   FROM prayer_sessions
   WHERE room_id = ? AND status = 'ended' AND ended_at IS NOT NULL AND ended_at < ?
   ORDER BY ended_at DESC LIMIT ?`,
);
const stmtEndedById = db.prepare<[string], SessionRow & { status: string }>(
  `SELECT id, room_id, title, status, facilitator_user_id, started_at, ended_at, current_item_id
   FROM prayer_sessions WHERE id = ?`,
);
const stmtItems = db.prepare<[string], ItemRow>(
  `SELECT id, position, title, description, scripture_ref, scripture_text
   FROM prayer_session_items WHERE session_id = ? ORDER BY position`,
);
const stmtEvents = db.prepare<[string], EventRow>(
  `SELECT event_type, from_item_id, to_item_id, created_at
   FROM prayer_session_events WHERE session_id = ? ORDER BY created_at, rowid`,
);
const stmtUser = db.prepare<[string], { id: string; name: string; avatar: string | null }>(
  'SELECT id, name, avatar FROM users WHERE id = ?',
);

/**
 * 会中分享的代祷。
 *
 * 归属靠时间窗，不靠新增 session_id 列——同一房间同一时刻只能有一个 active
 * session（uniq_active_session_per_room 数据库级保证），所以
 * created_at 落在 [started_at, ended_at] 内是**精确事实**而非推测。
 *
 * deleted_at / hidden_at 一律排除：历史页面不得成为绕过治理的后门。
 * 发布者删了就是删了，管理员隐藏了就是隐藏了，历史里也没有。
 */
const stmtWindowShares = db.prepare<[string, number, number], ShareRow>(
  `SELECT id, user_id, text, is_anonymous, created_at
   FROM prayer_shares
   WHERE room_id = ? AND deleted_at IS NULL AND hidden_at IS NULL
     AND created_at >= ? AND created_at <= ?
   ORDER BY created_at ASC`,
);
const stmtIntercessionCounts = db.prepare<[string, number, number],
  { share_id: string; n: number }>(
  `SELECT i.share_id AS share_id, COUNT(*) AS n
   FROM prayer_intercessions i JOIN prayer_shares s ON s.id = i.share_id
   WHERE s.room_id = ? AND s.created_at >= ? AND s.created_at <= ?
   GROUP BY i.share_id`,
);
const stmtMyIntercessions = db.prepare<[string, string, number, number], { share_id: string }>(
  `SELECT i.share_id AS share_id
   FROM prayer_intercessions i JOIN prayer_shares s ON s.id = i.share_id
   WHERE s.room_id = ? AND i.user_id = ? AND s.created_at >= ? AND s.created_at <= ?`,
);

export interface JourneySegment {
  itemId: string;
  title: string;
  description: string | null;
  scriptureRef: string | null;
  scriptureText: string | null;
  enteredAt: number;
  durationMs: number | null;
}

/**
 * 由事件日志重建「实际带领过的项目序列」。
 *
 * started 给出第一项，item_changed 给出每次切换，ended 给出收尾时刻。
 * 每段时长 = 下一次切换（或结束）时间 - 进入时间。
 *
 * 同一项被来回切换（advance 之后又 previous）会产生多段，这里按出现次序
 * 各记一段——合并成一段会丢掉「回头又为它祷告了一次」这个事实。
 */
export function buildJourney(events: EventRow[], items: ItemRow[]) {
  const byId = new Map(items.map(i => [i.id, i]));
  const segments: { itemId: string; enteredAt: number; leftAt: number | null }[] = [];

  const closeLast = (at: number) => {
    const last = segments[segments.length - 1];
    if (last && last.leftAt === null) last.leftAt = at;
  };

  for (const e of events) {
    if (e.event_type === 'started' || e.event_type === 'item_changed') {
      closeLast(e.created_at);
      if (e.to_item_id && byId.has(e.to_item_id)) {
        segments.push({ itemId: e.to_item_id, enteredAt: e.created_at, leftAt: null });
      }
    } else if (e.event_type === 'ended') {
      closeLast(e.created_at);
    }
  }

  const journey: JourneySegment[] = segments.map(s => {
    const it = byId.get(s.itemId)!;
    return {
      itemId: s.itemId,
      title: it.title,
      description: it.description,
      scriptureRef: it.scripture_ref,
      scriptureText: it.scripture_text,
      enteredAt: s.enteredAt,
      // leftAt 为 null 表示这一段没有闭合（例如会话没有正常 end）。
      // 这时不猜一个时长，返回 null，由 UI 诚实地表达「未记录」。
      durationMs: s.leftAt === null ? null : s.leftAt - s.enteredAt,
    };
  });

  const visited = new Set(journey.map(j => j.itemId));
  const notVisited = items
    .filter(i => !visited.has(i.id))
    .map(i => ({ itemId: i.id, title: i.title, scriptureRef: i.scripture_ref }));

  return { journey, notVisited };
}

/**
 * 匿名规则与实时视图完全一致（SEC-3 §9）：
 * is_anonymous 为真时不向任何人返回 user_id——包括 moderator 与房主。
 * 数据库仍保留 user_id 用于鉴权与滥用治理。历史视图不是放宽这条的理由。
 */
function mapShare(r: ShareRow, meId: string, intercessions: number, didIntercede: boolean) {
  return {
    id: r.id,
    userId: r.is_anonymous ? null : r.user_id,
    isAnonymous: Boolean(r.is_anonymous),
    isMine: r.user_id === meId,
    text: r.text,
    createdAt: r.created_at,
    intercessions,
    didIntercede,
  };
}

export function registerPrayerHistoryRoutes(app: Express): void {
  const guards = [requireAuth, requireRoomExists, requireRoomMember] as const;

  /**
   * GET /api/rooms/:roomId/prayer-sessions/history?limit=&before=
   *
   * 已结束的祷告会列表，按结束时间倒序。before 传上一页最后一条的 endedAt。
   * 每条只带列表页需要的最小信息——不带 items、不带 shares、不带任何人数。
   */
  app.get('/api/rooms/:roomId/prayer-sessions/history', ...guards, (req: Request, res: Response) => {
    const { roomId } = req.params;
    const q = req.query as { limit?: string; before?: string };
    const limit = Math.min(HISTORY_PAGE_MAX, Math.max(1, Number(q.limit) || HISTORY_PAGE_DEFAULT));
    const before = Number(q.before);
    const cursor = Number.isFinite(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER;

    const rows = stmtEndedPage.all(roomId, cursor, limit + 1);
    const page = rows.slice(0, limit);

    const sessions = page.map(s => {
      const { journey } = buildJourney(stmtEvents.all(s.id), stmtItems.all(s.id));
      const f = s.facilitator_user_id ? stmtUser.get(s.facilitator_user_id) : undefined;
      return {
        id: s.id,
        title: s.title,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        durationMs: s.started_at != null && s.ended_at != null ? s.ended_at - s.started_at : null,
        // 实际进行过的项数。不是计划项数——两者可以不同，而后者会误导。
        visitedItemCount: new Set(journey.map(j => j.itemId)).size,
        facilitator: f ? { userId: f.id, name: f.name, avatar: f.avatar } : null,
      };
    });

    res.json({
      sessions,
      // 有下一页时给出游标；没有就是 null，客户端据此停止加载
      nextBefore: rows.length > limit ? page[page.length - 1].ended_at : null,
      serverNow: now(),
    });
  });

  /**
   * GET /api/rooms/:roomId/prayer-sessions/:sessionId/summary
   *
   * 单场纪要。只对已结束的场次开放——进行中的场次请用 /prayer-session/current，
   * 那里才有 revision 与并发控制。
   */
  app.get('/api/rooms/:roomId/prayer-sessions/:sessionId/summary', ...guards,
    (req: Request, res: Response) => {
      const p = req.principal;
      const me = p && p.kind === 'user' ? p.user : null;
      if (!me) return res.status(401).json({ error: 'User token required.' });
      const { roomId, sessionId } = req.params;

      const s = stmtEndedById.get(sessionId);
      // 跨房间取 session 一律当作不存在（IDOR）
      if (!s || s.room_id !== roomId) {
        return res.status(404).json({ error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
      }
      if (s.status !== 'ended') {
        return res.status(409).json({ error: 'Session has not ended.', code: 'SESSION_NOT_ENDED' });
      }

      const items = stmtItems.all(s.id);
      const { journey, notVisited } = buildJourney(stmtEvents.all(s.id), items);
      const f = s.facilitator_user_id ? stmtUser.get(s.facilitator_user_id) : undefined;

      // 会中时间窗。start 之前 / end 之后的分享不属于这一场。
      let shares: ReturnType<typeof mapShare>[] = [];
      if (s.started_at != null && s.ended_at != null) {
        const counts = new Map(
          stmtIntercessionCounts.all(roomId, s.started_at, s.ended_at).map(r => [r.share_id, r.n]),
        );
        const mine = new Set(
          stmtMyIntercessions.all(roomId, me.id, s.started_at, s.ended_at).map(r => r.share_id),
        );
        shares = stmtWindowShares.all(roomId, s.started_at, s.ended_at)
          .map(r => mapShare(r, me.id, counts.get(r.id) ?? 0, mine.has(r.id)));
      }

      res.json({
        session: {
          id: s.id,
          title: s.title,
          startedAt: s.started_at,
          endedAt: s.ended_at,
          durationMs: s.started_at != null && s.ended_at != null ? s.ended_at - s.started_at : null,
          facilitator: f ? { userId: f.id, name: f.name, avatar: f.avatar } : null,
        },
        journey,
        notVisited,
        shares,
        serverNow: now(),
      });
    });
}
