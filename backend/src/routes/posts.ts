import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth, attachPrincipalIfPresent } from '../middleware/auth.js';
import { broadcastToAllUsers } from './push.js';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import { getCourse } from '../staging/courseStore.js';
import {
  insertPost, getPost, listPosts, deletePost,
  hasLike, addLike, removeLike, likeCount, likesFor,
  insertComment, commentsFor,
  type PostRecord, type CommentRecord,
} from '../staging/postStore.js';

/**
 * Community posts.
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * 切换前动态存在**进程内 `Map`** 里，重启即全丢。现在落到 Postgres：
 *   `public.app_posts` / `app_post_likes` / `app_post_comments`
 *
 * 因此这不是「搬旧数据」，而是这个域**第一次获得持久化** ——
 * 没有历史数据需要迁移，也没有数据会因为切换而消失。
 *
 * 身份是 **Supabase UUID**（`principal.authId`，D-42）；`user_id` 外键到
 * `profiles.id`。作者的显示名/头像/角色仍取自已解析的 `principal.user`
 * （legacy 仅作展示），在发帖那一刻由服务端写入冗余列 ——
 * **绝不接受客户端传入的身份字段**。
 *
 * 点赞不再是内存 `Set`，而是 `app_post_likes` 的行；`likes` 计数由行数得出。
 */

/** 线格式。`likedByMe` / `likes` / `commentList` 由调用方算好传入。 */
function toWire(
  p: PostRecord,
  likes: { count: number; likedByMe: boolean },
  commentList: CommentRecord[],
): unknown {
  return {
    id: p.id,
    userId: p.userId,
    userName: p.userName,
    userAvatar: p.userAvatar,
    userRole: p.userRole,
    content: p.content,
    images: p.images,
    timestamp: p.timestamp,
    likes: likes.count,
    likedByMe: likes.likedByMe,
    commentList,
    category: p.category,
    sharedRoom: p.sharedRoom,
    linkedCourseId: p.linkedCourseId,
  };
}

/** staging 未配置时明确报错，绝不静默回落到内存。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

export function registerPostRoutes(app: Express): void {
  /**
   * GET /api/posts?since=<timestamp>&limit=<n>
   * Public. Returns newest-first. `since` excludes anything <= that ts;
   * `limit` caps the page size (default 50, max 200).
   */
  // `attachPrincipalIfPresent`：公开接口，但带了有效 token 就解析出身份，
  // 好让 `likedByMe` 对已登录的调用者是准确的。它**不做任何拒绝** ——
  // 认不出来就按匿名继续。（切换前这里没有任何中间件填充 principal，
  // 所以 likedByMe 对所有人恒为 false —— 那是被本轮测试撞出来的旧缺陷。）
  app.get('/api/posts', attachPrincipalIfPresent, async (req: Request, res: Response) => {
    if (!guardConfigured(res)) return;
    const since = Number(req.query.since ?? 0);
    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
    const sinceTs = Number.isFinite(since) ? since : 0;

    // Best-effort viewer id from the access token (without enforcing auth)
    // so `likedByMe` is accurate for logged-in callers. We don't fail the
    // request when no/invalid token is present.
    const viewerId = activeUserUuid(req) ?? undefined;

    try {
      const list = await listPosts(sinceTs, limit);
      const ids = list.map(p => p.id);
      // 两次批量查询覆盖整页 —— 不在循环里逐条查点赞/评论。
      const [likes, comments] = await Promise.all([
        likesFor(ids, viewerId),
        commentsFor(ids),
      ]);
      res.status(200).json(list.map(p => toWire(
        p,
        likes.get(p.id) ?? { count: 0, likedByMe: false },
        comments.get(p.id) ?? [],
      )));
    } catch (e) {
      console.error('[posts] list failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read posts.' });
    }
  });

  /**
   * POST /api/posts — auth required.
   * Body: { content, images?, category, sharedRoom?, linkedCourseId? }
   * Author identity is taken from the JWT — clients cannot spoof userId.
   */
  app.post('/api/posts', requireAuth, async (req: Request, res: Response) => {
    const principal = req.principal;
    const uid = activeUserUuid(req);
    if (!uid || !principal || principal.kind !== 'user') {
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
    if (!guardConfigured(res)) return;
    const imgs = Array.isArray(images)
      ? images.filter((s): s is string => typeof s === 'string').slice(0, 9)
      : [];

    try {
      // `app_posts.linked_course_id` 外键到 `course_catalog.code`。
      // 客户端可以传任意值，直接写会被外键拒绝、让整条发帖失败。
      // 目录里没有就当作「没有关联课程」—— 一个失效的课程链接
      // 不该阻止用户发帖。
      let linked: string | null = null;
      if (typeof linkedCourseId === 'string' && linkedCourseId.trim()) {
        linked = (await getCourse(linkedCourseId)) ? linkedCourseId : null;
      }

      const id = crypto.randomUUID();
      const rec = await insertPost(id, {
        userUuid: uid,
        userName: principal.user.name,
        userAvatar: principal.user.avatar ?? null,
        userRole: principal.user.role,
        content: content.slice(0, 4000),
        images: imgs,
        category: category.slice(0, 64),
        sharedRoom: sharedRoom ?? null,
        linkedCourseId: linked,
      });
      res.status(200).json(toWire(rec, { count: 0, likedByMe: false }, []));

      // Fan-out push notification to every registered iOS device.
      // Fire-and-forget: must NEVER block or fail the post-creation response.
      // When APNs is unconfigured (dev / test) this is a silent no-op.
      const preview = rec.content.length > 60 ? `${rec.content.slice(0, 60)}…` : rec.content;
      void broadcastToAllUsers({
        title: '新动态',
        body: `${rec.userName}: ${preview}`,
        data: { postId: rec.id },
      }).catch(() => { /* swallow — push failure must not surface to clients */ });
    } catch (e) {
      console.error('[posts] create failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to create post.' });
    }
  });

  /**
   * DELETE /api/posts/:id — auth required.
   * Only the original poster may delete their own post.
   */
  app.delete('/api/posts/:id', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      const rec = await getPost(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Post not found.' });
      if (rec.userId !== uid) {
        return res.status(403).json({ error: 'Not the author.' });
      }
      await deletePost(rec.id);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[posts] delete failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to delete post.' });
    }
  });

  /**
   * POST /api/posts/:id/like — auth required.
   * Toggles the caller's like. Returns the updated like count + whether the
   * caller currently likes the post.
   */
  app.post('/api/posts/:id/like', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      const rec = await getPost(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Post not found.' });
      let likedByMe: boolean;
      if (await hasLike(rec.id, uid)) {
        await removeLike(rec.id, uid);
        likedByMe = false;
      } else {
        await addLike(rec.id, uid);
        likedByMe = true;
      }
      res.status(200).json({ likes: await likeCount(rec.id), likedByMe });
    } catch (e) {
      console.error('[posts] like failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to toggle like.' });
    }
  });

  /**
   * POST /api/posts/:id/comments — auth required.
   * Body: { content }. Appends and returns the new comment.
   */
  app.post('/api/posts/:id/comments', requireAuth, async (req: Request, res: Response) => {
    const principal = req.principal;
    const uid = activeUserUuid(req);
    if (!uid || !principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const { content } = (req.body ?? {}) as { content?: unknown };
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required.' });
    }
    if (!guardConfigured(res)) return;
    try {
      const rec = await getPost(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Post not found.' });
      const comment = await insertComment(crypto.randomUUID(), {
        postId: rec.id,
        userUuid: uid,
        userName: principal.user.name,
        userAvatar: principal.user.avatar ?? null,
        userRole: principal.user.role,
        content: content.slice(0, 2000),
      });
      res.status(200).json(comment);
    } catch (e) {
      console.error('[posts] comment failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to add comment.' });
    }
  });
}
