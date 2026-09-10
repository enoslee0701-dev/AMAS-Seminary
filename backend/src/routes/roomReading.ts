import type { Express, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  requireRoomExists, requireRoomMember, requireRoomManager, activeUserUuid,
} from '../middleware/roomAuth.js';
import { sessionCommandLimiter } from '../middleware/rateLimit.js';
import { validateLocation, canonStatus } from '../rooms/bibleCanon.js';
import { stagingConfigured } from '../staging/pgData.js';
import { resolveProfiles } from '../staging/profileStore.js';
import {
  getReadingState, insertReadingState, updateReadingState, type ReadingState,
} from '../staging/readingStore.js';

/**
 * 房间共享阅读位置（P1-2）。
 *
 * ## 与 Presence 是两个 domain
 *
 * 这些字段**绝不进 presence 响应**。Presence 只回答「谁在线」，
 * 共享阅读位置回答「房间正在读哪里」。混在一起会让两个生命周期、
 * 两套权限、两种更新频率纠缠在一个接口里。
 *
 * ## 只存位置，不存正文
 *
 * 数据库里只有 book / chapter / verse。经文正文由各客户端用自己的阅读器
 * 加载（public/scripture/cuv.json）。后端不持有第二份经文副本——
 * 那会带来内容漂移、数据重复、版权处理复杂化与多译本状态混乱。
 *
 * ## 权限
 *
 *   GET  requireAuth → requireRoomExists → requireRoomMember
 *   PUT  以上 + requireRoomManager（真人 host 或本房 moderator）
 *
 * 复用 P1-1 / SEC-2 已有的房间授权体系，**不新造 bibleAdmin /
 * readingLeader 之类的第二套角色**。身份一律来自 JWT，
 * 请求体里的 userId / role / name 一概不读。
 *
 * ## 并发
 *
 * 沿用祷告会那套乐观并发：PUT 带 expectedRevision，条件更新，
 * 影响 0 行即 409。两个 moderator 同时发布，只会有一个成功。
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * SQLite `room_reading_state` → Postgres `public.app_room_reading_state`。
 * `updated_by` 换成 **Supabase UUID**（D-42），显示名因此改由
 * `profiles` 解析（原先是 SQLite `users`，值域已不同）。
 * 条件更新的等价搬迁见 `staging/readingStore.ts`。
 */

const now = () => Date.now();

/** 只有 bible_reading 提供共享阅读位置。其它房间一律 404，不静默映射。 */
const READING_ROOMS = new Set(['bible_reading']);

/**
 * `canPublish` 一并放在这里，而不是塞进 presence——
 * 「谁能发布房间阅读位置」属于本 domain 的能力声明，
 * 与「谁在线」是两件事。值由服务端 requireRoomManager 的同一判定得出，
 * 客户端声明的 role 一概不采信。
 */
async function view(
  row: ReadingState | undefined, canPublish: boolean,
): Promise<unknown> {
  if (!row) {
    // 没有行是**合法状态**：这个房间还没有人设定共同阅读位置。
    // 返回 null，绝不伪造成创世记 1:1。
    return { position: null, capabilities: { canPublish }, serverTime: now() };
  }
  // 显示名从 profiles 解析。取不到就给 null —— 与切换前
  // 「`users` 里查不到这个 id 就 updatedByName: null」语义一致。
  let updatedByName: string | null = null;
  if (row.updatedBy) {
    try {
      updatedByName = (await resolveProfiles([row.updatedBy])).get(row.updatedBy)?.name ?? null;
    } catch (e) {
      // 显示名取不到不该让整个读取失败。
      console.error('[reading-position] name lookup failed:', (e as Error).message);
    }
  }
  return {
    position: {
      book: row.book,
      chapter: row.chapter,
      verse: row.verse,
      revision: row.revision,
      updatedAt: row.updatedAt,
      // 只给显示名，不给 updated_by 的原始 id
      updatedByName,
    },
    capabilities: { canPublish },
    serverTime: now(),
  };
}

export function registerRoomReadingRoutes(app: Express): void {
  /**
   * 房间是否支持共享阅读位置。
   *
   * 位置很讲究：放在 requireRoomMember **之后**（不让外人拿它探测房间存在性），
   * 但放在 requireRoomManager **之前**——否则读经室以外的房间会先因为
   * 「你不是这个房间的 manager」返回 403，把「这个房间根本没有共享阅读功能」
   * 这个真正的原因盖掉。成员在错误的房间上应该得到 404。
   */
  const requireReadingRoom = (req: Request, res: Response, next: NextFunction): void => {
    if (READING_ROOMS.has(req.params.roomId)) { next(); return; }
    res.status(404).json({
      error: 'This room does not have a shared reading position.',
      code: 'READING_NOT_SUPPORTED',
    });
  };

  const readGuards = [
    requireAuth, requireRoomExists, requireRoomMember, requireReadingRoom,
  ] as const;
  const writeGuards = [
    requireAuth, requireRoomExists, requireRoomMember, requireReadingRoom,
    requireRoomManager, sessionCommandLimiter,
  ] as const;

  /**
   * GET /api/rooms/:roomId/reading-position
   *
   * 没有共享位置时 `position: null`。
   * 数据库读取失败时返回 500 真实错误 —— **不得伪装成「没有共享位置」**，
   * 那会让客户端把故障当成正常空状态。
   */
  app.get('/api/rooms/:roomId/reading-position', ...readGuards,
    async (req: Request, res: Response) => {
      try {
        const row = await getReadingState(req.params.roomId);
        res.json(await view(row, Boolean(req.room?.isManager)));
      } catch (e) {
        res.status(500).json({
          error: 'Failed to read shared reading position.',
          code: 'READING_STATE_UNAVAILABLE',
        });
        console.error('[reading-position] GET failed', (e as Error).message);
      }
    });

  /**
   * PUT /api/rooms/:roomId/reading-position
   * Body: { book, chapter, verse?, expectedRevision? }
   *
   * 只有 moderator / host 能写。这是一个**显式发布**动作——
   * 客户端不会因为主持人自己翻页就调用它。
   */
  app.put('/api/rooms/:roomId/reading-position', ...writeGuards,
    async (req: Request, res: Response) => {
      const uid = activeUserUuid(req);
      if (!uid) return res.status(401).json({ error: 'User token required.' });
      if (!stagingConfigured()) {
        return res.status(503).json({ error: 'Staging database not configured.' });
      }

      const body = (req.body ?? {}) as {
        book?: unknown; chapter?: unknown; verse?: unknown; expectedRevision?: unknown;
      };

      // 严格校验，复用阅读器同一份数据集（rooms/bibleCanon.ts）
      const v = validateLocation(body.book, body.chapter, body.verse);
      if (!v.ok || !v.value) {
        const status = v.code === 'SCRIPTURE_DATA_UNAVAILABLE' ? 503 : 400;
        return res.status(status).json({ error: 'Invalid scripture location.', code: v.code });
      }
      const { book, chapter, verse } = v.value;
      const roomId = req.params.roomId;

      try {
        const current = await getReadingState(roomId);

        if (!current) {
          const created = await insertReadingState({
            roomId, book, chapter, verse, updatedByUuid: uid,
          });
          return res.json(await view(created, Boolean(req.room?.isManager)));
        }

        // 未提供 expectedRevision 时按当前值处理（首次接入的客户端不至于永远 409），
        // 但只要提供了就必须匹配 —— 这是两个 moderator 同时发布时的唯一保护。
        const expected = body.expectedRevision === undefined
          ? current.revision
          : Number(body.expectedRevision);

        const updated = await updateReadingState({
          roomId, book, chapter, verse, updatedByUuid: uid, expectedRevision: expected,
        });
        if (!updated) {
          // 有人抢先改了。把最新状态一并返回，客户端据此刷新后重试。
          const fresh = await getReadingState(roomId);
          return res.status(409).json({
            error: 'Reading position changed.',
            code: 'READING_STATE_CONFLICT',
            ...(await view(fresh, Boolean(req.room?.isManager)) as object),
          });
        }
        res.json(await view(updated, Boolean(req.room?.isManager)));
      } catch (e) {
        // 写失败必须让客户端知道失败。UI 不得显示「已同步」。
        res.status(500).json({
          error: 'Failed to save shared reading position.',
          code: 'READING_STATE_WRITE_FAILED',
        });
        console.error('[reading-position] PUT failed', (e as Error).message);
      }
    });
}

/** 启动日志：经文数据集缺失时写不进任何位置，必须说清楚。 */
export function reportScriptureCanon(log = console.log, warn = console.warn): void {
  const s = canonStatus();
  if (s.available) {
    log(`[amas-backend] scripture canon loaded — ${s.bookCount} books (shared reading validation ready)`);
  } else {
    warn('[amas-backend] SCRIPTURE_DATA_UNAVAILABLE — shared reading position writes will be rejected (503).');
    warn(`[amas-backend]   ${s.detail ?? ''}`);
    warn('[amas-backend]   set SCRIPTURE_DATA_PATH to public/scripture/cuv.json if it lives elsewhere.');
  }
}
