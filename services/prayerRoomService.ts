// AMAS 祷告室 · 前端数据层
//
// 决策记录（docs/PRAYER_ROOM_REDESIGN.md）：
//  D1 轮询档：10 秒拉一次 GET /api/rooms/:id/prayer（单接口取回全部状态），
//     心跳 20 秒一次。祷告室不需要抢红包级实时，这一档足够且不用改服务器架构。
//  B  「代祷」不是点赞：intercede 返回的是「多少人正在为此祷告」。
//  E  祷告分享仅房内可见、支持匿名、发布者与房主可删。
//
// 后端未配置（VITE_API_BASE_URL 为空）时全部降级为本地空状态，
// UI 会显示「祷告室的多人功能需要连接服务器」，不伪装成已联通。

import { fetchAuthed } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}
export const isPrayerBackendConfigured = (): boolean => apiBase().length > 0;

export const POLL_MS = 10_000;
export const HEARTBEAT_MS = 20_000;

export interface PrayerTopic { id: string; seq: number; text: string }

export interface PrayerPresence {
  userId: string;
  name: string;
  avatar: string | null;
  role: 'host' | 'admin' | 'speaker' | 'listener';
}

export interface PrayerShare {
  id: string;
  /** 匿名分享时为 null——后端不会把发布者透给任何人 */
  userId: string | null;
  isAnonymous: boolean;
  /** 我是不是发布者（决定能否删除；匿名时也成立） */
  isMine: boolean;
  text: string;
  createdAt: number;
  /** 正在为此代祷的人数。这不是点赞数。 */
  intercessions: number;
  didIntercede: boolean;
}

export interface PrayerRoomState {
  topics: PrayerTopic[];
  presence: PrayerPresence[];
  shares: PrayerShare[];
  isHost: boolean;
  serverTime: number;
}

export const EMPTY_STATE: PrayerRoomState = {
  topics: [], presence: [], shares: [], isHost: false, serverTime: 0,
};

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;               // 网络失败静默降级，保留上一次的界面状态
  }
}

/** 一次取回整个祷告室状态。轮询就调这一个。 */
export const fetchPrayerRoom = (roomId: string) =>
  call<PrayerRoomState>(`/api/rooms/${encodeURIComponent(roomId)}/prayer`);

/** 房主整体替换本次祷告主题。 */
export const savePrayerTopics = (roomId: string, topics: string[]) =>
  call<{ ok: boolean; topics: PrayerTopic[] }>(
    `/api/rooms/${encodeURIComponent(roomId)}/prayer/topics`,
    { method: 'PUT', body: JSON.stringify({ topics }) },
  );

export const postPrayerShare = (roomId: string, text: string, isAnonymous = false) =>
  call<{ ok: boolean; id: string }>(
    `/api/rooms/${encodeURIComponent(roomId)}/prayer/shares`,
    { method: 'POST', body: JSON.stringify({ text, isAnonymous }) },
  );

export const deletePrayerShare = (roomId: string, shareId: string) =>
  call<{ ok: boolean }>(
    `/api/rooms/${encodeURIComponent(roomId)}/prayer/shares/${encodeURIComponent(shareId)}`,
    { method: 'DELETE' },
  );

/** 登记 / 取消「我为你祷告」。 */
export const setIntercession = (roomId: string, shareId: string, on: boolean) =>
  call<{ ok: boolean; intercessions: number; didIntercede: boolean }>(
    `/api/rooms/${encodeURIComponent(roomId)}/prayer/shares/${encodeURIComponent(shareId)}/intercede`,
    { method: on ? 'POST' : 'DELETE' },
  );

export const sendHeartbeat = (roomId: string, name: string, avatar?: string, role?: string) =>
  call<{ ok: boolean }>(
    `/api/rooms/${encodeURIComponent(roomId)}/prayer/heartbeat`,
    { method: 'POST', body: JSON.stringify({ name, avatar, role }) },
  );

export const leavePresence = (roomId: string) =>
  call<{ ok: boolean }>(
    `/api/rooms/${encodeURIComponent(roomId)}/prayer/presence`, { method: 'DELETE' },
  );

/** 「5 分钟前」。服务器时间为基准，避免客户端时钟偏差导致「-3 分钟前」。 */
export function relativeTime(at: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - at) / 1000));
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}
