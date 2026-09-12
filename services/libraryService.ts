/**
 * libraryService — thin wrapper around the backend's `/api/library/*`
 * surface.
 *
 * Reads of the catalog are public; writes/deletes require an admin user
 * JWT (or APP_SECRET service caller). Per-user favorites require any
 * authenticated user. Methods degrade to `null` / `[]` when the backend
 * is not configured or the request fails, so callers can fall back to a
 * local mock list without throwing.
 *
 * Shape mapping
 * -------------
 * Backend `BookRecord` shape:
 *     { id, title, author, category, coverImageId?, coverUrl?,
 *       publisher?, year?, description?, addedAt, addedBy }
 *
 * The current `LibraryView` component uses a richer client-side `Book`
 * shape that includes `type` (电子书/有声书/PDF) and a lucide `icon`
 * reference — neither of which is meaningful on the server. The server
 * shape is intentionally narrower; the component-level Book type is
 * assembled in LibraryView itself when it maps over `listBooks()` so
 * the icon stays a component concern. See `toClientBook()` below for
 * the shared default mapping.
 */
import { FileText, Headphones } from 'lucide-react';
import { fetchAuthed } from './authService';
import {
  apiOk, apiFail, failureFromResponse,
  type ApiResult,
} from './apiResult';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export function isBackendConfigured(): boolean {
  return apiBase().length > 0;
}

/** Server wire shape — what /api/library/books returns. */
export interface ServerBook {
  id: string;
  title: string;
  author: string;
  category: string;
  coverImageId?: string;
  coverUrl?: string;
  publisher?: string;
  year?: number;
  description?: string;
  addedAt: number;
  addedBy: string;
}

export interface CreateBookInput {
  title: string;
  author: string;
  category: string;
  coverImageId?: string;
  coverUrl?: string;
  publisher?: string;
  year?: number;
  description?: string;
}

export interface UpdateBookPatch {
  title?: string;
  author?: string;
  category?: string;
  coverImageId?: string | null;
  coverUrl?: string | null;
  publisher?: string | null;
  year?: number | null;
  description?: string | null;
}

/**
 * Client-side render shape used by LibraryView. The server doesn't
 * carry `type` or `icon`, so we derive sensible defaults here — the
 * UI lives entirely on the frontend.
 */
export type LibraryBookType = '电子书' | '有声书' | 'PDF';
export type LibraryCategory = '神学藏书' | '宣教资料库';

export interface ClientBook {
  id: string;
  title: string;
  author: string;
  type: LibraryBookType;
  category: LibraryCategory;
  description: string;
  icon: typeof FileText;
}

/**
 * Map a server book to the LibraryView client shape. Server categories
 * that don't match the two known UI buckets default to '神学藏书' so the
 * row still renders. `type` defaults to '电子书'; if the description /
 * coverUrl hints at audio we surface that instead.
 */
export function toClientBook(b: ServerBook): ClientBook {
  const category: LibraryCategory =
    b.category === '宣教资料库' ? '宣教资料库' : '神学藏书';
  // Server has no explicit 'type' field — infer from description text so
  // existing audio books keep their headphones icon. Falls back to 电子书.
  const desc = (b.description ?? '').toLowerCase();
  let type: LibraryBookType = '电子书';
  if (/audio|audiobook|有声/.test(desc)) {
    type = '有声书';
  } else if (/\bpdf\b/.test(desc) || /pdf/.test(b.coverUrl ?? '')) {
    type = 'PDF';
  }
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    type,
    category,
    description: b.description ?? '',
    icon: type === '有声书' ? Headphones : FileText,
  };
}

/**
 * GET /api/library/books — public。
 *
 * 失败带原因回去（见 ./apiResult）。原来是 `null`，调用方只知道「没拿到」，
 * 于是界面默默换上六本写死的示例书，一个字都不说 —— 用户没有任何办法
 * 知道那不是学院的书目。原因分出来之后，界面才能说准是哪种失败。
 *
 * **空数组是服务端的真答复**（「一本都没有」），不是失败。原来的注释写着
 * 空数组也该走本地 mock —— 那等于凭空变出六本库存，不再这么做；
 * 由调用方按「真的空」处理。
 */
export async function listBooks(q?: string): Promise<ApiResult<ClientBook[]>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const url = new URL(`${base}/api/library/books`);
    if (q && q.trim()) url.searchParams.set('q', q.trim());
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn('[libraryService.listBooks] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    const raw = (await res.json()) as ServerBook[];
    if (!Array.isArray(raw)) {
      console.warn('[libraryService.listBooks] unexpected body shape');
      return apiFail('server-error', res.status);
    }
    return apiOk(raw.map(toClientBook));
  } catch (err) {
    console.warn('[libraryService.listBooks] network error:', err);
    return apiFail('network');
  }
}

/**
 * POST /api/library/books — admin only.
 *
 * 失败时带回**原因**（见 ./apiResult）。原来这里 401 / 403 / 503 / 网络
 * 一律回 null，界面只好说「可能没权限，也可能没连上」—— 而未配 staging 时
 * 这个端点实际回的是 503（服务器答了），说成「没连上」是错的。
 */
export async function createBook(input: CreateBookInput): Promise<ApiResult<ClientBook>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetchAuthed(`${base}/api/library/books`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      console.warn('[libraryService.createBook] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    const raw = (await res.json()) as ServerBook;
    return apiOk(toClientBook(raw));
  } catch (err) {
    console.warn('[libraryService.createBook] network error:', err);
    return apiFail('network');
  }
}

/** PATCH /api/library/books/:id — admin only. */
export async function updateBook(
  id: string,
  patch: UpdateBookPatch,
): Promise<ApiResult<ClientBook>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetchAuthed(`${base}/api/library/books/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      console.warn('[libraryService.updateBook] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    const raw = (await res.json()) as ServerBook;
    return apiOk(toClientBook(raw));
  } catch (err) {
    console.warn('[libraryService.updateBook] network error:', err);
    return apiFail('network');
  }
}

/** DELETE /api/library/books/:id — admin only. */
export async function deleteBook(id: string): Promise<ApiResult<true>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetchAuthed(`${base}/api/library/books/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      console.warn('[libraryService.deleteBook] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    return apiOk(true as const);
  } catch (err) {
    console.warn('[libraryService.deleteBook] network error:', err);
    return apiFail('network');
  }
}

/**
 * POST /api/library/favorites/:bookId — auth required.
 * Returns the new `{ favorited }` state, or `null` if the backend
 * is unreachable / rejected the call (so the caller can revert an
 * optimistic UI flip).
 */
export async function toggleFavorite(bookId: string): Promise<{ favorited: boolean } | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}/api/library/favorites/${encodeURIComponent(bookId)}`, {
      method: 'POST',
    });
    if (!res.ok) {
      console.warn('[libraryService.toggleFavorite] backend rejected:', res.status);
      return null;
    }
    const body = (await res.json()) as { favorited: boolean; count: number };
    return { favorited: !!body.favorited };
  } catch (err) {
    console.warn('[libraryService.toggleFavorite] network error:', err);
    return null;
  }
}

/**
 * GET /api/library/favorites — auth required.
 * Returns an array of book ids the calling user has favorited. Returns
 * `[]` on any failure so callers can safely use it as a seed Set.
 */
export async function listFavorites(): Promise<string[]> {
  const base = apiBase();
  if (!base) return [];
  try {
    const res = await fetchAuthed(`${base}/api/library/favorites`);
    if (!res.ok) {
      console.warn('[libraryService.listFavorites] backend rejected:', res.status);
      return [];
    }
    const raw = (await res.json()) as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch (err) {
    console.warn('[libraryService.listFavorites] network error:', err);
    return [];
  }
}
