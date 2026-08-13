import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { findById } from '../auth/users.js';

/**
 * Friend requests + friendships.
 *
 * In-memory store, mirroring the posts.ts style. Two collections:
 *   - `requests`     Map<requestId, FriendRequest> — pending requests only.
 *   - `friendships`  Map<pairKey, true>            — established connections.
 *
 * `pairKey` is `min(a,b):max(a,b)` lexicographically so the same friendship
 * has a single canonical key regardless of which side initiated the request.
 *
 * The HTTP surface exposes user-facing shapes — name/avatar/role are
 * resolved via `findById` so the wire never carries a passwordHash.
 */

interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt: number;
}

const requests = new Map<string, FriendRequest>();
const friendships = new Map<string, true>();

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function areFriends(a: string, b: string): boolean {
  return friendships.has(pairKey(a, b));
}

function pendingBetween(a: string, b: string): FriendRequest | null {
  for (const r of requests.values()) {
    if (
      (r.fromUserId === a && r.toUserId === b) ||
      (r.fromUserId === b && r.toUserId === a)
    ) {
      return r;
    }
  }
  return null;
}

/**
 * Serialize a request for the wire, attaching the sender's public
 * identity. Returns null if the sender no longer exists (e.g. they
 * deleted their account); caller filters those out.
 */
function serializeIncoming(r: FriendRequest): unknown | null {
  const from = findById(r.fromUserId);
  if (!from) return null;
  return {
    id: r.id,
    fromUserId: r.fromUserId,
    fromUserName: from.name,
    fromUserAvatar: from.avatar,
    fromUserRole: from.role,
    createdAt: r.createdAt,
  };
}

function serializeOutgoing(r: FriendRequest): unknown | null {
  const to = findById(r.toUserId);
  if (!to) return null;
  return {
    id: r.id,
    toUserId: r.toUserId,
    toUserName: to.name,
    toUserAvatar: to.avatar,
    toUserRole: to.role,
    createdAt: r.createdAt,
  };
}

export function registerFriendRoutes(app: Express): void {
  /**
   * POST /api/friends/requests — auth required.
   * Body: { targetUserId }. Creates a pending request from caller → target.
   * 409 if the pair is already friends or already has a pending request.
   * 400 if targetUserId is missing or refers to self / unknown user.
   */
  app.post('/api/friends/requests', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const { targetUserId } = (req.body ?? {}) as { targetUserId?: unknown };
    if (typeof targetUserId !== 'string' || !targetUserId.trim()) {
      return res.status(400).json({ error: 'targetUserId is required.' });
    }
    if (targetUserId === principal.user.id) {
      return res.status(400).json({ error: 'Cannot friend yourself.' });
    }
    if (!findById(targetUserId)) {
      return res.status(404).json({ error: 'Target user not found.' });
    }
    if (areFriends(principal.user.id, targetUserId)) {
      return res.status(409).json({ error: 'Already friends.' });
    }
    if (pendingBetween(principal.user.id, targetUserId)) {
      return res.status(409).json({ error: 'Request already pending.' });
    }

    const id = crypto.randomUUID();
    const rec: FriendRequest = {
      id,
      fromUserId: principal.user.id,
      toUserId: targetUserId,
      createdAt: Date.now(),
    };
    requests.set(id, rec);
    res.status(200).json({
      id: rec.id,
      fromUserId: rec.fromUserId,
      toUserId: rec.toUserId,
      createdAt: rec.createdAt,
    });
  });

  /**
   * GET /api/friends/requests/incoming — auth required.
   * Pending requests addressed TO the caller.
   */
  app.get('/api/friends/requests/incoming', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const uid = principal.user.id;
    const list = [...requests.values()]
      .filter(r => r.toUserId === uid)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(serializeIncoming)
      .filter((x): x is NonNullable<typeof x> => x !== null);
    res.status(200).json(list);
  });

  /**
   * GET /api/friends/requests/outgoing — auth required.
   * Pending requests the caller has sent.
   */
  app.get('/api/friends/requests/outgoing', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const uid = principal.user.id;
    const list = [...requests.values()]
      .filter(r => r.fromUserId === uid)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(serializeOutgoing)
      .filter((x): x is NonNullable<typeof x> => x !== null);
    res.status(200).json(list);
  });

  /**
   * POST /api/friends/requests/:id/accept — auth required, target only.
   * Promotes the request to a friendship and removes the request.
   */
  app.post('/api/friends/requests/:id/accept', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = requests.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Request not found.' });
    if (rec.toUserId !== principal.user.id) {
      return res.status(403).json({ error: 'Only the target may accept.' });
    }
    friendships.set(pairKey(rec.fromUserId, rec.toUserId), true);
    requests.delete(rec.id);
    res.status(200).json({ ok: true });
  });

  /**
   * POST /api/friends/requests/:id/reject — auth required, target only.
   * Removes the request without creating a friendship.
   */
  app.post('/api/friends/requests/:id/reject', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = requests.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Request not found.' });
    if (rec.toUserId !== principal.user.id) {
      return res.status(403).json({ error: 'Only the target may reject.' });
    }
    requests.delete(rec.id);
    res.status(200).json({ ok: true });
  });

  /**
   * DELETE /api/friends/requests/:id — auth required, sender only.
   * Cancels an outgoing pending request.
   */
  app.delete('/api/friends/requests/:id', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = requests.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Request not found.' });
    if (rec.fromUserId !== principal.user.id) {
      return res.status(403).json({ error: 'Only the sender may cancel.' });
    }
    requests.delete(rec.id);
    res.status(200).json({ ok: true });
  });

  /**
   * GET /api/friends — auth required.
   * Returns the caller's friends as public user records.
   */
  app.get('/api/friends', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const uid = principal.user.id;
    const list: { id: string; name: string; avatar?: string; role: string }[] = [];
    for (const key of friendships.keys()) {
      const [a, b] = key.split(':');
      const otherId = a === uid ? b : b === uid ? a : null;
      if (!otherId) continue;
      const u = findById(otherId);
      if (!u) continue;
      list.push({ id: u.id, name: u.name, avatar: u.avatar, role: u.role });
    }
    res.status(200).json(list);
  });

  /**
   * DELETE /api/friends/:userId — auth required.
   * Removes the friendship from both sides.
   */
  app.delete('/api/friends/:userId', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const otherId = req.params.userId;
    const key = pairKey(principal.user.id, otherId);
    if (!friendships.has(key)) {
      return res.status(404).json({ error: 'Not friends.' });
    }
    friendships.delete(key);
    res.status(200).json({ ok: true });
  });
}

/** Test-only: wipe in-memory state. */
export function _resetFriends(): void {
  requests.clear();
  friendships.clear();
}
