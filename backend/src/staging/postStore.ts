/**
 * DB-13B · 社区动态的 Postgres 数据层。
 *
 *   动态   `public.app_posts`          （id uuid, user_id → profiles.id）
 *   点赞   `public.app_post_likes`     （主键 (post_id, user_id)）
 *   评论   `public.app_post_comments`  （id uuid, post_id → app_posts.id）
 *
 * ── 这不是「搬旧数据」，是第一次获得持久化 ────────────────────────────
 * 切换前动态存在 `routes/posts.ts` 的一个进程内 `Map`，重启即全丢。
 * 所以没有历史数据需要迁移，也没有数据会因为切换而消失。
 *
 * ── 三处必须照 schema 处理的地方 ─────────────────────────────────────
 * 1. `images_json` 是 **NOT NULL jsonb**。没有图片时要写 `[]`，不能省。
 * 2. `linked_course_id` 外键到 **`course_catalog.code`**（实测）。
 *    客户端可以随便传一个课程 id，直接写会被外键拒绝、导致整条发帖失败。
 *    因此调用方必须先校验该 code 是否在目录里，不在就写 null
 *    ——「链接的课程不存在」不该让用户发不出帖子。
 * 3. 作者的 `user_name` / `user_avatar` / `user_role` 是**冗余列**。
 *    这是 schema 的既定设计：动态流要按时间倒序取一页并直接渲染，
 *    逐条 join profiles 是 N+1。冗余值在发帖那一刻由服务端从已验证的
 *    认证上下文写入，**不接受客户端传入**。
 *
 * 点赞数不单独存计数列 —— 由 `app_post_likes` 的行数得出，
 * 避免「计数列与明细表不一致」这类需要额外事务保证的问题。
 */
import {
  deleteRows, insertRow, selectOne, selectRows, upsertRow,
  toEpochMs, fromEpochMs,
} from './pgData.js';

const POSTS = 'app_posts';
const LIKES = 'app_post_likes';
const COMMENTS = 'app_post_comments';

export interface CommentRecord {
  id: string;
  userId: string | null;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: number;
}

export interface PostRecord {
  id: string;
  userId: string | null;
  userName: string;
  userAvatar?: string;
  userRole: string;
  content: string;
  images: string[];
  timestamp: number;
  category: string;
  sharedRoom?: unknown;
  linkedCourseId?: string;
}

interface PostRow {
  id: string;
  user_id: string | null;
  user_name: string;
  user_avatar: string | null;
  user_role: string | null;
  content: string;
  images_json: unknown;
  category: string | null;
  shared_room_json: unknown;
  linked_course_id: string | null;
  posted_at: string;
  created_at: string;
  author_state: string | null;
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string | null;
  user_name: string;
  user_avatar: string | null;
  user_role: string | null;
  content: string;
  created_at: string;
  author_state: string | null;
}

interface LikeRow { post_id: string; user_id: string }

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function toPost(r: PostRow): PostRecord {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userAvatar: r.user_avatar ?? undefined,
    userRole: r.user_role ?? '',
    content: r.content,
    images: asStringArray(r.images_json),
    timestamp: toEpochMs(r.posted_at),
    category: r.category ?? '',
    sharedRoom: r.shared_room_json ?? undefined,
    linkedCourseId: r.linked_course_id ?? undefined,
  };
}

function toComment(r: CommentRow): CommentRecord {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userAvatar: r.user_avatar ?? undefined,
    content: r.content,
    timestamp: toEpochMs(r.created_at),
  };
}

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string): boolean => UUID_RE.test(v);

// ──────────────────────────── 动态 ────────────────────────────

export interface PostInput {
  userUuid: string;
  userName: string;
  userAvatar: string | null;
  userRole: string;
  content: string;
  images: string[];
  category: string;
  sharedRoom: unknown;
  /** 必须是 `course_catalog.code`，否则传 null（外键约束）。 */
  linkedCourseId: string | null;
}

export async function insertPost(
  id: string, input: PostInput, at = Date.now(),
): Promise<PostRecord> {
  const row = await insertRow<PostRow>(POSTS, {
    id,
    user_id: input.userUuid,
    user_name: input.userName,
    user_avatar: input.userAvatar,
    user_role: input.userRole,
    content: input.content,
    // NOT NULL jsonb —— 无图也要写空数组
    images_json: input.images,
    category: input.category,
    shared_room_json: input.sharedRoom ?? null,
    linked_course_id: input.linkedCourseId,
    posted_at: fromEpochMs(at),
    created_at: fromEpochMs(at),
  });
  return toPost(row);
}

export async function getPost(id: string): Promise<PostRecord | undefined> {
  if (!isUuid(id)) return undefined;
  const row = await selectOne<PostRow>(POSTS, `select=*&id=${eq(id)}`);
  return row ? toPost(row) : undefined;
}

/**
 * 取一页动态，最新在前。
 *
 * `since` 与 `limit` 直接交给 PostgREST（`posted_at=gt.` + `limit=`），
 * 不像 presence 那样在 JS 侧过滤 —— 动态量会持续增长，
 * 把整表拉回来再切片是不可接受的。
 */
export async function listPosts(since: number, limit: number): Promise<PostRecord[]> {
  const filters = [
    'select=*',
    `order=posted_at.desc`,
    `limit=${limit}`,
  ];
  if (since > 0) filters.push(`posted_at=gt.${encodeURIComponent(fromEpochMs(since))}`);
  const rows = await selectRows<PostRow>(POSTS, filters.join('&'));
  return rows.map(toPost);
}

export async function deletePost(id: string): Promise<void> {
  // 点赞与评论都外键到 app_posts.id。先删子行，避免依赖 schema 是否配了级联。
  await deleteRows(LIKES, `post_id=${eq(id)}`);
  await deleteRows(COMMENTS, `post_id=${eq(id)}`);
  await deleteRows(POSTS, `id=${eq(id)}`);
}

// ──────────────────────────── 点赞 ────────────────────────────

export async function hasLike(postId: string, userUuid: string): Promise<boolean> {
  return Boolean(await selectOne<LikeRow>(
    LIKES, `select=post_id&post_id=${eq(postId)}&user_id=${eq(userUuid)}`,
  ));
}

export async function addLike(postId: string, userUuid: string): Promise<void> {
  // upsert 而非 insert：重复点赞不该报错（SQLite 时期是 Set，天然幂等）。
  await upsertRow<LikeRow>(LIKES, { post_id: postId, user_id: userUuid });
}

export async function removeLike(postId: string, userUuid: string): Promise<void> {
  await deleteRows(LIKES, `post_id=${eq(postId)}&user_id=${eq(userUuid)}`);
}

export async function likeCount(postId: string): Promise<number> {
  const rows = await selectRows<LikeRow>(LIKES, `select=user_id&post_id=${eq(postId)}`);
  return rows.length;
}

/** 一批动态的点赞数与「我是否赞过」。一次查询，避免逐条往返。 */
export async function likesFor(
  postIds: string[], viewerUuid?: string,
): Promise<Map<string, { count: number; likedByMe: boolean }>> {
  const out = new Map<string, { count: number; likedByMe: boolean }>();
  for (const id of postIds) out.set(id, { count: 0, likedByMe: false });
  if (!postIds.length) return out;
  const list = `in.(${postIds.map(i => `"${i}"`).join(',')})`;
  const rows = await selectRows<LikeRow>(LIKES, `select=post_id,user_id&post_id=${list}`);
  for (const r of rows) {
    const e = out.get(r.post_id);
    if (!e) continue;
    e.count += 1;
    if (viewerUuid && r.user_id === viewerUuid) e.likedByMe = true;
  }
  return out;
}

// ──────────────────────────── 评论 ────────────────────────────

export interface CommentInput {
  postId: string;
  userUuid: string;
  userName: string;
  userAvatar: string | null;
  userRole: string;
  content: string;
}

export async function insertComment(
  id: string, input: CommentInput, at = Date.now(),
): Promise<CommentRecord> {
  const row = await insertRow<CommentRow>(COMMENTS, {
    id,
    post_id: input.postId,
    user_id: input.userUuid,
    user_name: input.userName,
    user_avatar: input.userAvatar,
    user_role: input.userRole,
    content: input.content,
    created_at: fromEpochMs(at),
  });
  return toComment(row);
}

/** 一批动态的评论，按时间正序（与 SQLite 时期的 push 顺序一致）。 */
export async function commentsFor(
  postIds: string[],
): Promise<Map<string, CommentRecord[]>> {
  const out = new Map<string, CommentRecord[]>();
  for (const id of postIds) out.set(id, []);
  if (!postIds.length) return out;
  const list = `in.(${postIds.map(i => `"${i}"`).join(',')})`;
  const rows = await selectRows<CommentRow>(
    COMMENTS, `select=*&post_id=${list}&order=created_at.asc`,
  );
  for (const r of rows) out.get(r.post_id)?.push(toComment(r));
  return out;
}
