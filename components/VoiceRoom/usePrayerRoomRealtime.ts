import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAuthed } from '../../services/authService';

/**
 * 祷告室 Realtime 通道（Phase 3）。
 *
 * ## 定位：Realtime 不是新的 State Store
 * 它只回答「服务器有东西变了」。收到事件后**不** setState(event.payload)，
 * 而是 invalidate → 回 REST 拿 canonical state。因此重复、乱序、reconnect replay
 * 都不会造成重复代祷 / 重复计数 / 重复推进（§26）。
 *
 * ## Transport：authenticated fetch streaming
 * 本项目 JWT 只走 Authorization 头，而 EventSource / WebSocket 都不能设自定义头，
 * 用它们就得把 token 放 URL。这里用 fetch + ReadableStream 读 SSE 文本流。
 *
 * ## 三条纪律
 * 1. 连接就绪后**立即 full refresh**——连接建立前发生的变化不能遗漏（§10）。
 * 2. 短时间内多个同类事件做 coalescing（120ms），只 refresh 一次（§11）。
 * 3. 页面重新可见时**立即 authoritative refresh**，不靠事件慢慢追赶（§15/§16）。
 *
 * 断线时静默重连（指数退避 + 抖动），**不显示吓人的「离线」全屏提示**（§13）；
 * polling 作为自愈通道保留，由 `healthy` 驱动快慢档（§14）。
 */

export type RoomEventType = 'session.changed' | 'prayer.changed' | 'theme.changed' | 'moderation.changed';

export interface RealtimeHandlers {
  onSession?: () => void;
  onPrayer?: () => void;
  onTheme?: () => void;
  onModeration?: () => void;
  /** 连接就绪 / 重新可见时的全量刷新 */
  onFullRefresh?: () => void;
}

const COALESCE_MS = 120;
const MAX_BACKOFF_MS = 30_000;

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export function usePrayerRoomRealtime(roomId: string, enabled: boolean, handlers: RealtimeHandlers) {
  const [healthy, setHealthy] = useState(false);
  const [lastEventId, setLastEventId] = useState(0);
  const hRef = useRef(handlers);
  hRef.current = handlers;

  const cursor = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const retry = useRef(0);
  const alive = useRef(true);
  const pendingTypes = useRef<Set<RoomEventType>>(new Set());
  const coalesceTimer = useRef<number>(0);

  /** §11 合并短时间内的多个事件，最后只刷新一次。 */
  const scheduleInvalidate = useCallback((type: RoomEventType) => {
    pendingTypes.current.add(type);
    window.clearTimeout(coalesceTimer.current);
    coalesceTimer.current = window.setTimeout(() => {
      const types = new Set(pendingTypes.current);
      pendingTypes.current.clear();
      const h = hRef.current;
      if (types.has('session.changed')) h.onSession?.();
      if (types.has('theme.changed')) h.onTheme?.();
      // moderation 也影响代祷墙的可见内容，合并为一次刷新
      if (types.has('prayer.changed') || types.has('moderation.changed')) {
        h.onPrayer?.();
        if (types.has('moderation.changed')) h.onModeration?.();
      }
    }, COALESCE_MS);
  }, []);

  const connect = useCallback(async () => {
    const base = apiBase();
    if (!base || !alive.current) return;
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const url = `${base}/api/rooms/${encodeURIComponent(roomId)}/stream`
        + (cursor.current ? `?since=${cursor.current}` : '');
      const res = await fetchAuthed(url, { signal: ctl.signal, headers: { Accept: 'text/event-stream' } });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

      retry.current = 0;
      if (!alive.current) return;
      setHealthy(true);
      // §10 连接就绪先做一次全量刷新——建立连接前的变化不能遗漏
      hRef.current.onFullRefresh?.();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(chunk)?.[1];
          const dt = /^data: (.+)$/m.exec(chunk)?.[1];
          if (!ev || !dt) continue;          // 心跳 `: hb` 走这里
          let parsed: { cursor?: number; eventId?: number; type?: RoomEventType };
          try { parsed = JSON.parse(dt); } catch { continue; }
          if (ev === 'ready') {
            if (typeof parsed.cursor === 'number') cursor.current = Math.max(cursor.current, parsed.cursor);
          } else if (ev === 'closed') {
            throw new Error('closed by server');
          } else if (parsed.eventId && parsed.type) {
            cursor.current = Math.max(cursor.current, parsed.eventId);
            setLastEventId(cursor.current);
            scheduleInvalidate(parsed.type);
          }
        }
      }
      throw new Error('stream ended');
    } catch {
      if (!alive.current) return;
      setHealthy(false);
      // §13 静默重连：指数退避 + 抖动，上限 30s。不显示全屏错误。
      const wait = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retry.current) * (0.7 + Math.random() * 0.6);
      retry.current = Math.min(retry.current + 1, 5);
      window.setTimeout(() => { if (alive.current) void connect(); }, wait);
    }
  }, [roomId, scheduleInvalidate]);

  useEffect(() => {
    if (!enabled) { setHealthy(false); return; }
    alive.current = true;
    void connect();

    // §15/§16 重新可见 → 立即 authoritative refresh，不靠事件慢慢追赶
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      hRef.current.onFullRefresh?.();
      if (!healthy) { retry.current = 0; void connect(); }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      alive.current = false;
      window.clearTimeout(coalesceTimer.current);
      abort.current?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      setHealthy(false);
    };
    // healthy 变化不应重建连接，故不入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, connect]);

  return { healthy, lastEventId };
}
