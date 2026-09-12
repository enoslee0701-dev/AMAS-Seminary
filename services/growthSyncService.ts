// growthSyncService — 基督徒成长档案的跨设备同步。
//
// 档案（Christian Profile 评估 + 事奉倾向 + 实践证据）以一份版本化 JSON 存储：
// localStorage 供即时启动，后端 /api/growth/state 作为共享存储（App 与
// 未来的 Web Discover 入口读写同一份）。合并策略：completedAt 较新者胜。
// 未登录 / 未配置后端时静默降级为本地模式。

import { fetchAuthed, getAccessToken } from './authService';
import { getAssessmentIdentity } from './assessmentStorage';

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
/* 这份待上报的档案属于**排队那一刻**的身份。防抖有 1500ms，
   期间足够换一个人登录；那时再 PUT 出去，用的是新登录者的 token，
   等于把上一个人的档案写进这个人的账号。所以排队时把归属记下来，
   真要发之前再核一次，对不上就丢掉这次上报。
   （这条竞态用本地可控延迟夹具在存储层复现过；跨账号那一段需要真实后端
   与两个账号，没有实测，只按机制处理。） */
let pendingOwner: string | null = null;

async function flush(): Promise<void> {
  const state = pending;
  const owner = pendingOwner;
  pending = null;
  pendingOwner = null;
  if (!state || !isGrowthSyncAvailable()) return;
  if (getAssessmentIdentity() !== owner) return;   // 换人了，这份不是他的
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
  pendingOwner = getAssessmentIdentity();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void flush(); }, debounceMs);
}
