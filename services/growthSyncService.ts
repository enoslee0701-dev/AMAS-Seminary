// growthSyncService — 基督徒成长档案的跨设备同步。
//
// 档案（Christian Profile 评估 + 事奉倾向 + 实践证据）以一份版本化 JSON 存储：
// localStorage 供即时启动，后端 /api/growth/state 作为共享存储（App 与
// 未来的 Web Discover 入口读写同一份）。合并策略：completedAt 较新者胜。
// 未登录 / 未配置后端时静默降级为本地模式。

import { fetchAuthed, getAccessToken } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export function isGrowthSyncAvailable(): boolean {
  return apiBase().length > 0 && Boolean(getAccessToken());
}

export async function fetchServerGrowth<T>(): Promise<T | null> {
  if (!isGrowthSyncAvailable()) return null;
  try {
    const res = await fetchAuthed(`${apiBase()}/api/growth/state`);
    if (!res.ok) return null;
    const body = (await res.json()) as { state?: T | null };
    return body.state ?? null;
  } catch {
    return null;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: unknown = null;

async function flush(): Promise<void> {
  const state = pending;
  pending = null;
  if (!state || !isGrowthSyncAvailable()) return;
  try {
    await fetchAuthed(`${apiBase()}/api/growth/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state }),
    });
  } catch { /* best-effort — localStorage still has it */ }
}

/** 防抖上报（评估完成 / 档案更新 / 撤销时调用）。 */
export function scheduleGrowthPush(state: unknown, debounceMs = 1500): void {
  if (!isGrowthSyncAvailable()) return;
  pending = state;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void flush(); }, debounceMs);
}
