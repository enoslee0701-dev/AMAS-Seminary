/**
 * 语音错误分类（Phase 4B-R §10）。
 *
 * 不允许把所有问题都塞成一个 `VOICE_ERROR`——现场排查时
 * 「服务没配」「没权限」「连不上」「掉线重连」是完全不同的处置。
 *
 * 两层表述：
 *   - `VOICE_ERROR_TEXT`  给普通用户，温和、不吓人、且说明祷告室仍可用
 *   - 错误码本身          只出现在 Voice Diagnostics（开发/验收工具）
 */

export type VoiceErrorCode =
  | 'VOICE_SERVICE_UNAVAILABLE'   // 后端未配置 LiveKit → 503
  | 'VOICE_TOKEN_DENIED'          // 非成员 / 已离开房间 → 403
  | 'VOICE_PERMISSION_DENIED'     // 用户拒绝麦克风
  | 'VOICE_CONNECT_FAILED'        // 取到 token 但连不上
  | 'VOICE_DISCONNECTED'          // 已断开
  | 'VOICE_RECONNECTING'          // 正在重连
  | 'VOICE_TRACK_FAILED';         // 音轨创建 / 发布失败

/** 面向用户的温和文案。每一条都要说明祷告室其余功能不受影响。 */
export const VOICE_ERROR_TEXT: Record<VoiceErrorCode, string> = {
  VOICE_SERVICE_UNAVAILABLE: '语音功能暂未启用。你仍然可以参与祷告和代祷。',
  VOICE_TOKEN_DENIED: '你已不在这个房间，无法加入语音。',
  VOICE_PERMISSION_DENIED: '无法使用麦克风。你仍然可以参与祷告和代祷。',
  VOICE_CONNECT_FAILED: '语音连接失败，可以稍后重试。你仍然可以参与祷告和代祷。',
  VOICE_DISCONNECTED: '语音已断开。你仍然可以参与祷告和代祷。',
  VOICE_RECONNECTING: '正在重新连接语音…',
  VOICE_TRACK_FAILED: '麦克风打开失败，可以稍后重试。',
};

/** 把 transport 抛出的原始错误归类。未知一律归到 CONNECT_FAILED，不新造码。 */
export function classifyVoiceError(err: unknown): VoiceErrorCode {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (msg.includes('VOICE_SERVICE_UNAVAILABLE')) return 'VOICE_SERVICE_UNAVAILABLE';
  if (msg.includes('VOICE_FORBIDDEN') || /\b403\b/.test(msg)) return 'VOICE_TOKEN_DENIED';
  if (/permission|NotAllowed|denied/i.test(msg)) return 'VOICE_PERMISSION_DENIED';
  if (/track|getUserMedia|NotFound|NotReadable/i.test(msg)) return 'VOICE_TRACK_FAILED';
  return 'VOICE_CONNECT_FAILED';
}
