// AMAS 共享祷告会 · 前端数据层（Phase 2）
//
// **服务器是唯一真相源。** 这里只负责取回与提交命令，
// 绝不在本地推导 currentItemId、startedAt、facilitator 或 status。
//
// 轮询节奏（§29）：active 3s / scheduled 10s / 无 session 15s；
// 页面隐藏时暂停，重新可见时立即 fetch。
// presence 的 10s 轮询与 20s 心跳保持不变，本模块不碰它们。

import { fetchAuthed } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export type SessionStatus = 'scheduled' | 'active' | 'ended';

export interface SessionItem {
  id: string;
  position: number;
  title: string;
  description: string | null;
  scriptureRef: string | null;
  scriptureText: string | null;
}

export interface PrayerSession {
  id: string;
  status: SessionStatus;
  startedAt: number | null;
  endedAt: number | null;
  revision: number;
  facilitator: { userId: string; name: string; avatar: string | null } | null;
  currentItemId: string | null;
  items: SessionItem[];
}

export interface SessionState {
  session: PrayerSession | null;
  capabilities: { canManageSession: boolean };
}

export const EMPTY_SESSION: SessionState = { session: null, capabilities: { canManageSession: false } };

/** 轮询间隔（毫秒）。§29 */
export const POLL_FOR = (s: PrayerSession | null): number =>
  s?.status === 'active' ? 3_000 : s?.status === 'scheduled' ? 10_000 : 15_000;

/** 服务端返回的业务错误码。前端必须区分展示，不能一律「操作失败」。§31 */
export type SessionErrorCode =
  | 'SESSION_STATE_CONFLICT' | 'SESSION_ENDED' | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_ACTIVE' | 'SESSION_ALREADY_ACTIVE' | 'ROOM_HAS_ACTIVE_SESSION'
  | 'LAST_ITEM' | 'ITEM_NOT_FOUND' | 'NOT_A_MEMBER' | 'INVALID_ITEMS'
  | 'FORBIDDEN' | 'RATE_LIMITED' | 'NETWORK';

export interface CommandResult {
  ok: boolean;
  status: number;
  code?: SessionErrorCode;
  state?: SessionState;
}

export const ERROR_TEXT: Record<SessionErrorCode, string> = {
  SESSION_STATE_CONFLICT: '祷告会状态已被其他管理者更新，已为你刷新到最新。',
  SESSION_ENDED: '这场祷告会已经结束了。',
  SESSION_NOT_FOUND: '找不到这场祷告会。',
  SESSION_NOT_ACTIVE: '祷告会尚未开始。',
  SESSION_ALREADY_ACTIVE: '祷告会已经在进行中了。',
  ROOM_HAS_ACTIVE_SESSION: '这个房间已经有一场祷告会正在进行。',
  LAST_ITEM: '已经是最后一项了。',
  ITEM_NOT_FOUND: '找不到这条祷告事项。',
  NOT_A_MEMBER: '带领者必须是本房间的成员。',
  INVALID_ITEMS: '请至少填写一条祷告事项。',
  FORBIDDEN: '你没有管理这场祷告会的权限。',
  RATE_LIMITED: '操作太快了，请稍等一下。',
  NETWORK: '网络不稳定，请稍后再试。',
};

async function call(path: string, init?: RequestInit): Promise<CommandResult> {
  const base = apiBase();
  if (!base) return { ok: false, status: 0, code: 'NETWORK' };
  try {
    const res = await fetchAuthed(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    let body: Record<string, unknown> | null = null;
    try { body = await res.json(); } catch { /* 空响应 */ }
    const state = body && 'capabilities' in body ? (body as unknown as SessionState) : undefined;
    if (res.ok) return { ok: true, status: res.status, state };
    const code = (body?.code as SessionErrorCode | undefined)
      ?? (res.status === 403 ? 'FORBIDDEN' : res.status === 429 ? 'RATE_LIMITED' : 'NETWORK');
    // 409 冲突时后端会带上最新状态，直接用它刷新界面
    return { ok: false, status: res.status, code, state };
  } catch {
    return { ok: false, status: 0, code: 'NETWORK' };
  }
}

const enc = encodeURIComponent;

export const fetchCurrentSession = (roomId: string) =>
  call(`/api/rooms/${enc(roomId)}/prayer-session/current`);

export const createSession = (roomId: string, items: { title: string; scriptureRef?: string; scriptureText?: string }[]) =>
  call(`/api/rooms/${enc(roomId)}/prayer-sessions`, { method: 'POST', body: JSON.stringify({ items }) });

const cmd = (roomId: string, sessionId: string, action: string, body: Record<string, unknown> = {}) =>
  call(`/api/rooms/${enc(roomId)}/prayer-sessions/${enc(sessionId)}/${action}`,
    { method: 'POST', body: JSON.stringify(body) });

export const startSession = (roomId: string, sid: string, expectedRevision: number) =>
  cmd(roomId, sid, 'start', { expectedRevision });
export const advanceSession = (roomId: string, sid: string, expectedRevision: number) =>
  cmd(roomId, sid, 'advance', { expectedRevision });
export const selectSessionItem = (roomId: string, sid: string, itemId: string, expectedRevision: number) =>
  cmd(roomId, sid, 'select-item', { itemId, expectedRevision });
export const setFacilitator = (roomId: string, sid: string, userId: string | null, expectedRevision: number) =>
  cmd(roomId, sid, 'facilitator', { userId, expectedRevision });
export const endSession = (roomId: string, sid: string, expectedRevision: number) =>
  cmd(roomId, sid, 'end', { expectedRevision });

/** 「祷告会已进行 18:32」。基准必须是 server 的 startedAt，刷新页面后仍正确。 */
export function elapsedText(startedAt: number | null, nowMs: number): string {
  if (!startedAt) return '';
  const s = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}
