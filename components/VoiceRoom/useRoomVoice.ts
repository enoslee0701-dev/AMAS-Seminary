import { useCallback, useEffect, useRef, useState } from 'react';
import { createVoiceTransport, isVoiceEnabled, resolveTransportKind } from '../../services/voiceTransport';
import { classifyVoiceError, VOICE_ERROR_TEXT, type VoiceErrorCode } from '../../services/voiceTransport/voiceErrors';
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
  /** §7/§8 诊断用：音轨是否已订阅。connected≠听得到，必须分开看。 */
  audioSubscribed?: boolean;
  isLocal?: boolean;
}

/**
 * §5/§8 诊断快照。**只含可安全展示的字段**——
 * 没有 token、没有 secret、没有 email、没有代祷正文、没有匿名作者身份。
 */
export interface VoiceDiagnostics {
  resolvedTransport: string;
  capability: 'unavailable' | 'available';
  connectionState: VoiceState;
  roomId: string;
  /** opaque 内部 user id（randomUUID），非 PII */
  localIdentity: string;
  permissionGranted: boolean | null;
  localTrackCreated: boolean;
  localTrackPublished: boolean;
  localTrackMuted: boolean;
  remoteParticipantCount: number;
  audioSubscribedCount: number;
  activeSpeakerCount: number;
  reconnectCount: number;
  lastReconnectAt: number | null;
  lastErrorCode: VoiceErrorCode | null;
  /** §9 cleanup 是否被调用过（真机验收仍以系统指示灯为准） */
  cleanupCalls: number;
  lastCleanupAt: number | null;
  /** §11 关联两台设备的本次验收记录，不含任何音频内容 */
  acceptanceRunId: string;
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
  /** 技术错误码，只给 Diagnostics 用；普通 UI 用 `error` 的温和文案。 */
  errorCode: VoiceErrorCode | null;
  diagnostics: VoiceDiagnostics;
  joinVoice: () => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMic: () => Promise<void>;
  clearError: () => void;
}

/** §11 每次页面会话一个 id，用于把 Device A / Device B 的验收记录对上。 */
const ACCEPTANCE_RUN_ID = (globalThis.crypto?.randomUUID?.()
  ?? `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function useRoomVoice(roomId: string, meId: string, meName: string): RoomVoice {
  const available = isVoiceEnabled();
  const [state, setState] = useState<VoiceState>(available ? 'idle' : 'disabled');
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<VoiceErrorCode | null>(null);
  /**
   * §3 能力不能只看 env。后端可能配了 livekit 但没配 LIVEKIT_*，
   * 此时 token 返回 503——一旦收到，就把语音标记为不可用并隐藏入口，
   * 而不是留一个点了必失败的按钮。
   */
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [trackCreated, setTrackCreated] = useState(false);
  const [trackPublished, setTrackPublished] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastReconnectAt, setLastReconnectAt] = useState<number | null>(null);
  const [cleanupCalls, setCleanupCalls] = useState(0);
  const [lastCleanupAt, setLastCleanupAt] = useState<number | null>(null);

  const transport = useRef<VoiceTransport | null>(null);
  const joining = useRef(false);        // §30 in-flight guard：连点不会产生多个连接
  const alive = useRef(true);

  /** 只保留 userId + isSpeaking——**不从这里取名字或头像**（§12）。 */
  const mapPeers = useCallback((list: ParticipantInfo[]) => {
    setPeers(list.map(p => ({
      userId: p.id,
      isSpeaking: p.isSpeaking,
      // transport 的 ParticipantInfo 目前不带订阅态；先如实标 undefined，
      // 不要臆造一个 true 让诊断失去意义。
      audioSubscribed: undefined,
      isLocal: p.id === meId,
    })));
  }, [meId]);

  const teardown = useCallback(async () => {
    const t = transport.current;
    transport.current = null;
    // §9 记录 cleanup 确实被调用过。**这不能替代真机上观察指示灯熄灭。**
    setCleanupCalls(n => n + 1);
    setLastCleanupAt(Date.now());
    setTrackCreated(false);
    setTrackPublished(false);
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
        onDisconnected: () => {
          if (!alive.current) return;
          setState(s => {
            if (s !== 'connected') return s;
            setReconnectCount(n => n + 1);
            setLastReconnectAt(Date.now());
            return 'reconnecting';
          });
        },
        onError: (e) => {
          if (!alive.current) return;
          const code = classifyVoiceError(e);
          setErrorCode(code);
          setError(VOICE_ERROR_TEXT[code]);
        },
      });
      setState('connecting');
      await t.join(roomId, meId, meName);
      if (!alive.current) { await teardown(); return; }
      // §6/§15 连上后默认静音，listen-only 是祷告室的推荐默认
      await t.setMicEnabled(false);
      setPermissionGranted(true);
      setTrackCreated(true);
      setTrackPublished(true);
      setMicOn(t.isMicEnabled());
      mapPeers(t.getParticipants());
      setState('connected');
    } catch (e) {
      await teardown();
      if (!alive.current) return;
      // §10 先归类再取文案：普通 UI 只看到温和文案，错误码留给 Diagnostics。
      const code = classifyVoiceError(e);
      setErrorCode(code);
      setError(VOICE_ERROR_TEXT[code]);
      if (code === 'VOICE_PERMISSION_DENIED') setPermissionGranted(false);
      // §3 服务确实没启用 → 之后不再显示「加入语音」入口
      if (code === 'VOICE_SERVICE_UNAVAILABLE') setServiceUnavailable(true);
      setState(code === 'VOICE_SERVICE_UNAVAILABLE' ? 'disabled' : 'failed');
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

  const diagnostics: VoiceDiagnostics = {
    resolvedTransport: resolveTransportKind(),
    capability: available && !serviceUnavailable ? 'available' : 'unavailable',
    connectionState: state,
    roomId,
    localIdentity: meId,
    permissionGranted,
    localTrackCreated: trackCreated,
    localTrackPublished: trackPublished,
    localTrackMuted: !micOn,
    remoteParticipantCount: peers.filter(p => !p.isLocal).length,
    audioSubscribedCount: peers.filter(p => p.audioSubscribed === true).length,
    activeSpeakerCount: peers.filter(p => p.isSpeaking).length,
    reconnectCount,
    lastReconnectAt,
    lastErrorCode: errorCode,
    cleanupCalls,
    lastCleanupAt,
    acceptanceRunId: ACCEPTANCE_RUN_ID,
  };

  return {
    // §3 真实能力 = env 允许 **且** 服务端没有告诉我们 503
    state, available: available && !serviceUnavailable, peers, micOn, error, errorCode,
    diagnostics,
    joinVoice, leaveVoice, toggleMic,
    clearError: () => { setError(null); setErrorCode(null); },
  };
}
