/**
 * announcementsService — wrapper around the backend's `/api/announcements`
 * surface.
 *
 * Reads are public; writes/deletes require an admin user JWT and so go
 * through `authService.fetchAuthed`. As with the other services, every
 * method degrades gracefully (null / empty array) when the backend is
 * not configured or fails, so the UI can fall back to its existing local
 * behavior.
 *
 * Shape mapping
 * -------------
 * The backend's `AnnouncementRecord` is
 *     { id, title, content, type: 'important' | 'normal',
 *       publishedAt: number, publishedBy: string }
 * but the frontend's `NewsItem` is
 *     { id, title, content?, type: 'Notice' | 'Event' | 'Urgent',
 *       date: string }
 * So this service translates wire shapes into `NewsItem` (and back) on the
 * way in/out, keeping the React components unchanged.
 */

import { fetchAuthed } from './authService';
import {
  apiOk, apiFail, failureFromResponse,
  type ApiResult,
} from './apiResult';
import type { NewsItem } from '../types';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export function isBackendConfigured(): boolean {
  return apiBase().length > 0;
}

export type AnnouncementType = 'important' | 'normal';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  publishedAt: number;
  publishedBy: string;
}

export interface CreateAnnouncementInput {
  title: string;
  content: string;
  type?: AnnouncementType;
}

/**
 * Map a backend `AnnouncementRecord` to the frontend `NewsItem` shape used
 * by `AnnouncementsView` / `Dashboard`. `type === 'important'` becomes
 * `'Urgent'` since the UI surfaces that with the red badge; everything
 * else becomes `'Notice'` (the default neutral style).
 */
function toNewsItem(a: Announcement): NewsItem {
  const date = new Date(a.publishedAt);
  // YYYY-MM-DD, matches the format used by MOCK_NEWS and the admin form.
  const iso = Number.isFinite(date.getTime())
    ? date.toISOString().split('T')[0]
    : '';
  return {
    id: a.id,
    title: a.title,
    date: iso,
    type: a.type === 'important' ? 'Urgent' : 'Notice',
    content: a.content,
  };
}

/**
 * Map frontend NewsItem `type` ('Notice' | 'Event' | 'Urgent') to the
 * backend's reduced ('important' | 'normal') vocabulary so the create
 * endpoint accepts it. Only `'Urgent'` → `'important'`; the others fall
 * through to `'normal'`.
 */
function toBackendType(t: NewsItem['type']): AnnouncementType {
  return t === 'Urgent' ? 'important' : 'normal';
}

/**
 * GET /api/announcements — public。
 *
 * 失败带原因回去。原来回 `[]`，调用方分不出「服务端说一条都没有」和
 * 「压根没问到」 —— 于是 App 保留本地那份（可能是 MOCK_NEWS 里写死的示例
 * 公告），界面一个字都不说。公告是发给所有人看的东西，把示例公告摆在那儿
 * 当真公告，比书目那边更糟。
 */
export async function listAnnouncements(): Promise<ApiResult<NewsItem[]>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetch(`${base}/api/announcements`);
    if (!res.ok) {
      console.warn('[announcementsService.listAnnouncements] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    const raw = (await res.json()) as Announcement[];
    if (!Array.isArray(raw)) {
      console.warn('[announcementsService.listAnnouncements] unexpected body shape');
      return apiFail('server-error', res.status);
    }
    return apiOk(raw.map(toNewsItem));
  } catch (err) {
    console.warn('[announcementsService.listAnnouncements] network error:', err);
    return apiFail('network');
  }
}

/**
 * POST /api/announcements — admin only.
 * Accepts a `NewsItem`-shaped input (what the AnnouncementsView form
 * already produces) and translates to the backend wire shape. Returns
 * the created item back in `NewsItem` form, or `null` on failure.
 */
export async function createAnnouncement(input: {
  title: string;
  content?: string;
  type: NewsItem['type'];
}): Promise<ApiResult<NewsItem>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetchAuthed(`${base}/api/announcements`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        content: input.content ?? '',
        type: toBackendType(input.type),
      }),
    });
    if (!res.ok) {
      console.warn('[announcementsService.createAnnouncement] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    const raw = (await res.json()) as Announcement;
    return apiOk(toNewsItem(raw));
  } catch (err) {
    console.warn('[announcementsService.createAnnouncement] network error:', err);
    return apiFail('network');
  }
}

/** DELETE /api/announcements/:id — admin only. */
export async function deleteAnnouncement(id: string): Promise<ApiResult<true>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetchAuthed(`${base}/api/announcements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      console.warn('[announcementsService.deleteAnnouncement] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    return apiOk(true as const);
  } catch (err) {
    console.warn('[announcementsService.deleteAnnouncement] network error:', err);
    return apiFail('network');
  }
}
