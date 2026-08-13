/**
 * postsService — thin wrapper around the backend's `/api/posts` surface.
 *
 * All methods degrade to `null` (or an empty array) when the backend is
 * not configured or the request fails, so the caller can fall back to its
 * existing localStorage / mock data flow without throwing.
 *
 * Auth-required calls go through `authService.fetchAuthed` so the bearer
 * token is attached and refreshed transparently.
 *
 * Shape mapping
 * -------------
 * The backend's serialized post (see `backend/src/routes/posts.ts ::
 * serializePost`) uses `timestamp: number` and exposes `likes` +
 * `likedByMe` directly, but no `likedByUsers` list and no human-readable
 * `comments` count. The frontend's `CommunityPost` type (defined in
 * `components/CommunityView.tsx`) uses `timestamp: string`, `comments:
 * number`, `likedByUsers: Liker[]`, and `connectionStatus: 'none' |
 * 'sent' | 'connected'`. We bridge the gap here so the component can be
 * wired up without changing its existing rendering code.
 */

import { fetchAuthed } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export function isBackendConfigured(): boolean {
  return apiBase().length > 0;
}

export interface PostComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: number;
}

/** Server wire shape — what /api/posts returns. */
export interface ServerPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userRole: string;
  content: string;
  images: string[];
  timestamp: number;
  likes: number;
  likedByMe: boolean;
  commentList: PostComment[];
  category: string;
  sharedRoom?: unknown;
  linkedCourseId?: string;
}

/** Back-compat alias — earlier exports referenced `Post`. */
export type Post = ServerPost;

/**
 * Frontend-shaped post — matches `CommunityPost` in CommunityView.tsx
 * (kept structural rather than imported to avoid a circular dep with the
 * component file). Only the fields the wire layer can populate are
 * included; everything else (e.g. `connectionStatus`) is defaulted.
 */
export interface MappedPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userRole: string;
  content: string;
  images?: string[];
  timestamp: string;
  likes: number;
  comments: number;
  likedByMe: boolean;
  likedByUsers: { id: string; name: string; avatar: string }[];
  commentList?: {
    id: string;
    userId: string;
    userName: string;
    content: string;
    userAvatar?: string;
    userRole?: string;
  }[];
  category: string;
  connectionStatus: 'none' | 'sent' | 'connected';
  sharedRoom?: unknown;
  linkedCourseId?: string;
}

/**
 * Format a numeric server timestamp into the short Chinese relative
 * label the existing UI expects ("刚刚", "5分钟前", "2小时前", or a
 * "YYYY-M-D" date for older items). Matches the rough granularity of
 * the mock data so the rendered feed feels consistent.
 */
function relativeLabel(tsMs: number): string {
  const diff = Date.now() - tsMs;
  if (!Number.isFinite(diff) || diff < 0) return '刚刚';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}天前`;
  const d = new Date(tsMs);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Convert a backend `ServerPost` to the frontend `CommunityPost` shape. */
export function toMappedPost(p: ServerPost): MappedPost {
  return {
    id: p.id,
    userId: p.userId,
    userName: p.userName,
    userAvatar: p.userAvatar ?? '',
    userRole: p.userRole,
    content: p.content,
    images: Array.isArray(p.images) ? p.images : [],
    timestamp: relativeLabel(p.timestamp),
    likes: typeof p.likes === 'number' ? p.likes : 0,
    comments: Array.isArray(p.commentList) ? p.commentList.length : 0,
    likedByMe: !!p.likedByMe,
    // Server doesn't track full liker list; leave empty so the UI renders
    // the heart count via `likes` and skips the avatar stack.
    likedByUsers: [],
    commentList: Array.isArray(p.commentList)
      ? p.commentList.map(c => ({
          id: c.id,
          userId: c.userId,
          userName: c.userName,
          userAvatar: c.userAvatar,
          content: c.content,
        }))
      : [],
    category: p.category,
    connectionStatus: 'none',
    sharedRoom: p.sharedRoom,
    linkedCourseId: p.linkedCourseId,
  };
}

export interface CreatePostInput {
  content: string;
  category: string;
  images?: string[];
  sharedRoom?: unknown;
  linkedCourseId?: string;
}

/** GET /api/posts — returns an empty array if the backend is unreachable. */
export async function listPosts(opts: { since?: number; limit?: number } = {}): Promise<MappedPost[]> {
  const base = apiBase();
  if (!base) return [];
  const url = new URL(`${base}/api/posts`);
  if (opts.since !== undefined) url.searchParams.set('since', String(opts.since));
  if (opts.limit !== undefined) url.searchParams.set('limit', String(opts.limit));
  try {
    // fetchAuthed will still work even when no token is stored — it just
    // omits the bearer header. That's what we want here since GET is public
    // but we'd like `likedByMe` populated when the user is logged in.
    const res = await fetchAuthed(url.toString());
    if (!res.ok) {
      console.warn('[postsService.listPosts] backend rejected:', res.status);
      return [];
    }
    const raw = (await res.json()) as ServerPost[];
    return Array.isArray(raw) ? raw.map(toMappedPost) : [];
  } catch (err) {
    console.warn('[postsService.listPosts] network error:', err);
    return [];
  }
}

/** POST /api/posts — returns the created post, or null on failure. */
export async function createPost(input: CreatePostInput): Promise<MappedPost | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      console.warn('[postsService.createPost] backend rejected:', res.status);
      return null;
    }
    const raw = (await res.json()) as ServerPost;
    return toMappedPost(raw);
  } catch (err) {
    console.warn('[postsService.createPost] network error:', err);
    return null;
  }
}

/** DELETE /api/posts/:id — returns true on success, false otherwise. */
export async function deletePost(id: string): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  try {
    const res = await fetchAuthed(`${base}/api/posts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('[postsService.deletePost] network error:', err);
    return false;
  }
}

/** POST /api/posts/:id/like — returns the new like state or null on failure. */
export async function likePost(id: string): Promise<{ likes: number; likedByMe: boolean } | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}/api/posts/${encodeURIComponent(id)}/like`, {
      method: 'POST',
    });
    if (!res.ok) return null;
    return (await res.json()) as { likes: number; likedByMe: boolean };
  } catch (err) {
    console.warn('[postsService.likePost] network error:', err);
    return null;
  }
}

/** POST /api/posts/:id/comments — returns the new comment or null on failure. */
export async function addComment(id: string, content: string): Promise<PostComment | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}/api/posts/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return null;
    return (await res.json()) as PostComment;
  } catch (err) {
    console.warn('[postsService.addComment] network error:', err);
    return null;
  }
}
