import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchReadingPosition, publishReadingPosition, isReadingBackendConfigured,
  READING_POLL_MS, type ReadingPosition, type ReadingErrorCode,
} from '../../services/roomReadingService';

/**
 * 读经室共享阅读位置（P1-2）。
 *
 * ## 两个位置，绝不混为一谈
 *
 *   我的本地阅读位置   由阅读器自己的 state 持有，本 hook 不碰
 *   房间共同阅读位置   服务器唯一真相源，本 hook 只负责取回与发布
 *
 * 普通成员翻章、搜索经文只改变自己的屏幕。**任何本地浏览都不会写服务器。**
 * 只有主持人显式点「带领大家读这里」才调用 publish。
 *
 * ## 跟随
 *
 * `following` 是**纯客户端个人状态**，不上报服务器，也不进 presence。
 * 跟随时房间位置变化会通过 onFollow 回调驱动阅读器跳转；
 * 暂停跟随后房间位置继续更新，但只显示、不跳转。
 *
 * ## 只有一个 timer
 *
 * 反复 hide→show 不会叠加轮询循环：startPolling 里先判空，
 * stopPolling 后把 handle 置 0。
 */

export interface SharedReading {
  /** null = 房间尚未设置共同阅读位置。这是合法状态，不是错误。 */
  position: ReadingPosition | null;
  status: 'unavailable' | 'loading' | 'ready' | 'error';
  /** 最近一次失败的原因。UI 据此显示「暂时无法同步」，绝不显示假位置。 */
  error: ReadingErrorCode | null;
  /** 服务端判定的发布权限。UI 用它决定是否显示「带领大家读这里」。 */
  canPublish: boolean;
  following: boolean;
  setFollowing: (v: boolean) => void;
  /** 我的本地位置是否与房间一致（决定要不要提示「你已暂停跟随」）。 */
  publish: (book: string, chapter: number, verse?: number | null) =>
    Promise<{ ok: boolean; code?: ReadingErrorCode }>;
  refresh: () => Promise<void>;
}

export function useSharedReading(
  roomId: string,
  enabled: boolean,
  /** 跟随状态下房间位置变化时调用，用来驱动阅读器跳转。 */
  onFollow: (p: ReadingPosition) => void,
): SharedReading {
  const backend = isReadingBackendConfigured() && enabled;
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  const [status, setStatus] = useState<SharedReading['status']>(backend ? 'loading' : 'unavailable');
  const [error, setError] = useState<ReadingErrorCode | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [following, setFollowing] = useState(true);

  const alive = useRef(true);
  // 用 ref 读取，避免把 following / onFollow 放进 effect 依赖而重建轮询
  const followingRef = useRef(following);
  const onFollowRef = useRef(onFollow);
  /** 已经驱动过跳转的 revision，防止同一个位置反复触发。 */
  const appliedRevision = useRef<number | null>(null);

  useEffect(() => { followingRef.current = following; }, [following]);
  useEffect(() => { onFollowRef.current = onFollow; }, [onFollow]);

  const refresh = useCallback(async () => {
    if (!backend) return;
    const r = await fetchReadingPosition(roomId);
    if (!alive.current) return;
    if (!r.ok || !r.state) {
      // 失败就如实标记。**保留上一次的位置，绝不清空成 null**——
      // 清空会让「同步失败」看起来像「房间没有设定位置」，那是两回事。
      setError(r.code ?? 'NETWORK');
      setStatus('error');
      return;
    }
    setError(null);
    setStatus('ready');
    setPosition(r.state.position);
    setCanPublish(Boolean(r.state.capabilities?.canPublish));
    const p = r.state.position;
    if (p && followingRef.current && appliedRevision.current !== p.revision) {
      appliedRevision.current = p.revision;
      onFollowRef.current(p);
    }
  }, [backend, roomId]);

  useEffect(() => {
    alive.current = true;
    if (!backend) { setStatus('unavailable'); return; }

    let poll = 0;
    const stopPolling = () => { if (poll) { window.clearInterval(poll); poll = 0; } };
    // 先判空：反复 hide→show 也只会存在一个 timer
    const startPolling = () => { if (!poll) poll = window.setInterval(() => { void refresh(); }, READING_POLL_MS); };

    void refresh().then(() => { if (alive.current) startPolling(); });

    const onVisibility = () => {
      if (document.hidden) { stopPolling(); return; }
      // 回到前台立刻取最新位置：跟随中的用户应当马上回到正确的地方
      void refresh().then(() => { if (alive.current) startPolling(); });
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      alive.current = false;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [backend, roomId, refresh]);

  /**
   * 发布房间位置。带上当前 revision 做乐观并发：
   * 另一个 moderator 抢先改过就拿 409，此时刷新到最新状态并把冲突告诉调用方。
   */
  const publish = useCallback(async (book: string, chapter: number, verse: number | null = null) => {
    if (!backend) return { ok: false, code: 'NETWORK' as ReadingErrorCode };
    const r = await publishReadingPosition(roomId, book, chapter, {
      verse,
      ...(position ? { expectedRevision: position.revision } : {}),
    });
    if (!alive.current) return { ok: r.ok, code: r.code };
    if (r.ok && r.state) {
      setPosition(r.state.position);
      setStatus('ready');
      setError(null);
      // 自己发布的位置也记为已应用，避免轮询回来再跳一次
      if (r.state.position) appliedRevision.current = r.state.position.revision;
      return { ok: true };
    }
    // 409 时后端带回了最新状态，直接用它刷新界面
    if (r.code === 'CONFLICT' && r.state?.position) {
      setPosition(r.state.position);
      setStatus('ready');
    }
    return { ok: false, code: r.code };
  }, [backend, roomId, position]);

  return { position, status, error, canPublish, following, setFollowing, publish, refresh };
}
