import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { requireRoomExists, requireRoomMember, requireRoomManager, isMember } from '../middleware/roomAuth.js';
import { sessionCommandLimiter } from '../middleware/rateLimit.js';
import { db } from '../db.js';
import { emitRoomEvent } from '../realtime/roomEvents.js';

/**
 * 共享祷告会（Phase 2）。
 *
 * **服务器是唯一真相源。** 当前祷告事项、开始时间、带领者、是否结束
 * 全部只存在 prayer_sessions；客户端的 useState / localStorage
 * 一律不得决定这些值。三台设备轮询到的必须完全一致。
 *
 * 并发模型：每个 manager 命令必须带 expectedRevision，
 * UPDATE 用 `WHERE revision = ?` 做条件更新，changes===0 即冲突（409）。
 * 因此 Host 与 Moderator 同时点「下一项」只会推进一格。
 *
 * 状态机：scheduled → active → ended。没有通用的 status PATCH，
 * 只有明确命令：start / advance / select-item / facilitator / end。
 * ended 是终态，任何控制命令都返回 409 SESSION_ENDED。
 */

const uid = () => crypto.randomBytes(9).toString('hex');
const now = () => Date.now();
// Phase 2.5 §6 数量与长度限制（前后端都验证）
const MIN_ITEMS = 1;
const MAX_ITEMS = 12;
const MAX_TITLE = 120;
const MAX_DESC = 500;
const MAX_SREF = 80;
const MAX_STEXT = 500;
const MAX_SESSION_TITLE = 120;

interface SessionRow {
  id: string; room_id: string; title: string | null; status: 'scheduled' | 'active' | 'ended';
  created_by: string; facilitator_user_id: string | null;
  started_at: number | null; ended_at: number | null;
  current_item_id: string | null; revision: number;
  created_at: number; updated_at: number;
}
interface ItemRow {
  id: string; session_id: string; position: number; title: string;
  description: string | null; scripture_ref: string | null; scripture_text: string | null;
}

const stmtCurrent = db.prepare<[string], SessionRow>(
  `SELECT * FROM prayer_sessions WHERE room_id = ? AND status IN ('active','scheduled')
   ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
);
const stmtById = db.prepare<[string], SessionRow>('SELECT * FROM prayer_sessions WHERE id = ? LIMIT 1');
const stmtItems = db.prepare<[string], ItemRow>(
  'SELECT * FROM prayer_session_items WHERE session_id = ? ORDER BY position ASC',
);
const stmtInsertSession = db.prepare<[string, string, string | null, string, number, number]>(
  `INSERT INTO prayer_sessions (id, room_id, title, status, created_by, revision, created_at, updated_at)
   VALUES (?, ?, ?, 'scheduled', ?, 1, ?, ?)`,
);
/** 仅 scheduled 可结构性编辑；active 之后冻结（§8）。条件更新自带并发保护。 */
const stmtUpdateScheduled = db.prepare<[string | null, number, string, number]>(
  `UPDATE prayer_sessions SET title = ?, revision = revision + 1, updated_at = ?
   WHERE id = ? AND status = 'scheduled' AND revision = ?`,
);
const stmtClearItems = db.prepare<[string]>('DELETE FROM prayer_session_items WHERE session_id = ?');
const stmtInsertItem = db.prepare<[string, string, number, string, string | null, string | null, string | null, number]>(
  `INSERT INTO prayer_session_items (id, session_id, position, title, description, scripture_ref, scripture_text, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
const stmtUser = db.prepare<[string], { id: string; name: string; avatar: string | null }>(
  'SELECT id, name, avatar FROM users WHERE id = ? LIMIT 1',
);
const stmtEvent = db.prepare<[string, string, string, string, string | null, string | null, number]>(
  `INSERT INTO prayer_session_events (id, session_id, actor_user_id, event_type, from_item_id, to_item_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

/** 条件更新：只有 revision 匹配且状态为 active 时才生效。返回 false = 冲突。 */
const stmtStart = db.prepare<[number, string | null, number, string, number]>(
  `UPDATE prayer_sessions SET status = 'active', started_at = ?, current_item_id = ?,
     revision = revision + 1, updated_at = ?
   WHERE id = ? AND status = 'scheduled' AND revision = ?`,
);
const stmtSetItem = db.prepare<[string, number, string, number]>(
  `UPDATE prayer_sessions SET current_item_id = ?, revision = revision + 1, updated_at = ?
   WHERE id = ? AND status = 'active' AND revision = ?`,
);
const stmtSetFacilitator = db.prepare<[string | null, number, string, number]>(
  `UPDATE prayer_sessions SET facilitator_user_id = ?, revision = revision + 1, updated_at = ?
   WHERE id = ? AND status IN ('scheduled','active') AND revision = ?`,
);
const stmtEnd = db.prepare<[number, number, string, number]>(
  `UPDATE prayer_sessions SET status = 'ended', ended_at = ?, revision = revision + 1, updated_at = ?
   WHERE id = ? AND status IN ('scheduled','active') AND revision = ?`,
);

/**
 * 校验并标准化 items（§6/§7）。
 * - 数量必须在 MIN_ITEMS..MAX_ITEMS，否则返回 null（400）
 * - **position 一律由服务器按数组顺序重新标准化为 1..n**，
 *   客户端传来的 position 一概忽略，杜绝 1/4/8/12 这类残留
 */
function normalizeItems(raw: unknown): { title: string; description: string | null; scriptureRef: string | null; scriptureText: string | null }[] | null {
  if (!Array.isArray(raw)) return null;
  const items = raw
    .map((it: Record<string, unknown>) => ({
      title: String(it?.title ?? '').trim().slice(0, MAX_TITLE),
      description: it?.description ? String(it.description).trim().slice(0, MAX_DESC) || null : null,
      scriptureRef: it?.scriptureRef ? String(it.scriptureRef).trim().slice(0, MAX_SREF) || null : null,
      scriptureText: it?.scriptureText ? String(it.scriptureText).trim().slice(0, MAX_STEXT) || null : null,
    }))
    .filter(it => it.title.length > 0);
  if (items.length < MIN_ITEMS || items.length > MAX_ITEMS) return null;
  return items;
}

const normTitle = (raw: unknown): string | null =>
  raw ? (String(raw).trim().slice(0, MAX_SESSION_TITLE) || null) : null;

const userOf = (req: Request) => {
  const p = req.principal;
  return p && p.kind === 'user' ? p.user : null;
};

/** 统一的 session 视图。facilitator 的 name/avatar **只从 users 表取**。 */
function view(s: SessionRow, canManage: boolean) {
  const f = s.facilitator_user_id ? stmtUser.get(s.facilitator_user_id) : undefined;
  return {
    session: {
      id: s.id,
      title: s.title,
      status: s.status,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      revision: s.revision,
      facilitator: f ? { userId: f.id, name: f.name, avatar: f.avatar } : null,
      currentItemId: s.current_item_id,
      items: stmtItems.all(s.id).map(i => ({
        id: i.id, position: i.position, title: i.title,
        description: i.description, scriptureRef: i.scripture_ref, scriptureText: i.scripture_text,
      })),
    },
    capabilities: { canManageSession: canManage },
    // §1 客户端用它算 offset，消除设备时钟偏差；数据库 started_at 不变
    serverNow: now(),
  };
}

/**
 * 取出 session 并校验它确实属于当前房间（防跨 room session IDOR）。
 * 同时校验 expectedRevision 是否提供。
 */
function loadForCommand(req: Request, res: Response): SessionRow | null {
  const s = stmtById.get(req.params.sessionId);
  if (!s || s.room_id !== req.params.roomId) {
    res.status(404).json({ error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
    return null;
  }
  if (s.status === 'ended') {
    res.status(409).json({ error: 'Session already ended.', code: 'SESSION_ENDED' });
    return null;
  }
  return s;
}

const conflict = (res: Response, s: SessionRow, canManage: boolean) =>
  res.status(409).json({ error: 'Session state changed.', code: 'SESSION_STATE_CONFLICT', ...view(stmtById.get(s.id)!, canManage) });

export function registerPrayerSessionRoutes(app: Express): void {
  const guards = [requireAuth, requireRoomExists, requireRoomMember] as const;
  const managerGuards = [requireAuth, requireRoomExists, requireRoomMember, requireRoomManager, sessionCommandLimiter] as const;

  /**
   * GET /api/rooms/:roomId/prayer-session/current
   * 没有 active/scheduled session 时返回 session: null——**不造假默认 session**。
   */
  app.get('/api/rooms/:roomId/prayer-session/current', ...guards, (req: Request, res: Response) => {
    const canManage = Boolean(req.room?.isManager);
    const s = stmtCurrent.get(req.params.roomId);
    // 即使没有 session 也要给 serverNow——客户端需要它算时钟 offset
    if (!s) return res.json({ session: null, capabilities: { canManageSession: canManage }, serverNow: now() });
    res.json(view(s, canManage));
  });

  /**
   * POST /api/rooms/:roomId/prayer-sessions   创建（status=scheduled）
   * Body: { items: [{ title, description?, scriptureRef?, scriptureText? }] }
   * created_by 一律取自 JWT；客户端传 created_by / revision 等一律忽略。
   */
  app.post('/api/rooms/:roomId/prayer-sessions', ...managerGuards, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const { roomId } = req.params;
    const items = normalizeItems((req.body ?? {}).items);
    if (!items) return res.status(400).json({ error: `items must contain ${MIN_ITEMS}-${MAX_ITEMS} entries with a title.`, code: 'INVALID_ITEMS' });
    const title = normTitle((req.body ?? {}).title);

    const sid = uid();
    const t = now();
    db.transaction(() => {
      stmtInsertSession.run(sid, roomId, title, me.id, t, t);
      // position 由服务器重新标准化为 1..n，绝不采用客户端传来的 position
      items.forEach((it, i) =>
        stmtInsertItem.run(uid(), sid, i + 1, it.title, it.description, it.scriptureRef, it.scriptureText, t));
      stmtEvent.run(uid(), sid, me.id, 'created', null, null, t);
    })();
    // §6 事务提交成功之后才发事件——绝不会出现「已通知客户端、数据库随后回滚」
     emitRoomEvent(roomId, 'session.changed', sid, 1);
    res.status(201).json(view(stmtById.get(sid)!, true));
  });

  /**
   * POST /.../:sessionId/start
   * 事务内确认 status=scheduled 且 revision 匹配；
   * 同房间已有 active session 时由 partial unique index 拦下（409）。
   * 已经 active 的 session 不会重置 started_at。
   */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/start', ...managerGuards, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const s = loadForCommand(req, res);
    if (!s) return;
    if (s.status === 'active') return res.status(409).json({ error: 'Session already active.', code: 'SESSION_ALREADY_ACTIVE', ...view(s, true) });
    const expected = Number((req.body ?? {}).expectedRevision ?? s.revision);
    const first = stmtItems.all(s.id)[0];
    const t = now();
    try {
      const r = stmtStart.run(t, first?.id ?? null, t, s.id, expected);
      if (r.changes === 0) return conflict(res, s, true);
      stmtEvent.run(uid(), s.id, me.id, 'started', null, first?.id ?? null, t);
    } catch {
      // partial unique index 命中：本房已有另一个 active session
      return res.status(409).json({ error: 'Another session is already active in this room.', code: 'ROOM_HAS_ACTIVE_SESSION' });
    }
    const fresh = stmtById.get(s.id)!;
    emitRoomEvent(s.room_id, 'session.changed', s.id, fresh.revision);
    res.json(view(fresh, true));
  });

  /**
   * POST /.../:sessionId/advance
   * 最后一项时**不自动结束**，返回 409 LAST_ITEM，由 UI 显示「结束祷告会」。
   */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/advance', ...managerGuards, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const s = loadForCommand(req, res);
    if (!s) return;
    if (s.status !== 'active') return res.status(409).json({ error: 'Session is not active.', code: 'SESSION_NOT_ACTIVE' });
    const expected = Number((req.body ?? {}).expectedRevision ?? -1);
    const items = stmtItems.all(s.id);
    const idx = items.findIndex(i => i.id === s.current_item_id);
    const next = items[idx + 1];
    if (!next) return res.status(409).json({ error: 'Already at the last item.', code: 'LAST_ITEM', ...view(s, true) });
    const t = now();
    const r = stmtSetItem.run(next.id, t, s.id, expected);
    if (r.changes === 0) return conflict(res, s, true);
    stmtEvent.run(uid(), s.id, me.id, 'item_changed', s.current_item_id, next.id, t);
    const fresh = stmtById.get(s.id)!;
    emitRoomEvent(s.room_id, 'session.changed', s.id, fresh.revision);
    res.json(view(fresh, true));
  });

  /** POST /.../:sessionId/select-item   Body: { itemId, expectedRevision } */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/select-item', ...managerGuards, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const s = loadForCommand(req, res);
    if (!s) return;
    if (s.status !== 'active') return res.status(409).json({ error: 'Session is not active.', code: 'SESSION_NOT_ACTIVE' });
    const { itemId, expectedRevision } = (req.body ?? {}) as { itemId?: string; expectedRevision?: number };
    // 防跨 session item 注入：item 必须属于**本 session**
    const item = stmtItems.all(s.id).find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found in this session.', code: 'ITEM_NOT_FOUND' });
    const t = now();
    const r = stmtSetItem.run(item.id, t, s.id, Number(expectedRevision ?? -1));
    if (r.changes === 0) return conflict(res, s, true);
    stmtEvent.run(uid(), s.id, me.id, 'item_changed', s.current_item_id, item.id, t);
    const fresh = stmtById.get(s.id)!;
    emitRoomEvent(s.room_id, 'session.changed', s.id, fresh.revision);
    res.json(view(fresh, true));
  });

  /**
   * POST /.../:sessionId/facilitator   Body: { userId, expectedRevision }
   * userId 必须是本房成员。name/avatar 由服务器从 users 表返回，
   * **不接受客户端传入的 facilitatorName**。
   * facilitator 只是展示角色，不获得任何控制权（Phase 2 §14）。
   */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/facilitator', ...managerGuards, async (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const s = loadForCommand(req, res);
    if (!s) return;
    const { userId, expectedRevision } = (req.body ?? {}) as { userId?: string | null; expectedRevision?: number };
    const target = userId ? String(userId) : null;
    if (target) {
      const isHostUser = req.room?.hostId === target;
      // isMember 在 DB-12 后是异步的（Postgres）。漏掉 await 会让 Promise
      // 恒为真值，取反恒 false —— 守卫静默失效。必须 await。
      if (!(await isMember(req.params.roomId, target)) && !isHostUser) {
        return res.status(400).json({ error: 'Facilitator must be a room member.', code: 'NOT_A_MEMBER' });
      }
    }
    const t = now();
    const r = stmtSetFacilitator.run(target, t, s.id, Number(expectedRevision ?? -1));
    if (r.changes === 0) return conflict(res, s, true);
    stmtEvent.run(uid(), s.id, me.id, 'facilitator_changed', null, null, t);
    const fresh = stmtById.get(s.id)!;
    emitRoomEvent(s.room_id, 'session.changed', s.id, fresh.revision);
    res.json(view(fresh, true));
  });

  /**
   * PUT /api/rooms/:roomId/prayer-sessions/:sessionId
   * 编辑 **scheduled** 祷告会：标题、事项内容、顺序、增删。
   * Body: { title?, items: [...], expectedRevision }
   *
   * §8 结构冻结：session 一旦 active 就**禁止**任何结构编辑
   * （新增/删除/改名/重排/改经文），避免不同设备看到结构突然变化。
   * 这里的 UPDATE 带 `status='scheduled'`，active 时 changes===0 → 409。
   *
   * §27 整体替换而非 partial merge：避免「标题来自 A、排序来自 B」的半截版本。
   */
  app.put('/api/rooms/:roomId/prayer-sessions/:sessionId', ...managerGuards, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const s = loadForCommand(req, res);
    if (!s) return;
    if (s.status !== 'scheduled') {
      return res.status(409).json({
        error: 'Structure is frozen once the session starts.',
        code: 'SESSION_STRUCTURE_FROZEN', ...view(s, true),
      });
    }
    const items = normalizeItems((req.body ?? {}).items);
    if (!items) return res.status(400).json({ error: `items must contain ${MIN_ITEMS}-${MAX_ITEMS} entries with a title.`, code: 'INVALID_ITEMS' });
    const expected = Number((req.body ?? {}).expectedRevision ?? -1);
    const t = now();
    let ok = false;
    db.transaction(() => {
      const r = stmtUpdateScheduled.run(normTitle((req.body ?? {}).title), t, s.id, expected);
      if (r.changes === 0) return;                 // 冲突：事务内不做任何写入
      stmtClearItems.run(s.id);
      items.forEach((it, i) =>
        stmtInsertItem.run(uid(), s.id, i + 1, it.title, it.description, it.scriptureRef, it.scriptureText, t));
      ok = true;
    })();
    if (!ok) return conflict(res, s, true);
    const fresh = stmtById.get(s.id)!;
    emitRoomEvent(s.room_id, 'session.changed', s.id, fresh.revision);
    res.json(view(fresh, true));
  });

  /**
   * POST /.../:sessionId/previous
   * 与 advance 完全对称：server command + expectedRevision + 冲突保护。
   * 已经是第一项时返回 409 FIRST_ITEM，**不循环到最后一项**。
   */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/previous', ...managerGuards, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const s = loadForCommand(req, res);
    if (!s) return;
    if (s.status !== 'active') return res.status(409).json({ error: 'Session is not active.', code: 'SESSION_NOT_ACTIVE' });
    const expected = Number((req.body ?? {}).expectedRevision ?? -1);
    const items = stmtItems.all(s.id);
    const idx = items.findIndex(i => i.id === s.current_item_id);
    const prev = idx > 0 ? items[idx - 1] : null;
    if (!prev) return res.status(409).json({ error: 'Already at the first item.', code: 'FIRST_ITEM', ...view(s, true) });
    const t = now();
    const r = stmtSetItem.run(prev.id, t, s.id, expected);
    if (r.changes === 0) return conflict(res, s, true);
    stmtEvent.run(uid(), s.id, me.id, 'item_changed', s.current_item_id, prev.id, t);
    const fresh = stmtById.get(s.id)!;
    emitRoomEvent(s.room_id, 'session.changed', s.id, fresh.revision);
    res.json(view(fresh, true));
  });

  /** POST /.../:sessionId/end   保留 current_item_id 供历史记录，不清空。 */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/end', ...managerGuards, (req: Request, res: Response) => {
    const me = userOf(req);
    if (!me) return res.status(401).json({ error: 'User token required.' });
    const s = loadForCommand(req, res);
    if (!s) return;
    const t = now();
    const r = stmtEnd.run(t, t, s.id, Number((req.body ?? {}).expectedRevision ?? -1));
    if (r.changes === 0) return conflict(res, s, true);
    stmtEvent.run(uid(), s.id, me.id, 'ended', s.current_item_id, null, t);
    const fresh = stmtById.get(s.id)!;
    emitRoomEvent(s.room_id, 'session.changed', s.id, fresh.revision);
    res.json(view(fresh, true));
  });
}
