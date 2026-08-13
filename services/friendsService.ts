/**
 * friendsService — thin wrapper around the backend's `/api/friends` surface.
 *
 * Mirrors the pattern in `postsService` / `cooperationService`:
 *   - Every method returns `null` / `[]` / `false` on failure so the caller
 *     can stay in fallback (decorative) mode without throwing.
 *   - `isBackendConfigured()` lets callers skip side-effects entirely when
 *     `VITE_API_BASE_URL` is unset (local-only dev / offline mode).
 */

import { fetchAuthed } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export function isBackendConfigured(): boolean {
  return apiBase().length > 0;
}

/** Pending request as it appears in the *incoming* list (sender side info). */
export interface IncomingRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar?: string;
  fromUserRole: string;
  createdAt: number;
}

/** Pending request as it appears in the *outgoing* list (target side info). */
export interface OutgoingRequest {
  id: string;
  toUserId: string;
  toUserName: string;
  toUserAvatar?: string;
  toUserRole: string;
  createdAt: number;
}

/** Friend (public user) record returned by GET /api/friends. */
export interface FriendUser {
  id: string;
  name: string;
  avatar?: string;
  role: string;
}

/** POST /api/friends/requests — returns the new request id, or null on failure. */
export async function sendFriendRequest(targetUserId: string): Promise<string | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}/api/friends/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    });
    if (!res.ok) {
      console.warn('[friendsService.sendFriendRequest] backend rejected:', res.status);
      return null;
    }
    const body = (await res.json()) as { id?: string };
    return typeof body.id === 'string' ? body.id : null;
  } catch (err) {
    console.warn('[friendsService.sendFriendRequest] network error:', err);
    return null;
  }
}

/** DELETE /api/friends/requests/:id — sender cancels their pending request. */
export async function cancelFriendRequest(requestId: string): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  try {
    const res = await fetchAuthed(`${base}/api/friends/requests/${encodeURIComponent(requestId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('[friendsService.cancelFriendRequest] network error:', err);
    return false;
  }
}

/** POST /api/friends/requests/:id/accept — target accepts. */
export async function acceptFriendRequest(requestId: string): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  try {
    const res = await fetchAuthed(`${base}/api/friends/requests/${encodeURIComponent(requestId)}/accept`, {
      method: 'POST',
    });
    return res.ok;
  } catch (err) {
    console.warn('[friendsService.acceptFriendRequest] network error:', err);
    return false;
  }
}

/** POST /api/friends/requests/:id/reject — target rejects. */
export async function rejectFriendRequest(requestId: string): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  try {
    const res = await fetchAuthed(`${base}/api/friends/requests/${encodeURIComponent(requestId)}/reject`, {
      method: 'POST',
    });
    return res.ok;
  } catch (err) {
    console.warn('[friendsService.rejectFriendRequest] network error:', err);
    return false;
  }
}

/** GET /api/friends/requests/incoming — pending requests addressed to the caller. */
export async function listIncoming(): Promise<IncomingRequest[]> {
  const base = apiBase();
  if (!base) return [];
  try {
    const res = await fetchAuthed(`${base}/api/friends/requests/incoming`);
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown;
    return Array.isArray(raw) ? (raw as IncomingRequest[]) : [];
  } catch (err) {
    console.warn('[friendsService.listIncoming] network error:', err);
    return [];
  }
}

/** GET /api/friends/requests/outgoing — pending requests the caller has sent. */
export async function listOutgoing(): Promise<OutgoingRequest[]> {
  const base = apiBase();
  if (!base) return [];
  try {
    const res = await fetchAuthed(`${base}/api/friends/requests/outgoing`);
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown;
    return Array.isArray(raw) ? (raw as OutgoingRequest[]) : [];
  } catch (err) {
    console.warn('[friendsService.listOutgoing] network error:', err);
    return [];
  }
}

/** GET /api/friends — caller's established friendships. */
export async function listFriends(): Promise<FriendUser[]> {
  const base = apiBase();
  if (!base) return [];
  try {
    const res = await fetchAuthed(`${base}/api/friends`);
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown;
    return Array.isArray(raw) ? (raw as FriendUser[]) : [];
  } catch (err) {
    console.warn('[friendsService.listFriends] network error:', err);
    return [];
  }
}

/** DELETE /api/friends/:userId — unfriend. Returns true on success. */
export async function unfriend(userId: string): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  try {
    const res = await fetchAuthed(`${base}/api/friends/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('[friendsService.unfriend] network error:', err);
    return false;
  }
}
