// AMAS 祷告会历史沉淀 · 前端数据层（Phase 5）
//
// 只读。这里唯一的职责是把后端的纪要原样取回来。
//
// **不在本地合成任何后端没给的数字。**
// 尤其是参与人数、累计人次这类——后端不返回这些字段，因为
// room_presence 只存当下不存历史（见 docs/PRAYER_ROOM_PHASE5_AUDIT.md §2.4）。
// 前端也不许用 presence 的当前人数去顶替，那会做出一个看起来很真实的假数字。

import { fetchAuthed } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

const enc = encodeURIComponent;

export interface HistoryEntry {
  id: string;
  title: string | null;
  startedAt: number | null;
  endedAt: number | null;
  /** 起止都有才算得出；否则为 null，UI 显示「未记录」而不是 0 分钟。 */
  durationMs: number | null;
  /** **实际进行过**的项数，不是计划项数。 */
  visitedItemCount: number;
  facilitator: { userId: string; name: string; avatar: string | null } | null;
}

export interface HistoryPage {
  sessions: HistoryEntry[];
  /** 还有下一页时给出游标（上一页最后一条的 endedAt）；null 表示到底了。 */
  nextBefore: number | null;
  serverNow: number;
}

/** 实际带领过的一段。同一项被来回切换会出现多段——那是事实，不合并。 */
export interface JourneySegment {
  itemId: string;
  title: string;
  description: string | null;
  scriptureRef: string | null;
  scriptureText: string | null;
  enteredAt: number;
  /** null = 这一段没有闭合（会话未正常结束）。不猜时长。 */
  durationMs: number | null;
}

export interface SummaryShare {
  id: string;
  /** 匿名时为 null——包括房主与 moderator 也拿不到（SEC-3 §9）。 */
  userId: string | null;
  isAnonymous: boolean;
  isMine: boolean;
  text: string;
  createdAt: number;
  intercessions: number;
  didIntercede: boolean;
}

export interface SessionSummary {
  session: {
    id: string;
    title: string | null;
    startedAt: number | null;
    endedAt: number | null;
    durationMs: number | null;
    facilitator: { userId: string; name: string; avatar: string | null } | null;
  };
  journey: JourneySegment[];
  /** 计划了但从未进行的项目。既不丢弃也不混进 journey。 */
  notVisited: { itemId: string; title: string; scriptureRef: string | null }[];
  /** 祷告会**进行期间**分享的代祷（时间窗归属，不是主观归属）。 */
  shares: SummaryShare[];
  serverNow: number;
}

export type HistoryErrorCode = 'NOT_FOUND' | 'NOT_ENDED' | 'FORBIDDEN' | 'NETWORK';

export interface HistoryResult<T> {
  ok: boolean;
  data?: T;
  code?: HistoryErrorCode;
}

async function get<T>(path: string): Promise<HistoryResult<T>> {
  try {
    const res = await fetchAuthed(`${apiBase()}${path}`);
    if (res.ok) return { ok: true, data: (await res.json()) as T };
    let code: HistoryErrorCode = 'NETWORK';
    if (res.status === 404) code = 'NOT_FOUND';
    else if (res.status === 409) code = 'NOT_ENDED';
    else if (res.status === 403 || res.status === 401) code = 'FORBIDDEN';
    return { ok: false, code };
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
}

export const fetchHistory = (roomId: string, opts: { limit?: number; before?: number } = {}) => {
  const q = new URLSearchParams();
  if (opts.limit) q.set('limit', String(opts.limit));
  if (opts.before) q.set('before', String(opts.before));
  const qs = q.toString();
  return get<HistoryPage>(`/api/rooms/${enc(roomId)}/prayer-sessions/history${qs ? `?${qs}` : ''}`);
};

export const fetchSummary = (roomId: string, sessionId: string) =>
  get<SessionSummary>(`/api/rooms/${enc(roomId)}/prayer-sessions/${enc(sessionId)}/summary`);

/**
 * 继续为某条代祷登记 / 取消登记。
 *
 * 复用现有的 prayer_intercessions（一人一条、可取消），挂在**代祷事项**上
 * 而不是议程项上：议程项是会议结构，代祷事项才是「求主医治我母亲」
 * 这种需要有人继续记念的东西。
 */
export async function toggleIntercede(roomId: string, shareId: string, on: boolean):
Promise<{ ok: boolean; intercessions?: number; didIntercede?: boolean }> {
  try {
    const res = await fetchAuthed(
      `${apiBase()}/api/rooms/${enc(roomId)}/prayer/shares/${enc(shareId)}/intercede`,
      { method: on ? 'POST' : 'DELETE' },
    );
    if (!res.ok) return { ok: false };
    const b = (await res.json()) as { intercessions?: number; didIntercede?: boolean };
    return { ok: true, intercessions: b.intercessions, didIntercede: b.didIntercede };
  } catch {
    return { ok: false };
  }
}

// ---------- 时间格式化 ----------

/**
 * 「38 分钟」「1 小时 12 分钟」。
 *
 * `null` 一律返回 null，由调用方显示「未记录」。
 * **不把未知时长渲染成 0 分钟**——0 是一个具体的断言，未知不是。
 */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '不到 1 分钟';
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`;
}

/** 「9月3日 晚上 8:15」。跨年时补上年份。 */
export function formatSessionDate(ts: number | null, serverNow?: number): string | null {
  if (ts === null || !Number.isFinite(ts)) return null;
  const d = new Date(ts);
  const ref = new Date(serverNow ?? Date.now());
  const y = d.getFullYear() === ref.getFullYear() ? '' : `${d.getFullYear()}年`;
  const hh = d.getHours();
  const period = hh < 6 ? '凌晨' : hh < 12 ? '早上' : hh < 14 ? '中午' : hh < 18 ? '下午' : '晚上';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}${d.getMonth() + 1}月${d.getDate()}日 ${period} ${h12}:${mm}`;
}
