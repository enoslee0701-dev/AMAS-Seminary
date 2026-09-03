import { useCallback, useEffect, useRef, useState } from 'react';
import {
  joinRoom, leaveRoom, fetchPresence, sendHeartbeat, clearPresence,
  isRoomBackendConfigured, HEARTBEAT_MS, PRESENCE_POLL_MS,
  type RoomPresenceEntry,
} from '../../services/roomPresenceService';

/**
 * 房间在线状态（P1-1）。读经室 / 讲道室 / 赞美室 / 交通室共用这一个 hook。
 *
 * ## 单一职责
 *
 * 它只做五件事：join、心跳、拉在线名单、页面可见性处理、卸载时清 presence。
 * **不管任何房间业务内容** —— 圣经章节、讲章大纲、诗歌清单、交通话题
 * 都不归它。四个房间的差异不应该渗进这里。
 *
 * ## 成员来自哪里
 *
 * `presence` 的每一项都对应后端 `room_presence` 的一行真实记录。
 * 不合并 MockTransport 的虚拟 peer，不补占位头像，不凑整人数。
 * 即使 `VITE_VOICE_TRANSPORT=mock`，这里也一个假人都不会出现——
 * 本 hook 根本不认识 transport。
 *
 * ## 生命周期
 *
 *   进房   join（建 membership）→ 心跳一次 → 拉名单 → 起轮询与心跳定时器
 *   存活   每 20s 心跳，每 10s 拉名单；页面隐藏时全部暂停
 *   重现   重新可见时立刻补一次心跳 + 拉名单，不等下一个 tick
 *   卸载   停定时器 → clearPresence（**只清在线，保留 membership**）
 *   退出   leave()（解除 membership）由调用方在用户显式退出时触发
 *
 * 切后台 / 断网不调 leave —— 那些情况只应让 presence 自然超时（后端 45s TTL），
 * membership 必须保留，否则用户回来后会失去访问权。
 */

export type PresenceStatus =
  /** 后端未配置，房间的多人功能整体不可用 */
  | 'unavailable'
  /** 正在 join / 首次拉取，还不知道房里有谁 */
  | 'loading'
  /** 名单可信 */
  | 'ready'
  /** 拉取失败。**不显示任何替代人数**，只提示状态暂时无法更新 */
  | 'error';

export interface RoomPresence {
  status: PresenceStatus;
  /** 每一项都对应后端一行真实记录。列表为空就是真的没人。 */
  members: RoomPresenceEntry[];
  /** = members.length。仅在 status === 'ready' 时有意义。 */
  onlineCount: number;
  /** 我自己是否已出现在名单里（join + 首次心跳都成功） */
  meJoined: boolean;
  /** 用户显式退出房间：解除 membership 并清 presence。 */
  leave: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * @param enabled 传 false 时完全静默（不 join、不心跳、不轮询）。
 *   祷告室走 PrayerRoomPanel 自己的一套 presence，overlay 里必须关掉本 hook，
 *   否则同一个房间会有两条心跳链路。
 */
export function useRoomPresence(roomId: string, meId?: string, enabled = true): RoomPresence {
  const backend = isRoomBackendConfigured() && enabled;
  const [status, setStatus] = useState<PresenceStatus>(backend ? 'loading' : 'unavailable');
  const [members, setMembers] = useState<RoomPresenceEntry[]>([]);
  /** 已经成功拉到过一次名单。之后的偶发失败不该把界面打回 loading。 */
  const everLoaded = useRef(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!backend) return;
    const s = await fetchPresence(roomId);
    if (!alive.current) return;
    if (!s) {
      // 拉取失败：保留上一次的名单，只把状态标成 error。
      // **绝不用假数据填补**——宁可显示「成员状态暂时无法更新」。
      setStatus('error');
      return;
    }
    everLoaded.current = true;
    setMembers(s.presence);
    setStatus('ready');
  }, [backend, roomId]);

  useEffect(() => {
    alive.current = true;
    if (!backend) { setStatus(enabled ? 'unavailable' : 'loading'); return; }

    let poll = 0, beat = 0;
    const stopTimers = () => {
      window.clearInterval(poll); window.clearInterval(beat);
      poll = 0; beat = 0;
    };
    const startTimers = () => {
      if (poll || beat) return;
      poll = window.setInterval(() => { void refresh(); }, PRESENCE_POLL_MS);
      beat = window.setInterval(() => { void sendHeartbeat(roomId); }, HEARTBEAT_MS);
    };

    void (async () => {
      // 顺序不能反：没有 membership 时 presence 接口一律 403。
      await joinRoom(roomId);
      if (!alive.current) return;
      await sendHeartbeat(roomId);
      if (!alive.current) return;
      await refresh();
      if (!alive.current) return;
      startTimers();
    })();

    // 切后台时停掉轮询与心跳（让 presence 自然超时），回到前台立刻补一次。
    const onVisibility = () => {
      if (document.hidden) { stopTimers(); return; }
      void (async () => {
        await sendHeartbeat(roomId);
        await refresh();
        startTimers();
      })();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      alive.current = false;
      stopTimers();
      document.removeEventListener('visibilitychange', onVisibility);
      // 只清在线状态。收起房间 / 切后台 / 断网都不该丢 membership。
      void clearPresence(roomId);
    };
  }, [backend, enabled, roomId, refresh]);

  const leave = useCallback(async () => {
    if (!backend) return;
    await clearPresence(roomId);
    await leaveRoom(roomId);
  }, [backend, roomId]);

  return {
    status,
    members,
    onlineCount: members.length,
    meJoined: Boolean(meId) && members.some(m => m.userId === meId),
    leave,
    refresh,
  };
}
