import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import { resolveProfiles, profileExists } from '../staging/profileStore.js';
import {
  areFriends, addFriendship, removeFriendship, friendUuidsOf,
  getRequest, pendingBetween, insertRequest, deleteRequest,
  incomingRequests, outgoingRequests,
  type FriendRequestRecord,
} from '../staging/friendStore.js';

/**
 * Friend requests + friendships.
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * 切换前请求与关系都在**进程内 `Map`** 里，重启即全丢 ——
 * 「加好友」在服务器重启后就不存在了。现在落到 Postgres：
 *   `public.app_friend_requests` / `public.app_friendships`
 *
 * 身份是 **Supabase UUID**（D-42），两张表的身份列都外键到 `profiles.id`。
 *
 * ── 显示身份的来源换了 ───────────────────────────────────────────────
 * 切换前用 `auth/users.ts` 的 `findById()` 从 SQLite `users` 取名字/头像/角色。
 * 但好友主体现在是 Supabase UUID，而 `users.id` 是 canonical 本地 id ——
 * 值域不同，`findById(uuid)` 必然查不到。因此显示身份改由
 * `staging/profileStore.ts` 从 `profiles` + `user_roles` **批量**解析。
 *
 * 解析不到的 UUID 会被过滤掉 —— 与原先「`findById` 返回 undefined 的请求
 * 不出现在列表里」语义一致。
 */

/** staging 未配置时明确报错，绝不静默回落到内存。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

/**
 * 把一批请求连同对方的显示身份序列化。
 * `side` 决定看的是发起方还是接收方 —— 两个列表接口的唯一差别。
 */
async function serializeRequests(
  list: FriendRequestRecord[], side: 'from' | 'to',
): Promise<unknown[]> {
  const otherIds = list.map(r => (side === 'from' ? r.fromUserId : r.toUserId));
  const people = await resolveProfiles(otherIds);
  const out: unknown[] = [];
  for (const r of list) {
    const otherId = side === 'from' ? r.fromUserId : r.toUserId;
    const p = people.get(otherId);
    if (!p) continue; // 对方的 profile 已不存在 —— 与原先的过滤语义一致
    out.push(side === 'from'
      ? {
        id: r.id,
        fromUserId: r.fromUserId,
        fromUserName: p.name,
        fromUserAvatar: p.avatar,
        fromUserRole: p.role,
        createdAt: r.createdAt,
      }
      : {
        id: r.id,
        toUserId: r.toUserId,
        toUserName: p.name,
        toUserAvatar: p.avatar,
        toUserRole: p.role,
        createdAt: r.createdAt,
      });
  }
  return out;
}

export function registerFriendRoutes(app: Express): void {
  /**
   * POST /api/friends/requests — auth required.
   * Body: { targetUserId }. Creates a pending request from caller → target.
   * 409 if the pair is already friends or already has a pending request.
   * 400 if targetUserId is missing or refers to self; 404 if unknown user.
   *
   * `targetUserId` 现在是**目标用户的 Supabase UUID**。
   */
  app.post('/api/friends/requests', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    const { targetUserId } = (req.body ?? {}) as { targetUserId?: unknown };
    if (typeof targetUserId !== 'string' || !targetUserId.trim()) {
      return res.status(400).json({ error: 'targetUserId is required.' });
    }
    if (targetUserId === uid) {
      return res.status(400).json({ error: 'Cannot friend yourself.' });
    }
    if (!guardConfigured(res)) return;
    try {
      if (!(await profileExists(targetUserId))) {
        return res.status(404).json({ error: 'Target user not found.' });
      }
      if (await areFriends(uid, targetUserId)) {
        return res.status(409).json({ error: 'Already friends.' });
      }
      if (await pendingBetween(uid, targetUserId)) {
        return res.status(409).json({ error: 'Request already pending.' });
      }
      const rec = await insertRequest(crypto.randomUUID(), uid, targetUserId);
      res.status(200).json({
        id: rec.id,
        fromUserId: rec.fromUserId,
        toUserId: rec.toUserId,
        createdAt: rec.createdAt,
      });
    } catch (e) {
      console.error('[friends] request failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to create friend request.' });
    }
  });

  /**
   * GET /api/friends/requests/incoming — auth required.
   * Pending requests addressed TO the caller.
   */
  app.get('/api/friends/requests/incoming', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      res.status(200).json(await serializeRequests(await incomingRequests(uid), 'from'));
    } catch (e) {
      console.error('[friends] incoming failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read friend requests.' });
    }
  });

  /**
   * GET /api/friends/requests/outgoing — auth required.
   * Pending requests the caller has sent.
   */
  app.get('/api/friends/requests/outgoing', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      res.status(200).json(await serializeRequests(await outgoingRequests(uid), 'to'));
    } catch (e) {
      console.error('[friends] outgoing failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read friend requests.' });
    }
  });

  /**
   * POST /api/friends/requests/:id/accept — auth required, target only.
   * Promotes the request to a friendship and removes the request.
   */
  app.post('/api/friends/requests/:id/accept', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      const rec = await getRequest(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Request not found.' });
      if (rec.toUserId !== uid) {
        return res.status(403).json({ error: 'Only the target may accept.' });
      }
      // 先建关系再删请求：反过来若中途失败，请求没了而关系也没建立，
      // 双方都无从恢复。这个顺序下最坏情况是「关系已建、请求还在」，
      // 下一次 accept 会因为 areFriends 命中而返回 409，可自愈。
      await addFriendship(rec.fromUserId, rec.toUserId);
      await deleteRequest(rec.id);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[friends] accept failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to accept friend request.' });
    }
  });

  /**
   * POST /api/friends/requests/:id/reject — auth required, target only.
   * Removes the request without creating a friendship.
   */
  app.post('/api/friends/requests/:id/reject', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      const rec = await getRequest(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Request not found.' });
      if (rec.toUserId !== uid) {
        return res.status(403).json({ error: 'Only the target may reject.' });
      }
      await deleteRequest(rec.id);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[friends] reject failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to reject friend request.' });
    }
  });

  /**
   * DELETE /api/friends/requests/:id — auth required, sender only.
   * Cancels an outgoing pending request.
   */
  app.delete('/api/friends/requests/:id', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      const rec = await getRequest(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Request not found.' });
      if (rec.fromUserId !== uid) {
        return res.status(403).json({ error: 'Only the sender may cancel.' });
      }
      await deleteRequest(rec.id);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[friends] cancel failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to cancel friend request.' });
    }
  });

  /**
   * GET /api/friends — auth required.
   * Returns the caller's friends as public user records.
   */
  app.get('/api/friends', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      const ids = await friendUuidsOf(uid);
      const people = await resolveProfiles(ids);
      const list: { id: string; name: string; avatar?: string; role: string }[] = [];
      for (const id of ids) {
        const p = people.get(id);
        if (!p) continue; // profile 已不存在 —— 不输出一个只有 id 的空壳
        list.push({ id: p.id, name: p.name, avatar: p.avatar, role: p.role });
      }
      res.status(200).json(list);
    } catch (e) {
      console.error('[friends] list failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read friends.' });
    }
  });

  /**
   * DELETE /api/friends/:userId — auth required.
   * Removes the friendship from both sides.
   */
  app.delete('/api/friends/:userId', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    const otherId = req.params.userId;
    try {
      if (!(await areFriends(uid, otherId))) {
        return res.status(404).json({ error: 'Not friends.' });
      }
      await removeFriendship(uid, otherId);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[friends] unfriend failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to remove friend.' });
    }
  });
}
