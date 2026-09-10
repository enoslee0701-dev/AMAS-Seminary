import type { Express, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  requireRoomExists, requireRoomMember, activeUserUuid,
} from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import { resolveProfiles } from '../staging/profileStore.js';
import {
  endedSessions, getSession, listItems, listEvents,
  type ItemRecord, type SessionEventRecord,
} from '../staging/sessionStore.js';
import {
  sharesInWindow, intercessionsFor, type ShareRecord,
} from '../staging/prayerStore.js';

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
 * 原因见 docs/PRAYER_ROOM_PHASE5_AUDIT.md §2.4：presence 在 leave 和
 * 超时清扫时都是 DELETE，只存当下不存历史，祷告会一结束就查不回来了。
 * 想要这些指标，得先做 Presence Snapshot，那是独立的一件事。
 *
 * ## 计划过 != 进行过
 *
 * 「今日共同祷告了什么」由会话事件日志推导，不是直接列 items。
 * 清单里存在但从未被切换到的项目是**没有祷告过**的，单独归入 notVisited。
 * 不静默丢弃（会歪曲计划），也不混进 journey（会歪曲事实）。
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * 本文件读的六张表全部随 PRAYER 整域一起切到 Postgres，
 * 因此**不存在**「一半读 SQLite、一半读 Postgres」的跨库读取端 ——
 * 这正是 DB-13A 清点里点出、并要求四个文件同批切换的那个风险。
 *
 * 身份是 **Supabase UUID**（D-42）：`isMine` 按 UUID 比对，
 * 带领者显示名由 `profiles` 解析（原先读 SQLite `users`）。
 */

const now = () => Date.now();
const HISTORY_PAGE_DEFAULT = 20;
const HISTORY_PAGE_MAX = 50;

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
export function buildJourney(events: SessionEventRecord[], items: ItemRecord[]) {
  const byId = new Map(items.map(i => [i.id, i]));
  const segments: { itemId: string; enteredAt: number; leftAt: number | null }[] = [];

  const closeLast = (at: number) => {
    const last = segments[segments.length - 1];
    if (last && last.leftAt === null) last.leftAt = at;
  };

  for (const e of events) {
    if (e.eventType === 'started' || e.eventType === 'item_changed') {
      closeLast(e.createdAt);
      if (e.toItemId && byId.has(e.toItemId)) {
        segments.push({ itemId: e.toItemId, enteredAt: e.createdAt, leftAt: null });
      }
    } else if (e.eventType === 'ended') {
      closeLast(e.createdAt);
    }
  }

  const journey: JourneySegment[] = segments.map(s => {
    const it = byId.get(s.itemId)!;
    return {
      itemId: s.itemId,
      title: it.title,
      description: it.description,
      scriptureRef: it.scriptureRef,
      scriptureText: it.scriptureText,
      enteredAt: s.enteredAt,
      // leftAt 为 null 表示这一段没有闭合（例如会话没有正常 end）。
      // 这时不猜一个时长，返回 null，由 UI 诚实地表达「未记录」。
      durationMs: s.leftAt === null ? null : s.leftAt - s.enteredAt,
    };
  });

  const visited = new Set(journey.map(j => j.itemId));
  const notVisited = items
    .filter(i => !visited.has(i.id))
    .map(i => ({ itemId: i.id, title: i.title, scriptureRef: i.scriptureRef }));

  return { journey, notVisited };
}

/**
 * 匿名规则与实时视图完全一致（SEC-3 §9）：
 * isAnonymous 为真时不向任何人返回 userId——包括 moderator 与房主。
 * 数据库仍保留 user_id 用于鉴权与滥用治理。历史视图不是放宽这条的理由。
 */
function mapShare(
  r: ShareRecord, meUuid: string, intercessions: number, didIntercede: boolean,
) {
  return {
    id: r.id,
    userId: r.isAnonymous ? null : r.userId,
    isAnonymous: r.isAnonymous,
    isMine: r.userId === meUuid,
    text: r.text,
    createdAt: r.createdAt,
    intercessions,
    didIntercede,
  };
}

/** staging 未配置时明确报错，绝不静默回落到 SQLite。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

export function registerPrayerHistoryRoutes(app: Express): void {
  const guards = [requireAuth, requireRoomExists, requireRoomMember] as const;

  /**
   * GET /api/rooms/:roomId/prayer-sessions/history?limit=&before=
   *
   * 已结束的祷告会列表，按结束时间倒序。before 传上一页最后一条的 endedAt。
   * 每条只带列表页需要的最小信息——不带 items、不带 shares、不带任何人数。
   */
  app.get('/api/rooms/:roomId/prayer-sessions/history', ...guards,
    async (req: Request, res: Response) => {
      if (!guardConfigured(res)) return;
      const { roomId } = req.params;
      const q = req.query as { limit?: string; before?: string };
      const limit = Math.min(
        HISTORY_PAGE_MAX, Math.max(1, Number(q.limit) || HISTORY_PAGE_DEFAULT),
      );
      const before = Number(q.before);
      const cursor = Number.isFinite(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER;

      try {
        const rows = await endedSessions(roomId, cursor, limit + 1);
        const page = rows.slice(0, limit);

        // 带领者显示名一次批量解析，不在循环里逐条查。
        const people = await resolveProfiles(
          page.map(s => s.facilitatorUserId).filter((x): x is string => Boolean(x)),
        );

        const sessions = await Promise.all(page.map(async s => {
          const [events, items] = await Promise.all([listEvents(s.id), listItems(s.id)]);
          const { journey } = buildJourney(events, items);
          const f = s.facilitatorUserId ? people.get(s.facilitatorUserId) : undefined;
          return {
            id: s.id,
            title: s.title,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            durationMs: s.startedAt != null && s.endedAt != null
              ? s.endedAt - s.startedAt : null,
            // 实际进行过的项数。不是计划项数——两者可以不同，而后者会误导。
            visitedItemCount: new Set(journey.map(j => j.itemId)).size,
            facilitator: f ? { userId: f.id, name: f.name, avatar: f.avatar } : null,
          };
        }));

        res.json({
          sessions,
          // 有下一页时给出游标；没有就是 null，客户端据此停止加载
          nextBefore: rows.length > limit ? page[page.length - 1]!.endedAt : null,
          serverNow: now(),
        });
      } catch (e) {
        console.error('[prayer-history] list failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to read prayer session history.' });
      }
    });

  /**
   * GET /api/rooms/:roomId/prayer-sessions/:sessionId/summary
   *
   * 单场纪要。只对已结束的场次开放——进行中的场次请用 /prayer-session/current，
   * 那里才有 revision 与并发控制。
   */
  app.get('/api/rooms/:roomId/prayer-sessions/:sessionId/summary', ...guards,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      const { roomId, sessionId } = req.params;

      try {
        const s = await getSession(sessionId);
        // 跨房间取 session 一律当作不存在（IDOR）
        if (!s || s.roomId !== roomId) {
          return res.status(404).json({ error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
        }
        if (s.status !== 'ended') {
          return res.status(409).json({ error: 'Session has not ended.', code: 'SESSION_NOT_ENDED' });
        }

        const [events, items] = await Promise.all([listEvents(s.id), listItems(s.id)]);
        const { journey, notVisited } = buildJourney(events, items);
        const f = s.facilitatorUserId
          ? (await resolveProfiles([s.facilitatorUserId])).get(s.facilitatorUserId)
          : undefined;

        // 会中时间窗。start 之前 / end 之后的分享不属于这一场。
        let shares: ReturnType<typeof mapShare>[] = [];
        if (s.startedAt != null && s.endedAt != null) {
          const windowShares = await sharesInWindow(roomId, s.startedAt, s.endedAt);
          const inter = await intercessionsFor(windowShares.map(x => x.id), me);
          shares = windowShares.map(r => {
            const n = inter.get(r.id) ?? { count: 0, mine: false };
            return mapShare(r, me, n.count, n.mine);
          });
        }

        res.json({
          session: {
            id: s.id,
            title: s.title,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            durationMs: s.startedAt != null && s.endedAt != null
              ? s.endedAt - s.startedAt : null,
            facilitator: f ? { userId: f.id, name: f.name, avatar: f.avatar } : null,
          },
          journey,
          notVisited,
          shares,
          serverNow: now(),
        });
      } catch (e) {
        console.error('[prayer-history] summary failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to read prayer session summary.' });
      }
    });
}
