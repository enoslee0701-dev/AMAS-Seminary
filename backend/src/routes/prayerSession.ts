import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import {
  requireRoomExists, requireRoomMember, requireRoomManager, isMember, activeUserUuid,
} from '../middleware/roomAuth.js';
import { sessionCommandLimiter } from '../middleware/rateLimit.js';
import { emitRoomEvent } from '../realtime/roomEvents.js';
import { stagingConfigured } from '../staging/pgData.js';
import { resolveProfiles } from '../staging/profileStore.js';
import {
  currentSession, getSession, listItems, createSession, appendEvent,
  startSession, setCurrentItem, setFacilitator, endSession, replaceScheduled,
  isActiveConflict, type SessionRecord, type ItemInput,
} from '../staging/sessionStore.js';

/**
 * 共享祷告会（Phase 2）。
 *
 * **服务器是唯一真相源。** 当前祷告事项、开始时间、带领者、是否结束
 * 全部只存在会话表；客户端的 useState / localStorage
 * 一律不得决定这些值。三台设备轮询到的必须完全一致。
 *
 * 并发模型：每个 manager 命令必须带 expectedRevision，条件更新
 * （revision + status 都在过滤条件里），影响 0 行即冲突（409）。
 * 因此 Host 与 Moderator 同时点「下一项」只会推进一格。
 *
 * 状态机：scheduled → active → ended。没有通用的 status PATCH，
 * 只有明确命令：start / advance / select-item / facilitator / end。
 * ended 是终态，任何控制命令都返回 409 SESSION_ENDED。
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * SQLite `prayer_sessions` / `prayer_session_items` / `prayer_session_events`
 * → Postgres 对应的 `app_*` 表。条件更新与状态冻结的等价搬迁见
 * `staging/sessionStore.ts`（那里逐条写明了为什么不是照抄 SQL）。
 *
 * 身份统一 **Supabase UUID**（D-42）：`created_by` / `facilitator_user_id` /
 * `actor_user_id` 都外键到 `profiles.id`。因此
 * `POST /facilitator` 的 `userId` 现在必须是**目标用户的 Supabase UUID**，
 * 带领者的显示名也改由 `profiles` 解析（原先读 SQLite `users`）。
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

/**
 * 校验并标准化 items（§6/§7）。
 * - 数量必须在 MIN_ITEMS..MAX_ITEMS，否则返回 null（400）
 * - **position 一律由服务器按数组顺序重新标准化为 1..n**，
 *   客户端传来的 position 一概忽略，杜绝 1/4/8/12 这类残留
 */
function normalizeItems(raw: unknown): ItemInput[] | null {
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

/** staging 未配置时明确报错，绝不静默回落到 SQLite。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

/**
 * 统一的 session 视图。facilitator 的 name/avatar **只从 profiles 取** ——
 * 绝不接受客户端传入的 facilitatorName。
 */
async function view(s: SessionRecord, canManage: boolean): Promise<unknown> {
  const [items, people] = await Promise.all([
    listItems(s.id),
    s.facilitatorUserId
      ? resolveProfiles([s.facilitatorUserId])
      : Promise.resolve(new Map()),
  ]);
  const f = s.facilitatorUserId ? people.get(s.facilitatorUserId) : undefined;
  return {
    session: {
      id: s.id,
      title: s.title,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      revision: s.revision,
      facilitator: f ? { userId: f.id, name: f.name, avatar: f.avatar } : null,
      currentItemId: s.currentItemId,
      items: items.map(i => ({
        id: i.id, position: i.position, title: i.title,
        description: i.description, scriptureRef: i.scriptureRef,
        scriptureText: i.scriptureText,
      })),
    },
    capabilities: { canManageSession: canManage },
    // §1 客户端用它算 offset，消除设备时钟偏差；数据库 startedAt 不变
    serverNow: now(),
  };
}

export function registerPrayerSessionRoutes(app: Express): void {
  const guards = [requireAuth, requireRoomExists, requireRoomMember] as const;
  const managerGuards = [
    requireAuth, requireRoomExists, requireRoomMember, requireRoomManager, sessionCommandLimiter,
  ] as const;

  /**
   * 取出 session 并校验它确实属于当前房间（防跨 room session IDOR）。
   * 返回 null 表示已经写过响应，调用方直接 return。
   */
  async function loadForCommand(
    req: Request, res: Response,
  ): Promise<SessionRecord | null> {
    const s = await getSession(req.params.sessionId);
    if (!s || s.roomId !== req.params.roomId) {
      res.status(404).json({ error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
      return null;
    }
    if (s.status === 'ended') {
      res.status(409).json({ error: 'Session already ended.', code: 'SESSION_ENDED' });
      return null;
    }
    return s;
  }

  /** 冲突响应：带上**最新**状态，客户端据此刷新后重试。 */
  async function conflict(res: Response, id: string, canManage: boolean): Promise<void> {
    const fresh = await getSession(id);
    res.status(409).json({
      error: 'Session state changed.',
      code: 'SESSION_STATE_CONFLICT',
      ...(fresh ? (await view(fresh, canManage) as object) : {}),
    });
  }

  /** 命令成功后：发事件 + 返回最新视图。 */
  async function respondFresh(res: Response, s: SessionRecord): Promise<void> {
    emitRoomEvent(s.roomId, 'session.changed', s.id, s.revision);
    res.json(await view(s, true));
  }

  /**
   * GET /api/rooms/:roomId/prayer-session/current
   * 没有 active/scheduled session 时返回 session: null——**不造假默认 session**。
   */
  app.get('/api/rooms/:roomId/prayer-session/current', ...guards,
    async (req: Request, res: Response) => {
      const canManage = Boolean(req.room?.isManager);
      if (!guardConfigured(res)) return;
      try {
        const s = await currentSession(req.params.roomId);
        // 即使没有 session 也要给 serverNow——客户端需要它算时钟 offset
        if (!s) {
          return res.json({
            session: null,
            capabilities: { canManageSession: canManage },
            serverNow: now(),
          });
        }
        res.json(await view(s, canManage));
      } catch (e) {
        console.error('[prayer-session] read failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to read prayer session.' });
      }
    });

  /**
   * POST /api/rooms/:roomId/prayer-sessions   创建（status=scheduled）
   * Body: { items: [{ title, description?, scriptureRef?, scriptureText? }] }
   * created_by 一律取自 JWT；客户端传 created_by / revision 等一律忽略。
   */
  app.post('/api/rooms/:roomId/prayer-sessions', ...managerGuards,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      const items = normalizeItems((req.body ?? {}).items);
      if (!items) {
        return res.status(400).json({
          error: `items must contain ${MIN_ITEMS}-${MAX_ITEMS} entries with a title.`,
          code: 'INVALID_ITEMS',
        });
      }
      if (!guardConfigured(res)) return;
      const { roomId } = req.params;
      const title = normTitle((req.body ?? {}).title);
      const sid = uid();
      const t = now();
      try {
        const s = await createSession({
          id: sid, roomId, title, createdByUuid: me, items, idOf: uid, at: t,
        });
        // §6 写入全部成功之后才发事件——绝不会出现「已通知客户端、数据库随后回滚」
        emitRoomEvent(roomId, 'session.changed', sid, 1);
        res.status(201).json(await view(s, true));
      } catch (e) {
        console.error('[prayer-session] create failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to create prayer session.' });
      }
    });

  /**
   * POST /.../:sessionId/start
   * 条件更新确认 status=scheduled 且 revision 匹配；
   * 同房间已有 active session 时由唯一约束拦下（409）。
   */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/start', ...managerGuards,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      try {
        const s = await loadForCommand(req, res);
        if (!s) return;
        if (s.status === 'active') {
          return res.status(409).json({
            error: 'Session already active.', code: 'SESSION_ALREADY_ACTIVE',
            ...(await view(s, true) as object),
          });
        }
        const expected = Number((req.body ?? {}).expectedRevision ?? s.revision);
        const first = (await listItems(s.id))[0];
        const t = now();
        let updated;
        try {
          updated = await startSession(s.id, expected, first?.id ?? null, t);
        } catch (e) {
          // 唯一约束命中：本房已有另一个 active session
          if (isActiveConflict(e)) {
            return res.status(409).json({
              error: 'Another session is already active in this room.',
              code: 'ROOM_HAS_ACTIVE_SESSION',
            });
          }
          throw e;
        }
        if (!updated) return conflict(res, s.id, true);
        await appendEvent({
          id: uid(), sessionId: s.id, actorUuid: me, eventType: 'started',
          fromItemId: null, toItemId: first?.id ?? null, at: t,
        });
        await respondFresh(res, updated);
      } catch (e) {
        console.error('[prayer-session] start failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to start prayer session.' });
      }
    });

  /**
   * POST /.../:sessionId/advance
   * 最后一项时**不自动结束**，返回 409 LAST_ITEM，由 UI 显示「结束祷告会」。
   */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/advance', ...managerGuards,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      try {
        const s = await loadForCommand(req, res);
        if (!s) return;
        if (s.status !== 'active') {
          return res.status(409).json({
            error: 'Session is not active.', code: 'SESSION_NOT_ACTIVE',
          });
        }
        const expected = Number((req.body ?? {}).expectedRevision ?? -1);
        const items = await listItems(s.id);
        const idx = items.findIndex(i => i.id === s.currentItemId);
        const next = items[idx + 1];
        if (!next) {
          return res.status(409).json({
            error: 'Already at the last item.', code: 'LAST_ITEM',
            ...(await view(s, true) as object),
          });
        }
        const t = now();
        const updated = await setCurrentItem(s.id, expected, next.id, t);
        if (!updated) return conflict(res, s.id, true);
        await appendEvent({
          id: uid(), sessionId: s.id, actorUuid: me, eventType: 'item_changed',
          fromItemId: s.currentItemId, toItemId: next.id, at: t,
        });
        await respondFresh(res, updated);
      } catch (e) {
        console.error('[prayer-session] advance failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to advance prayer session.' });
      }
    });

  /** POST /.../:sessionId/select-item   Body: { itemId, expectedRevision } */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/select-item', ...managerGuards,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      try {
        const s = await loadForCommand(req, res);
        if (!s) return;
        if (s.status !== 'active') {
          return res.status(409).json({
            error: 'Session is not active.', code: 'SESSION_NOT_ACTIVE',
          });
        }
        const { itemId, expectedRevision } = (req.body ?? {}) as {
          itemId?: string; expectedRevision?: number;
        };
        // 防跨 session item 注入：item 必须属于**本 session**
        const item = (await listItems(s.id)).find(i => i.id === itemId);
        if (!item) {
          return res.status(404).json({
            error: 'Item not found in this session.', code: 'ITEM_NOT_FOUND',
          });
        }
        const t = now();
        const updated = await setCurrentItem(s.id, Number(expectedRevision ?? -1), item.id, t);
        if (!updated) return conflict(res, s.id, true);
        await appendEvent({
          id: uid(), sessionId: s.id, actorUuid: me, eventType: 'item_changed',
          fromItemId: s.currentItemId, toItemId: item.id, at: t,
        });
        await respondFresh(res, updated);
      } catch (e) {
        console.error('[prayer-session] select-item failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to select item.' });
      }
    });

  /**
   * POST /.../:sessionId/facilitator   Body: { userId, expectedRevision }
   * `userId` 必须是本房成员的 **Supabase UUID**。name/avatar 由服务器从
   * profiles 返回，**不接受客户端传入的 facilitatorName**。
   * facilitator 只是展示角色，不获得任何控制权（Phase 2 §14）。
   */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/facilitator', ...managerGuards,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      try {
        const s = await loadForCommand(req, res);
        if (!s) return;
        const { userId, expectedRevision } = (req.body ?? {}) as {
          userId?: string | null; expectedRevision?: number;
        };
        const target = userId ? String(userId) : null;
        if (target) {
          const isHostUser = req.room?.hostId === target;
          // isMember 是异步的（Postgres）。漏掉 await 会让 Promise 恒为真值，
          // 取反恒 false —— 守卫静默失效。必须 await。
          if (!(await isMember(req.params.roomId, target)) && !isHostUser) {
            return res.status(400).json({
              error: 'Facilitator must be a room member.', code: 'NOT_A_MEMBER',
            });
          }
        }
        const t = now();
        const updated = await setFacilitator(s.id, Number(expectedRevision ?? -1), target, t);
        if (!updated) return conflict(res, s.id, true);
        await appendEvent({
          id: uid(), sessionId: s.id, actorUuid: me, eventType: 'facilitator_changed',
          fromItemId: null, toItemId: null, at: t,
        });
        await respondFresh(res, updated);
      } catch (e) {
        console.error('[prayer-session] facilitator failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to set facilitator.' });
      }
    });

  /**
   * PUT /api/rooms/:roomId/prayer-sessions/:sessionId
   * 编辑 **scheduled** 祷告会：标题、事项内容、顺序、增删。
   * Body: { title?, items: [...], expectedRevision }
   *
   * §8 结构冻结：session 一旦 active 就**禁止**任何结构编辑
   * （新增/删除/改名/重排/改经文），避免不同设备看到结构突然变化。
   * 条件更新里带着 `status=eq.scheduled`，active 时影响 0 行 → 409。
   *
   * §27 整体替换而非 partial merge：避免「标题来自 A、排序来自 B」的半截版本。
   */
  app.put('/api/rooms/:roomId/prayer-sessions/:sessionId', ...managerGuards,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      const items = normalizeItems((req.body ?? {}).items);
      if (!items) {
        return res.status(400).json({
          error: `items must contain ${MIN_ITEMS}-${MAX_ITEMS} entries with a title.`,
          code: 'INVALID_ITEMS',
        });
      }
      if (!guardConfigured(res)) return;
      try {
        const s = await loadForCommand(req, res);
        if (!s) return;
        if (s.status !== 'scheduled') {
          return res.status(409).json({
            error: 'Structure is frozen once the session starts.',
            code: 'SESSION_STRUCTURE_FROZEN',
            ...(await view(s, true) as object),
          });
        }
        const updated = await replaceScheduled({
          id: s.id,
          expectedRevision: Number((req.body ?? {}).expectedRevision ?? -1),
          title: normTitle((req.body ?? {}).title),
          items,
          idOf: uid,
          at: now(),
        });
        if (!updated) return conflict(res, s.id, true);
        await respondFresh(res, updated);
      } catch (e) {
        console.error('[prayer-session] edit failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to edit prayer session.' });
      }
    });

  /**
   * POST /.../:sessionId/previous
   * 与 advance 完全对称：server command + expectedRevision + 冲突保护。
   * 已经是第一项时返回 409 FIRST_ITEM，**不循环到最后一项**。
   */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/previous', ...managerGuards,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      try {
        const s = await loadForCommand(req, res);
        if (!s) return;
        if (s.status !== 'active') {
          return res.status(409).json({
            error: 'Session is not active.', code: 'SESSION_NOT_ACTIVE',
          });
        }
        const expected = Number((req.body ?? {}).expectedRevision ?? -1);
        const items = await listItems(s.id);
        const idx = items.findIndex(i => i.id === s.currentItemId);
        const prev = idx > 0 ? items[idx - 1] : null;
        if (!prev) {
          return res.status(409).json({
            error: 'Already at the first item.', code: 'FIRST_ITEM',
            ...(await view(s, true) as object),
          });
        }
        const t = now();
        const updated = await setCurrentItem(s.id, expected, prev.id, t);
        if (!updated) return conflict(res, s.id, true);
        await appendEvent({
          id: uid(), sessionId: s.id, actorUuid: me, eventType: 'item_changed',
          fromItemId: s.currentItemId, toItemId: prev.id, at: t,
        });
        await respondFresh(res, updated);
      } catch (e) {
        console.error('[prayer-session] previous failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to go to previous item.' });
      }
    });

  /** POST /.../:sessionId/end   保留 currentItemId 供历史记录，不清空。 */
  app.post('/api/rooms/:roomId/prayer-sessions/:sessionId/end', ...managerGuards,
    async (req: Request, res: Response) => {
      const me = activeUserUuid(req);
      if (!me) return res.status(401).json({ error: 'User token required.' });
      if (!guardConfigured(res)) return;
      try {
        const s = await loadForCommand(req, res);
        if (!s) return;
        const t = now();
        const updated = await endSession(
          s.id, Number((req.body ?? {}).expectedRevision ?? -1), t,
        );
        if (!updated) return conflict(res, s.id, true);
        await appendEvent({
          id: uid(), sessionId: s.id, actorUuid: me, eventType: 'ended',
          fromItemId: s.currentItemId, toItemId: null, at: t,
        });
        await respondFresh(res, updated);
      } catch (e) {
        console.error('[prayer-session] end failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to end prayer session.' });
      }
    });
}
