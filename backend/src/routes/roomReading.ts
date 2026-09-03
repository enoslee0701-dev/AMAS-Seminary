import type { Express, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRoomExists, requireRoomMember, requireRoomManager } from '../middleware/roomAuth.js';
import { sessionCommandLimiter } from '../middleware/rateLimit.js';
import { db } from '../db.js';
import { validateLocation, canonStatus } from '../rooms/bibleCanon.js';

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
 * 沿用祷告会那套乐观并发：PUT 带 expectedRevision，
 * `UPDATE ... WHERE revision = ?` 条件更新，changes===0 即 409。
 * 两个 moderator 同时发布，只会有一个成功，另一个拿到 409 与最新状态。
 */

const now = () => Date.now();

interface ReadingRow {
  room_id: string;
  book: string;
  chapter: number;
  verse: number | null;
  revision: number;
  updated_by: string;
  updated_at: number;
}

const stmtGet = db.prepare<[string], ReadingRow>(
  'SELECT * FROM room_reading_state WHERE room_id = ?',
);
const stmtInsert = db.prepare<[string, string, number, number | null, string, number]>(
  `INSERT INTO room_reading_state (room_id, book, chapter, verse, revision, updated_by, updated_at)
   VALUES (?, ?, ?, ?, 1, ?, ?)`,
);
/** 条件更新：revision 不匹配就一行都不动。 */
const stmtUpdate = db.prepare<[string, number, number | null, string, number, string, number]>(
  `UPDATE room_reading_state
      SET book = ?, chapter = ?, verse = ?, updated_by = ?, updated_at = ?,
          revision = revision + 1
    WHERE room_id = ? AND revision = ?`,
);
const stmtUser = db.prepare<[string], { name: string }>('SELECT name FROM users WHERE id = ?');

/** 只有 bible_reading 提供共享阅读位置。其它房间一律 404，不静默映射。 */
const READING_ROOMS = new Set(['bible_reading']);

/**
 * `canPublish` 一并放在这里，而不是塞进 presence——
 * 「谁能发布房间阅读位置」属于本 domain 的能力声明，
 * 与「谁在线」是两件事。值由服务端 requireRoomManager 的同一判定得出，
 * 客户端声明的 role 一概不采信。
 */
function view(row: ReadingRow | undefined, canPublish: boolean) {
  if (!row) {
    // 没有行是**合法状态**：这个房间还没有人设定共同阅读位置。
    // 返回 null，绝不伪造成创世记 1:1。
    return { position: null, capabilities: { canPublish }, serverTime: now() };
  }
  const who = stmtUser.get(row.updated_by);
  return {
    position: {
      book: row.book,
      chapter: row.chapter,
      verse: row.verse,
      revision: row.revision,
      updatedAt: row.updated_at,
      // 只给显示名，不给 updated_by 的原始 id
      updatedByName: who?.name ?? null,
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
  app.get('/api/rooms/:roomId/reading-position', ...readGuards, (req: Request, res: Response) => {
    try {
      res.json(view(stmtGet.get(req.params.roomId), Boolean(req.room?.isManager)));
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
  app.put('/api/rooms/:roomId/reading-position', ...writeGuards, (req: Request, res: Response) => {
    const p = req.principal;
    const me = p && p.kind === 'user' ? p.user : null;
    if (!me) return res.status(401).json({ error: 'User token required.' });

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

    try {
      const current = stmtGet.get(req.params.roomId);
      const t = now();

      if (!current) {
        stmtInsert.run(req.params.roomId, book, chapter, verse, me.id, t);
        return res.json(view(stmtGet.get(req.params.roomId), Boolean(req.room?.isManager)));
      }

      // 未提供 expectedRevision 时按当前值处理（首次接入的客户端不至于永远 409），
      // 但只要提供了就必须匹配 —— 这是两个 moderator 同时发布时的唯一保护。
      const expected = body.expectedRevision === undefined
        ? current.revision
        : Number(body.expectedRevision);

      const r = stmtUpdate.run(book, chapter, verse, me.id, t, req.params.roomId, expected);
      if (r.changes === 0) {
        // 有人抢先改了。把最新状态一并返回，客户端据此刷新后重试。
        return res.status(409).json({
          error: 'Reading position changed.',
          code: 'READING_STATE_CONFLICT',
          ...view(stmtGet.get(req.params.roomId), Boolean(req.room?.isManager)),
        });
      }
      res.json(view(stmtGet.get(req.params.roomId), Boolean(req.room?.isManager)));
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
