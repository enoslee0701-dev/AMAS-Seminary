import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import {
  requireRoomExists, addMember, removeMember, memberCount, activeUserUuid,
} from '../middleware/roomAuth.js';
import { roomMembershipLimiter } from '../middleware/rateLimit.js';
import { evictVoiceParticipant } from '../realtime/voiceEviction.js';
import { stagingConfigured } from '../staging/pgData.js';
import { getRoom, upsertRoom, deleteRoom, deletePresence } from '../staging/roomStore.js';

/**
 * 房间注册表（密码 / 房主 / 成员生命周期）。
 *
 * ── DB-12 切换（Supervisor 裁定 #24）─────────────────────────────────
 * 数据面已从 SQLite `rooms` 切到 Postgres `public.app_rooms`。
 *
 * **房主权威来源变了**：以前 `POST /api/rooms` 用请求体里的 `hostId`
 * 决定房主，`DELETE` 用 `x-host-id` 头做授权——两者都是客户端自称的身份。
 * 现在一律由**已验证的认证上下文**推导：`host_user_id = principal.authId`
 * （Supabase UUID）。客户端无法再指定别人当房主，也无法冒充房主删房。
 *
 * 请求体里的 `hostId` 若仍被旧客户端发送，**只做一致性校验，绝不决定归属**：
 * 与认证身份不符直接 403，而不是默默采信。
 */

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** staging 未配置时明确报错，绝不静默回落到 SQLite。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

export function registerRoomRoutes(app: Express): void {
  /**
   * POST /api/rooms
   * 创建 / 更新房间密码。**必须是已认证的真人用户**——
   * service principal 不能悄悄变成人类房主。
   * Body: { roomId, password? }（省略 password 即公开房间）
   *   `hostId` 已废弃：若提供且与认证身份不符 → 403。
   */
  app.post('/api/rooms', requireAuth, async (req: Request, res: Response) => {
    const { roomId, hostId, password } = (req.body ?? {}) as {
      roomId?: string; hostId?: string; password?: string;
    };
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required.' });
    }
    if (password && password.length > 64) {
      return res.status(400).json({ error: 'password too long (max 64 chars).' });
    }
    // 房主只能是已认证的真人。没有 Supabase UUID 就没有可写入 profiles FK 的身份。
    const uid = activeUserUuid(req);
    if (!uid) {
      return res.status(401).json({ error: 'Authenticated user required to host a room.' });
    }
    // 兼容期：旧客户端仍可能发 hostId。它不再决定归属，只用于发现不一致。
    if (typeof hostId === 'string' && hostId && hostId !== uid) {
      return res.status(403).json({
        error: 'hostId no longer establishes ownership; it must match the authenticated user.',
      });
    }
    if (!guardConfigured(res)) return;

    try {
      const existing = await getRoom(roomId);
      if (existing && existing.hostType === 'system') {
        return res.status(403).json({ error: 'System rooms cannot be modified.' });
      }
      if (existing && existing.hostUserId && existing.hostUserId !== uid) {
        return res.status(403).json({ error: 'Only the host can update this room.' });
      }
      const createdAt = existing?.createdAt ?? Date.now();

      let passwordHash: string | null = null;
      let passwordSalt: string | null = null;
      if (password) {
        passwordSalt = crypto.randomBytes(16).toString('hex');
        passwordHash = hashPassword(password, passwordSalt);
      }
      // SEC-2 §16：建房与房主 membership 必须一起完成，否则会留下房主进不去的
      // 半成品房间。PostgREST 没有跨请求事务，因此顺序上先建房再补 membership，
      // 且 membership 失败时把新建的房间回收掉，避免留下无人可进的房间。
      await upsertRoom({ roomId, hostUserId: uid, passwordHash, passwordSalt, createdAt });
      try {
        await addMember(roomId, uid, createdAt);
      } catch (e) {
        if (!existing) await deleteRoom(roomId).catch(() => {});
        throw e;
      }
      res.json({ ok: true, hasPassword: Boolean(password) });
    } catch (e) {
      console.error('[rooms] create/update failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to store room.' });
    }
  });

  /**
   * POST /api/rooms/validate
   * 校验密码。Body: { roomId, password? }
   * 命中返回 { ok: true }；否则 401 / 404。
   */
  app.post('/api/rooms/validate', async (req: Request, res: Response) => {
    const { roomId, password } = (req.body ?? {}) as { roomId?: string; password?: string };
    if (!roomId) return res.status(400).json({ error: 'roomId is required.' });
    if (!guardConfigured(res)) return;
    let rec;
    try {
      rec = await getRoom(roomId);
    } catch (e) {
      console.error('[rooms] validate lookup failed:', (e as Error).message);
      return res.status(502).json({ error: 'Failed to read room.' });
    }
    if (!rec) {
      // 未注册的房间（例如客户端本地造的 mock）返回 404，让客户端自行决定回退路径。
      return res.status(404).json({ error: 'Room not registered.' });
    }
    if (!rec.passwordHash) return res.json({ ok: true, public: true });
    if (!password) return res.status(401).json({ error: 'Password required.' });
    const candidate = hashPassword(password, rec.passwordSalt!);
    if (!timingSafeEqual(candidate, rec.passwordHash)) {
      return res.status(401).json({ error: 'Wrong password.' });
    }
    res.json({ ok: true, public: false });
  });

  /**
   * POST /api/rooms/:roomId/join
   * 通过进入条件（公开房间，或密码正确）后建立成员关系。
   * Body: { password? }
   *
   * 身份**只**来自认证上下文——客户端无法指定要给谁建立 membership。
   * 重复 join 幂等，且不会把既有 moderator 降级。
   */
  app.post('/api/rooms/:roomId/join', requireAuth, requireRoomExists, roomMembershipLimiter,
    async (req: Request, res: Response) => {
      const uid = activeUserUuid(req);
      if (!uid) return res.status(401).json({ error: 'User token required.' });
      const { roomId } = req.params;
      const { password } = (req.body ?? {}) as { password?: string };
      try {
        const rec = await getRoom(roomId);
        if (!rec) return res.status(404).json({ error: 'Room not found.' });
        if (rec.passwordHash) {
          if (!password) return res.status(401).json({ error: 'Password required.' });
          const candidate = hashPassword(password, rec.passwordSalt!);
          if (!timingSafeEqual(candidate, rec.passwordHash)) {
            return res.status(401).json({ error: 'Wrong password.' });
          }
        }
        await addMember(roomId, uid);
        res.json({ ok: true, roomId, memberCount: await memberCount(roomId) });
      } catch (e) {
        console.error('[rooms] join failed:', (e as Error).message);
        res.status(502).json({ error: 'Failed to join room.' });
      }
    });

  /**
   * POST /api/rooms/:roomId/leave
   * **显式**离开：解除成员关系并清除在线状态。之后访问该房间 prayer API 返回 403。
   *
   * 注意：断网 / 切后台 / 心跳超时**不会**走到这里，那些只影响 presence。
   * 这是刻意的——否则网络波动会导致授权状态异常。
   */
  app.post('/api/rooms/:roomId/leave', requireAuth, requireRoomExists, roomMembershipLimiter,
    async (req: Request, res: Response) => {
      const uid = activeUserUuid(req);
      if (!uid) return res.status(401).json({ error: 'User token required.' });
      const { roomId } = req.params;
      try {
        await removeMember(roomId, uid);
        await deletePresence(roomId, uid);
      } catch (e) {
        console.error('[rooms] leave failed:', (e as Error).message);
        return res.status(502).json({ error: 'Failed to leave room.' });
      }
      // §16 LiveKit token 是无状态 JWT，签发后无法撤销；已建立的语音连接不会
      // 因为 membership 删除而自动断开。必须服务端主动踢出，否则会出现
      // 「已退出房间但人还在语音里能听能说」。
      // 失败不阻塞 Leave Room —— 用 void 调用，异常在函数内部吞掉。
      void evictVoiceParticipant(roomId, uid);
      res.json({ ok: true, roomId });
    });

  /**
   * DELETE /api/rooms/:roomId
   * 仅房主。授权比对的是 `app_rooms.host_user_id` 与认证身份，
   * **不再接受 `x-host-id` 头**（那是客户端自称的身份）。
   */
  app.delete('/api/rooms/:roomId', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    const { roomId } = req.params;
    try {
      const rec = await getRoom(roomId);
      if (!rec) return res.status(404).json({ error: 'Room not found.' });
      if (rec.hostType === 'system') {
        return res.status(403).json({ error: 'System rooms cannot be deleted.' });
      }
      if (rec.hostUserId !== uid) {
        return res.status(403).json({ error: 'Only the host can delete.' });
      }
      await deleteRoom(roomId);
      res.json({ ok: true });
    } catch (e) {
      console.error('[rooms] delete failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to delete room.' });
    }
  });
}
