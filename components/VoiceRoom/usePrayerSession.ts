import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchCurrentSession, startSession, advanceSession, previousSession, selectSessionItem,
  setFacilitator, endSession, createSession, updateSession, POLL_FOR, EMPTY_SESSION,
  serverOffsetOf, estimatedServerNow,
  type SessionState, type CommandResult, type DraftItem,
} from '../../services/prayerSessionService';

/**
 * 共享祷告会的 server state hook（Phase 2 §28）。
 *
 * 严格边界：
 *   - 这里持有的**全部是服务器状态**，不做任何本地推导；
 *   - `currentItemId` 绝不复制进 PrayerRoomPanel 的 UI reducer；
 *   - manager 命令**不做乐观切换**——只进 loading，服务器成功后才更新，
 *     因为可能发生 revision 冲突（§30）；
 *   - 收到 409 时用服务端返回的最新 state 直接刷新（后端在冲突响应里带了它）。
 *
 * 轮询：active 3s / scheduled 10s / 无 session 15s；
 * 页面隐藏时暂停，重新可见立即 fetch（§29）。
 */
export function usePrayerSession(roomId: string, enabled: boolean) {
  const [state, setState] = useState<SessionState>(EMPTY_SESSION);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  /** 服务器时间与本机的差值。所有 elapsed 都基于它，消除设备时钟偏差（§1）。 */
  const [serverOffset, setServerOffset] = useState(0);
  const timer = useRef<number>(0);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const r = await fetchCurrentSession(roomId);
    if (!alive.current) return;
    if (r.ok && r.state) {
      setState(r.state);
      setServerOffset(serverOffsetOf(r.state.serverNow));
    }
    setLoaded(true);
  }, [roomId]);

  // 自适应轮询：间隔由当前 status 决定，每轮重排
  useEffect(() => {
    if (!enabled) { setLoaded(true); return; }
    alive.current = true;
    const tick = async () => {
      if (document.visibilityState === 'visible') await refresh();
      if (!alive.current) return;
      timer.current = window.setTimeout(tick, POLL_FOR(state.session));
    };
    void tick();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // state.session?.status 变化时重排间隔；不依赖整个 session 对象避免每轮重建
  }, [enabled, refresh, state.session?.status]);

  /** 统一的命令执行：进 loading → 调服务器 → 用返回的 state 更新（成功或 409 都用）。 */
  const run = useCallback(async (key: string, fn: () => Promise<CommandResult>): Promise<CommandResult> => {
    setPending(key);
    const r = await fn();
    if (alive.current) {
      if (r.state) {
        setState(r.state);                  // 409 冲突时后端也带回最新状态
        setServerOffset(serverOffsetOf(r.state.serverNow));
      } else void refresh();
      setPending(null);
    }
    return r;
  }, [refresh]);

  const s = state.session;
  const rev = s?.revision ?? -1;

  return {
    state,
    session: s,
    canManage: state.capabilities.canManageSession,
    loaded,
    pending,
    refresh,
    /** 服务器时间的估算值。UI 用它算「已进行 mm:ss」，而不是裸 Date.now()。 */
    serverNow: () => estimatedServerNow(serverOffset),
    serverOffset,
    create: (items: DraftItem[], title?: string) => run('create', () => createSession(roomId, items, title)),
    update: (items: DraftItem[], title: string | null) =>
      run('update', () => updateSession(roomId, s!.id, items, title, rev)),
    start: () => run('start', () => startSession(roomId, s!.id, rev)),
    advance: () => run('advance', () => advanceSession(roomId, s!.id, rev)),
    previous: () => run('previous', () => previousSession(roomId, s!.id, rev)),
    selectItem: (itemId: string) => run(`select:${itemId}`, () => selectSessionItem(roomId, s!.id, itemId, rev)),
    assignFacilitator: (userId: string | null) => run('facilitator', () => setFacilitator(roomId, s!.id, userId, rev)),
    end: () => run('end', () => endSession(roomId, s!.id, rev)),
  };
}
