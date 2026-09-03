import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { requireRoomExists, requireRoomMember, requireRoomHost } from '../middleware/roomAuth.js';
import { prayerWriteLimiter, prayerHeartbeatLimiter } from '../middleware/rateLimit.js';
import { db } from '../db.js';

/**
 * 祷告室（Prayer Room）后端。
 *
 * 设计要点（见 docs/PRAYER_ROOM_REDESIGN.md）：
 *  - 祷告主题取代原先只存在 localStorage 的「祷告墙」，房主编辑后全房可见；
 *  - 祷告分享常含第三方敏感信息，因此**仅房内可见 / 支持匿名 / 发布者可自删**；
 *  - 「代祷」不是点赞：给「求主医治我母亲」点赞在语义上是错的，
 *    因此接口叫 intercede，返回的是「多少人正在为此祷告」；
 *  - 在线成员用心跳 + 超时判定，不需要 WebSocket（轮询档）。
 */

const PRESENCE_TTL_MS = 45_000;      // 超过 45 秒没心跳视为离线
const MAX_TEXT = 500;
const MAX_TOPICS = 12;
const SHARE_PAGE = 50;

const uid = () => crypto.randomBytes(9).toString('hex');
const now = () => Date.now();

// ---- 主题 ----
const stmtTopics = db.prepare<[string], { id: string; seq: number; text: string }>(
  'SELECT id, seq, text FROM room_prayer_topics WHERE room_id = ? ORDER BY seq ASC',
);
const stmtClearTopics = db.prepare<[string]>('DELETE FROM room_prayer_topics WHERE room_id = ?');
const stmtInsertTopic = db.prepare<[string, string, number, string, string, number]>(
  'INSERT INTO room_prayer_topics (id, room_id, seq, text, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
);
/** 显示名的可信来源：users 表。**绝不采用客户端传入的 name/avatar**（SEC-1 P2-1）。 */
const stmtUserProfile = db.prepare<[string], { name: string; avatar: string | null }>(
  'SELECT name, avatar FROM users WHERE id = ? LIMIT 1',
);

// ---- 分享 ----
interface ShareRow {
  id: string; user_id: string; text: string; is_anonymous: number; created_at: number;
}
const stmtShares = db.prepare<[string, number], ShareRow>(
  'SELECT id, user_id, text, is_anonymous, created_at FROM prayer_shares WHERE room_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?',
);
const stmtInsertShare = db.prepare<[string, string, string, string, number, number]>(
  'INSERT INTO prayer_shares (id, room_id, user_id, text, is_anonymous, created_at) VALUES (?, ?, ?, ?, ?, ?)',
);
const stmtGetShare = db.prepare<[string], { id: string; room_id: string; user_id: string }>(
  'SELECT id, room_id, user_id FROM prayer_shares WHERE id = ? AND deleted_at IS NULL LIMIT 1',
);
const stmtSoftDelete = db.prepare<[number, string]>('UPDATE prayer_shares SET deleted_at = ? WHERE id = ?');

// ---- 代祷 ----
const stmtIntercede = db.prepare<[string, string, number]>(
  'INSERT OR IGNORE INTO prayer_intercessions (share_id, user_id, created_at) VALUES (?, ?, ?)',
);
const stmtUnintercede = db.prepare<[string, string]>(
  'DELETE FROM prayer_intercessions WHERE share_id = ? AND user_id = ?',
);
const stmtCounts = db.prepare<[string], { share_id: string; n: number }>(`
  SELECT i.share_id AS share_id, COUNT(*) AS n
  FROM prayer_intercessions i
  JOIN prayer_shares s ON s.id = i.share_id
  WHERE s.room_id = ? GROUP BY i.share_id
`);
const stmtMine = db.prepare<[string, string], { share_id: string }>(`
  SELECT i.share_id AS share_id FROM prayer_intercessions i
  JOIN prayer_shares s ON s.id = i.share_id
  WHERE s.room_id = ? AND i.user_id = ?
`);

// ---- 在线 ----
const stmtHeartbeat = db.prepare<[string, string, string, string | null, string, number]>(`
  INSERT INTO room_presence (room_id, user_id, name, avatar, role, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(room_id, user_id) DO UPDATE SET
    name = excluded.name, avatar = excluded.avatar,
    role = excluded.role, last_seen_at = excluded.last_seen_at
`);
const stmtPresence = db.prepare<[string, number], {
  user_id: string; name: string; avatar: string | null; role: string; last_seen_at: number;
}>(
  'SELECT user_id, name, avatar, role, last_seen_at FROM room_presence WHERE room_id = ? AND last_seen_at > ? ORDER BY last_seen_at DESC',
);
const stmtLeave = db.prepare<[string, string]>('DELETE FROM room_presence WHERE room_id = ? AND user_id = ?');
const stmtSweep = db.prepare<[number]>('DELETE FROM room_presence WHERE last_seen_at < ?');

function userOf(req: Request) {
  const p = req.principal;
  return p && p.kind === 'user' ? p.user : null;
}

/** 房主判定统一走 roomAuth 中间件解析出的 req.room，避免两处实现漂移。 */
const isHostReq = (req: Request): boolean => Boolean(req.room?.isHost);

export function registerPrayerRoutes(app: Express): void {
  /**
   * GET /api/rooms/:roomId/prayer
   * 一次取回整个祷告室状态（主题 + 在线成员 + 分享 + 我的代祷）。
   * 客户端 10 秒轮询这一个接口即可，避免打 4 个请求。
   */
  app.get('/api/rooms/:roomId/prayer', requireAuth, requireRoomExists, requireRoomMember, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const { roomId } = req.params;
    const cutoff = now() - PRESENCE_TTL_MS;
    stmtSweep.run(cutoff - 60 * 60 * 1000);   // 顺手清理一小时前的死记录

    const counts = new Map(stmtCounts.all(roomId).map(r => [r.share_id, r.n]));
    const mine = new Set(stmtMine.all(roomId, me.id).map(r => r.share_id));
    const shares = stmtShares.all(roomId, SHARE_PAGE).map(s => ({
      id: s.id,
      // 匿名分享不向任何人暴露 user_id；发布者本人靠 isMine 判断删除权
      userId: s.is_anonymous ? null : s.user_id,
      isAnonymous: Boolean(s.is_anonymous),
      isMine: s.user_id === me.id,
      text: s.text,
      createdAt: s.created_at,
      intercessions: counts.get(s.id) ?? 0,
      didIntercede: mine.has(s.id),
    }));

    res.json({
      topics: stmtTopics.all(roomId),
      presence: stmtPresence.all(roomId, cutoff).map(p => ({
        userId: p.user_id, name: p.name, avatar: p.avatar, role: p.role,
      })),
      shares,
      isHost: isHostReq(req),
      serverTime: now(),
    });
  });

  /**
   * PUT /api/rooms/:roomId/prayer/topics
   * 房主整体替换本次祷告主题。Body: { topics: string[] }
   */
  app.put('/api/rooms/:roomId/prayer/topics', requireAuth, requireRoomExists, requireRoomMember, requireRoomHost, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const { roomId } = req.params;
    const raw = (req.body ?? {}).topics;
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'topics must be an array.' });
    const topics = raw
      .map((t: unknown) => String(t ?? '').trim())
      .filter(t => t.length > 0)
      .slice(0, MAX_TOPICS)
      .map(t => t.slice(0, MAX_TEXT));

    const t = now();
    db.transaction(() => {
      stmtClearTopics.run(roomId);
      topics.forEach((text, i) => stmtInsertTopic.run(uid(), roomId, i + 1, text, me.id, t));
    })();
    res.json({ ok: true, topics: stmtTopics.all(roomId) });
  });

  /**
   * POST /api/rooms/:roomId/prayer/shares
   * Body: { text, isAnonymous? }
   */
  app.post('/api/rooms/:roomId/prayer/shares', requireAuth, requireRoomExists, requireRoomMember, prayerWriteLimiter, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const { roomId } = req.params;
    const body = (req.body ?? {}) as { text?: string; isAnonymous?: boolean };
    const text = String(body.text ?? '').trim().slice(0, MAX_TEXT);
    if (!text) return res.status(400).json({ error: 'text is required.' });
    const id = uid();
    stmtInsertShare.run(id, roomId, me.id, text, body.isAnonymous ? 1 : 0, now());
    res.json({ ok: true, id });
  });

  /**
   * DELETE /api/rooms/:roomId/prayer/shares/:shareId
   * 只有发布者本人或房主可以删（软删除，内容不再返回）。
   */
  app.delete('/api/rooms/:roomId/prayer/shares/:shareId', requireAuth, requireRoomExists, requireRoomMember, prayerWriteLimiter, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const { roomId, shareId } = req.params;
    const row = stmtGetShare.get(shareId);
    if (!row || row.room_id !== roomId) return res.status(404).json({ error: 'Share not found.' });
    if (row.user_id !== me.id && !isHostReq(req)) {
      return res.status(403).json({ error: 'Only the author or host can delete.' });
    }
    stmtSoftDelete.run(now(), shareId);
    res.json({ ok: true });
  });

  /**
   * POST   /api/rooms/:roomId/prayer/shares/:shareId/intercede   登记「我为你祷告」
   * DELETE 同路径                                                取消登记
   * 这不是点赞：返回的是正在为此代祷的人数。
   */
  const setIntercede = (add: boolean) => (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const { roomId, shareId } = req.params;
    const row = stmtGetShare.get(shareId);
    if (!row || row.room_id !== roomId) return res.status(404).json({ error: 'Share not found.' });
    if (add) stmtIntercede.run(shareId, me.id, now());
    else stmtUnintercede.run(shareId, me.id);
    const n = stmtCounts.all(roomId).find(c => c.share_id === shareId)?.n ?? 0;
    res.json({ ok: true, intercessions: n, didIntercede: add });
  };
  app.post('/api/rooms/:roomId/prayer/shares/:shareId/intercede',
    requireAuth, requireRoomExists, requireRoomMember, prayerWriteLimiter, setIntercede(true));
  app.delete('/api/rooms/:roomId/prayer/shares/:shareId/intercede',
    requireAuth, requireRoomExists, requireRoomMember, prayerWriteLimiter, setIntercede(false));

  /**
   * POST   /api/rooms/:roomId/prayer/heartbeat   Body: { name, avatar?, role? }
   * DELETE /api/rooms/:roomId/prayer/presence    离开房间
   */
  app.post('/api/rooms/:roomId/prayer/heartbeat', requireAuth, requireRoomExists, requireRoomMember, prayerHeartbeatLimiter, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const { roomId } = req.params;
    // SEC-2 §7：显示名与头像**只从服务器读取**，不再信任 body 里的
    // name / displayName / avatar / role —— 否则 C 可以把自己显示成「王牧师」。
    const profile = stmtUserProfile.get(me.id);
    const name = (profile?.name ?? me.id).slice(0, 40);
    const role = isHostReq(req) ? 'host' : 'listener';
    stmtHeartbeat.run(roomId, me.id, name, profile?.avatar ?? null, role, now());
    res.json({ ok: true });
  });

  app.delete('/api/rooms/:roomId/prayer/presence', requireAuth, requireRoomExists, requireRoomMember, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    stmtLeave.run(req.params.roomId, me.id);
    res.json({ ok: true });
  });
}
