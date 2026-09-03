import { useCallback, useEffect, useRef, useState } from 'react';
import { createVoiceTransport, isVoiceEnabled } from '../../services/voiceTransport';
import type { ParticipantInfo, VoiceTransport } from '../../services/voiceTransport/types';

/**
 * 祷告室语音（Phase 4）。
 *
 * ## 边界（这些概念永远不能重新混在一起）
 *   Membership   —— 谁有权进这个房间（room_members）
 *   Presence     —— 谁此刻在线（room_presence，唯一的成员列表来源）
 *   Session      —— 祷告会状态与 facilitator
 *   VoiceParticipant —— 在线成员中**当前连着音频**的那部分
 *   Speaking     —— SDK 检测到的音频活动
 *
 * 本 hook 只负责后两个。**它绝不产出成员列表**——在线成员永远来自 presence。
 *
 * ## 三条硬纪律
 * 1. **默认不开麦**：进房不请求麦克风权限；用户点「加入语音」才申请，
 *    连上后默认 muted（listen-only）。祷告室的隐私预期要求如此。
 * 2. **mute 状态是真状态**：来自 transport 的 track 状态，不是本地布尔值。
 *    SDK 操作失败时回滚到真实状态。
 * 3. **离开语音 ≠ 离开房间**：断开音频后仍可读写代祷、看祷告会。
 */

export type VoiceState =
  | 'disabled'              // 未配置 transport（NoopTransport）
  | 'idle'                  // 可用但未加入
  | 'requesting_permission' // 正在申请麦克风权限
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'disconnected';

export interface VoicePeer {
  /** 与 room_presence.userId 同源的稳定标识——**不用显示名匹配**（§12） */
  userId: string;
  isSpeaking: boolean;
}

export interface RoomVoice {
  state: VoiceState;
  available: boolean;
  /** 已连接音频的成员（按 userId）。与 presence 是两个数字，不要混。 */
  peers: VoicePeer[];
  /** 真实的本地麦克风状态，来自 transport。 */
  micOn: boolean;
  /** 权限被拒等可展示的错误，祷告室其余功能不受影响。 */
  error: string | null;
  joinVoice: () => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMic: () => Promise<void>;
  clearError: () => void;
}

export function useRoomVoice(roomId: string, meId: string, meName: string): RoomVoice {
  const available = isVoiceEnabled();
  const [state, setState] = useState<VoiceState>(available ? 'idle' : 'disabled');
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transport = useRef<VoiceTransport | null>(null);
  const joining = useRef(false);        // §30 in-flight guard：连点不会产生多个连接
  const alive = useRef(true);

  /** 只保留 userId + isSpeaking——**不从这里取名字或头像**（§12）。 */
  const mapPeers = useCallback((list: ParticipantInfo[]) => {
    setPeers(list.map(p => ({ userId: p.id, isSpeaking: p.isSpeaking })));
  }, []);

  const teardown = useCallback(async () => {
    const t = transport.current;
    transport.current = null;
    if (!t) return;
    try {
      await t.setMicEnabled(false);   // §19 先停麦克风轨，设备指示灯必须熄灭
    } catch { /* 尽力而为 */ }
    try {
      await t.leave();
    } catch { /* leave 失败也不能卡住调用方 */ }
  }, []);

  const joinVoice = useCallback(async () => {
    if (!available || joining.current || transport.current) return;
    joining.current = true;
    setError(null);
    try {
      // §6 到这一步才申请麦克风权限——不是一进房间就弹窗
      setState('requesting_permission');
      const t = createVoiceTransport();
      transport.current = t;
      t.subscribe({
        onParticipantsChange: mapPeers,
        onSpeakingChange: (id, speaking) => {
          setPeers(prev => prev.map(p => (p.userId === id ? { ...p, isSpeaking: speaking } : p)));
        },
        onConnected: () => { if (alive.current) setState('connected'); },
        onDisconnected: () => { if (alive.current) setState(s => (s === 'connected' ? 'reconnecting' : s)); },
        onError: (e) => { if (alive.current) setError(e.message); },
      });
      setState('connecting');
      await t.join(roomId, meId, meName);
      if (!alive.current) { await teardown(); return; }
      // §6/§15 连上后默认静音，listen-only 是祷告室的推荐默认
      await t.setMicEnabled(false);
      setMicOn(t.isMicEnabled());
      mapPeers(t.getParticipants());
      setState('connected');
    } catch (e) {
      await teardown();
      if (!alive.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      // §1/§14 按原因给不同文案，都不能表现为「系统错误」，
      // 也都不能让祷告室其余功能失效。
      if (msg === 'VOICE_SERVICE_UNAVAILABLE') {
        setError('语音功能暂未启用。你仍然可以参与祷告和代祷。');
      } else if (msg === 'VOICE_FORBIDDEN') {
        setError('你已不在这个房间，无法加入语音。');
      } else if (/permission|NotAllowed|denied/i.test(msg)) {
        setError('无法使用麦克风。你仍然可以参与祷告和代祷。');
      } else {
        setError('语音连接失败，可以稍后重试。你仍然可以参与祷告和代祷。');
      }
      setState('failed');
    } finally {
      joining.current = false;
    }
  }, [available, roomId, meId, meName, mapPeers, teardown]);

  /** §17 只断开音频，**不动 membership / session / overlay**。§30 幂等。 */
  const leaveVoice = useCallback(async () => {
    await teardown();
    if (!alive.current) return;
    setPeers([]);
    setMicOn(false);
    setState(available ? 'idle' : 'disabled');
  }, [teardown, available]);

  /** §8 真状态：调 transport → 读回 SDK 状态；失败则回滚到真实值。 */
  const toggleMic = useCallback(async () => {
    const t = transport.current;
    if (!t || state !== 'connected') return;
    const target = !t.isMicEnabled();
    try {
      await t.setMicEnabled(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : '麦克风切换失败');
    } finally {
      setMicOn(t.isMicEnabled());   // 永远以 SDK 的实际状态为准
    }
  }, [state]);

  // §19 卸载即清理：刷新 / 返回 / 切换账号都不能残留麦克风轨
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void teardown();
    };
  }, [teardown]);

  // 换房间时先断开旧连接
  useEffect(() => {
    return () => { void teardown(); };
  }, [roomId, teardown]);

  return {
    state, available, peers, micOn, error,
    joinVoice, leaveVoice, toggleMic,
    clearError: () => setError(null),
  };
}
