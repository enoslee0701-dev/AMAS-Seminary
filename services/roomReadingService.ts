// AMAS 读经室共享阅读位置 · 前端数据层（P1-2）
//
// **只传位置，不传经文正文。** 正文由阅读器自己从 public/scripture/cuv.json 取。
//
// book 是**中文书名**（「约翰福音」），与 cuv.json 的键、constants.ts 的
// BIBLE_STRUCTURE、loadScripture(book, chapter) 完全同一套标识。
// 前端不做任何 book 名到数字 id 的转换——转换就意味着第二套映射。

import { fetchAuthed } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export const isReadingBackendConfigured = (): boolean => apiBase().length > 0;

/**
 * 共享阅读位置的轮询间隔。
 *
 * 比 presence 的 10s 明显更及时——主持人说「我们一起看罗马书八章」时，
 * 房间里的人不该等十秒。但也没必要疯狂请求：3 秒是够用的起点。
 */
export const READING_POLL_MS = 3_000;

export interface ReadingPosition {
  /** 中文书名，如「约翰福音」。 */
  book: string;
  chapter: number;
  /** 当前阅读器按章显示，通常为 null。 */
  verse: number | null;
  /** 乐观并发用。PUT 时原样带回。 */
  revision: number;
  updatedAt: number;
  updatedByName: string | null;
}

export interface ReadingState {
  /** null = 尚未设置共同阅读位置。这是合法状态，不是错误。 */
  position: ReadingPosition | null;
  /**
   * 能否发布房间阅读位置。**由服务端 requireRoomManager 判定**，
   * 前端只做显示，不据此放行任何写操作——真正的门在服务端。
   */
  capabilities: { canPublish: boolean };
  serverTime: number;
}

export type ReadingErrorCode =
  | 'CONFLICT'          // 别的 moderator 抢先改了
  | 'FORBIDDEN'         // 不是 manager
  | 'NOT_SUPPORTED'     // 该房间没有共享阅读位置
  | 'INVALID'           // 位置非法
  | 'UNAVAILABLE'       // 服务端数据集或数据库故障
  | 'NETWORK';

export interface ReadingResult {
  ok: boolean;
  state?: ReadingState;
  code?: ReadingErrorCode;
}

const enc = encodeURIComponent;

function classify(status: number, code?: string): ReadingErrorCode {
  if (status === 409) return 'CONFLICT';
  if (status === 403 || status === 401) return 'FORBIDDEN';
  if (status === 404) return 'NOT_SUPPORTED';
  if (status === 400) return 'INVALID';
  if (status === 503 || status === 500) return 'UNAVAILABLE';
  return code ? 'UNAVAILABLE' : 'NETWORK';
}

async function call(path: string, init?: RequestInit): Promise<ReadingResult> {
  const base = apiBase();
  if (!base) return { ok: false, code: 'NETWORK' };
  try {
    const res = await fetchAuthed(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    let body: (ReadingState & { code?: string }) | null = null;
    try { body = await res.json(); } catch { /* 空响应 */ }
    if (res.ok) return { ok: true, state: body ?? undefined };
    // 409 时后端会带上最新状态，直接用来刷新界面
    return { ok: false, code: classify(res.status, body?.code), state: body ?? undefined };
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
}

export const fetchReadingPosition = (roomId: string) =>
  call(`/api/rooms/${enc(roomId)}/reading-position`);

/**
 * 发布房间共同阅读位置。**只有主持人显式点「带领大家读这里」才调用。**
 * 绝不因为本地翻页自动触发。
 */
export const publishReadingPosition = (
  roomId: string, book: string, chapter: number,
  opts: { verse?: number | null; expectedRevision?: number } = {},
) => call(`/api/rooms/${enc(roomId)}/reading-position`, {
  method: 'PUT',
  body: JSON.stringify({
    book, chapter,
    verse: opts.verse ?? null,
    ...(opts.expectedRevision !== undefined ? { expectedRevision: opts.expectedRevision } : {}),
  }),
});

/** 「罗马书 8」/「约翰福音 3:16」。 */
export function formatLocation(p: { book: string; chapter: number; verse?: number | null } | null): string {
  if (!p) return '';
  return p.verse ? `${p.book} ${p.chapter}:${p.verse}` : `${p.book} ${p.chapter}`;
}
