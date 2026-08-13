import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { broadcastToAllUsers } from './push.js';

/**
 * Community posts.
 *
 * In-memory store. PostRecord uses a `Set<string>` for `likedByUserIds`
 * because likes are toggle-by-user (O(1) presence check). All other
 * fields mirror the frontend shape so the React layer can render them
 * with minimal mapping.
 */

interface CommentRecord {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: number;
}

interface PostRecord {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userRole: string;
  content: string;
  images?: string[];
  timestamp: number;
  likes: number;
  likedByUserIds: Set<string>;
  commentList: CommentRecord[];
  category: string;
  sharedRoom?: unknown;
  linkedCourseId?: string;
}

const posts = new Map<string, PostRecord>();

/** Serialize a record for the wire: Sets are not JSON-friendly. */
function serializePost(p: PostRecord, viewerId?: string): unknown {
  return {
    id: p.id,
    userId: p.userId,
    userName: p.userName,
    userAvatar: p.userAvatar,
    userRole: p.userRole,
    content: p.content,
    images: p.images ?? [],
    timestamp: p.timestamp,
    likes: p.likes,
    likedByMe: viewerId ? p.likedByUserIds.has(viewerId) : false,
    commentList: p.commentList,
    category: p.category,
    sharedRoom: p.sharedRoom,
    linkedCourseId: p.linkedCourseId,
  };
}

export function registerPostRoutes(app: Express): void {
  /**
   * GET /api/posts?since=<timestamp>&limit=<n>
   * Public. Returns newest-first. `since` excludes anything <= that ts;
   * `limit` caps the page size (default 50, max 200).
   */
  app.get('/api/posts', (req: Request, res: Response) => {
    const since = Number(req.query.since ?? 0);
    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
    const sinceTs = Number.isFinite(since) ? since : 0;

    // Best-effort viewer id from the access token (without enforcing auth)
    // so `likedByMe` is accurate for logged-in callers. We don't fail the
    // request when no/invalid token is present.
    const viewerId = req.principal?.kind === 'user' ? req.principal.user.id : undefined;

    const list = [...posts.values()]
      .filter(p => p.timestamp > sinceTs)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(p => serializePost(p, viewerId));
    res.status(200).json(list);
  });

  /**
   * POST /api/posts — auth required.
   * Body: { content, images?, category, sharedRoom?, linkedCourseId? }
   * Author identity is taken from the JWT — clients cannot spoof userId.
   */
  app.post('/api/posts', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const {
      content, images, category, sharedRoom, linkedCourseId,
    } = (req.body ?? {}) as {
      content?: unknown; images?: unknown; category?: unknown;
      sharedRoom?: unknown; linkedCourseId?: unknown;
    };
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required.' });
    }
    if (typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'category is required.' });
    }
    const imgs = Array.isArray(images)
      ? images.filter((s): s is string => typeof s === 'string').slice(0, 9)
      : undefined;

    const id = crypto.randomUUID();
    const rec: PostRecord = {
      id,
      userId: principal.user.id,
      userName: principal.user.name,
      userAvatar: principal.user.avatar,
      userRole: principal.user.role,
      content: content.slice(0, 4000),
      images: imgs,
      timestamp: Date.now(),
      likes: 0,
      likedByUserIds: new Set(),
      commentList: [],
      category: category.slice(0, 64),
      sharedRoom: sharedRoom ?? undefined,
      linkedCourseId: typeof linkedCourseId === 'string' ? linkedCourseId : undefined,
    };
    posts.set(id, rec);
    res.status(200).json(serializePost(rec, principal.user.id));

    // Fan-out push notification to every registered iOS device.
    // Fire-and-forget: must NEVER block or fail the post-creation response.
    // When APNs is unconfigured (dev / test) this is a silent no-op.
    try {
      const preview = rec.content.length > 60 ? `${rec.content.slice(0, 60)}…` : rec.content;
      void broadcastToAllUsers({
        title: '新动态',
        body: `${rec.userName}: ${preview}`,
        data: { postId: rec.id },
      }).catch(() => { /* swallow — push failure must not surface to clients */ });
    } catch {
      /* swallow — push failure must not surface to clients */
    }
  });

  /**
   * DELETE /api/posts/:id — auth required.
   * Only the original poster may delete their own post.
   */
  app.delete('/api/posts/:id', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = posts.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Post not found.' });
    if (rec.userId !== principal.user.id) {
      return res.status(403).json({ error: 'Not the author.' });
    }
    posts.delete(req.params.id);
    res.status(200).json({ ok: true });
  });

  /**
   * POST /api/posts/:id/like — auth required.
   * Toggles the caller's like. Returns the updated like count + whether the
   * caller currently likes the post.
   */
  app.post('/api/posts/:id/like', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = posts.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Post not found.' });
    const uid = principal.user.id;
    let likedByMe: boolean;
    if (rec.likedByUserIds.has(uid)) {
      rec.likedByUserIds.delete(uid);
      rec.likes = Math.max(0, rec.likes - 1);
      likedByMe = false;
    } else {
      rec.likedByUserIds.add(uid);
      rec.likes += 1;
      likedByMe = true;
    }
    res.status(200).json({ likes: rec.likes, likedByMe });
  });

  /**
   * POST /api/posts/:id/comments — auth required.
   * Body: { content }. Appends and returns the new comment.
   */
  app.post('/api/posts/:id/comments', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = posts.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Post not found.' });
    const { content } = (req.body ?? {}) as { content?: unknown };
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required.' });
    }
    const comment: CommentRecord = {
      id: crypto.randomUUID(),
      userId: principal.user.id,
      userName: principal.user.name,
      userAvatar: principal.user.avatar,
      content: content.slice(0, 2000),
      timestamp: Date.now(),
    };
    rec.commentList.push(comment);
    res.status(200).json(comment);
  });
}

/** Test-only: wipe the in-memory store. */
export function _resetPosts(): void {
  posts.clear();
}
