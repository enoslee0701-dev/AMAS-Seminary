// ptSyncService — cross-device backup for Pocket Theology state.
//
// localStorage stays the source of truth for instant boot; the backend row
// (PUT /api/pt/state) is a per-user backup that lets XP / streak / progress
// follow the user across devices. All calls are best-effort: without a
// backend or a signed-in user everything silently no-ops and the feature
// degrades to local-only (previous behavior).

import type { PTUserState, PTJournalEntry } from '../components/PocketTheology/types';
import { fetchAuthed, getAccessToken } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

/** True when both a backend and a signed-in user session are present. */
export function isPtSyncAvailable(): boolean {
  return apiBase().length > 0 && Boolean(getAccessToken());
}

/** GET the server copy. null → no backend / not signed in / no row / error. */
export async function fetchServerPtState(): Promise<PTUserState | null> {
  if (!isPtSyncAvailable()) return null;
  try {
    const res = await fetchAuthed(`${apiBase()}/api/pt/state`);
    if (!res.ok) return null;
    const body = (await res.json()) as { state?: PTUserState | null };
    return body.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Merge a local and a server PTUserState without losing progress from
 * either device. Field-wise union — "most progress wins":
 * - xp: max
 * - streak: the side with the later lastDate (ties → larger current);
 *   longest is always the overall max
 * - progress / badges / favorites: union (per-lesson: earliest completion
 *   kept, best score kept)
 * - journal: union by entry id, newest first
 * - scalar preferences (onboarded, dailyGoalMinutes, ...): local wins,
 *   server fills gaps
 */
export function mergePtState(local: PTUserState, server: PTUserState): PTUserState {
  const streak = (server.streak?.lastDate ?? '') > (local.streak?.lastDate ?? '')
    ? server.streak
    : (server.streak?.lastDate ?? '') === (local.streak?.lastDate ?? '') &&
        (server.streak?.current ?? 0) > (local.streak?.current ?? 0)
      ? server.streak
      : local.streak;

  const progress: PTUserState['progress'] = { ...server.progress };
  for (const [lessonId, entry] of Object.entries(local.progress ?? {})) {
    const other = progress[lessonId];
    if (!other) { progress[lessonId] = entry; continue; }
    progress[lessonId] = {
      status: 'completed',
      score: Math.max(entry.score ?? 0, other.score ?? 0),
      completedAt: entry.completedAt < other.completedAt ? entry.completedAt : other.completedAt,
    };
  }

  const journalById = new Map<string, PTJournalEntry>();
  for (const e of [...(server.journal ?? []), ...(local.journal ?? [])]) journalById.set(e.id, e);
  const journal = [...journalById.values()].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));

  return {
    ...server,
    ...local, // local scalar prefs win; explicit fields below override
    xp: Math.max(local.xp ?? 0, server.xp ?? 0),
    streak: {
      ...streak,
      longest: Math.max(local.streak?.longest ?? 0, server.streak?.longest ?? 0),
    },
    progress,
    badges: [...new Set([...(server.badges ?? []), ...(local.badges ?? [])])],
    favorites: [...new Set([...(server.favorites ?? []), ...(local.favorites ?? [])])],
    journal,
  };
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: PTUserState | null = null;

async function flushPush(): Promise<void> {
  const state = pendingState;
  pendingState = null;
  if (!state || !isPtSyncAvailable()) return;
  try {
    await fetchAuthed(`${apiBase()}/api/pt/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state }),
    });
  } catch {
    // Best-effort: next state change retries; localStorage still has it.
  }
}

/**
 * Debounced fire-and-forget upload. Rapid state changes (finishing a
 * lesson touches xp + streak + progress + badges) collapse into one PUT.
 */
export function schedulePtStatePush(state: PTUserState, debounceMs = 2000): void {
  if (!isPtSyncAvailable()) return;
  pendingState = state;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void flushPush(); }, debounceMs);
}
