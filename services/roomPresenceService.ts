// AMAS 房间在线状态 · 前端数据层（P1-1）
//
// 服务的是读经室 / 讲道室 / 赞美室 / 交通室。祷告室有自己的聚合接口
// （一次取回主题 + 在线 + 分享），继续走 prayerRoomService，不改。
//
// **这里只管在线状态。** 没有 speaker、没有「正在说话」、没有举手、
// 没有麦克风 —— 那些能力目前不存在，所以类型里也没有对应字段。

import { fetchAuthed } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

/** 后端未配置时，房间的多人功能整体不可用——不伪装成已联通。 */
export const isRoomBackendConfigured = (): boolean => apiBase().length > 0;

/** 与后端 PRESENCE_HEARTBEAT_MS 对应。 */
export const HEARTBEAT_MS = 20_000;
/** 在线名单轮询间隔。与祷告室同一档。 */
export const PRESENCE_POLL_MS = 10_000;

export interface RoomPresenceEntry {
  userId: string;
  name: string;
  avatar: string | null;
  /**
   * 'host' | 'listener'。**不表示音频状态**——'listener' 只是「不是房主」的
   * 历史字段名，不代表这个人正在听，房间里也没有声音可听。
   */
  role: string;
}

export interface RoomPresenceState {
  presence: RoomPresenceEntry[];
  /** = presence.length。同账号多设备在数据库里只有一行，天然算 1 人。 */
  onlineCount: number;
  serverTime: number;
}

const enc = encodeURIComponent;

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
    return null;
  }
}

/**
 * 建立 membership。没有它，后续 presence 接口一律 403。
 * 身份完全来自 JWT —— 这里不发送任何 userId / role / name / avatar。
 */
export const joinRoom = (roomId: string) =>
  call<{ ok: boolean; roomId: string; memberCount: number }>(
    `/api/rooms/${enc(roomId)}/join`, { method: 'POST' },
  );

/**
 * 显式离开房间：解除 membership。
 * **只在用户主动退出时调用**，收起房间 / 切后台 / 断网都不该走这里。
 */
export const leaveRoom = (roomId: string) =>
  call<{ ok: boolean }>(`/api/rooms/${enc(roomId)}/leave`, { method: 'POST' });

export const fetchPresence = (roomId: string) =>
  call<RoomPresenceState>(`/api/rooms/${enc(roomId)}/presence`);

export const sendHeartbeat = (roomId: string) =>
  call<{ ok: boolean }>(`/api/rooms/${enc(roomId)}/presence/heartbeat`, { method: 'POST' });

/** 只清在线状态，保留 membership。组件卸载时调这个。 */
export const clearPresence = (roomId: string) =>
  call<{ ok: boolean }>(`/api/rooms/${enc(roomId)}/presence`, { method: 'DELETE' });
