// --- NoopTransport: 明确的「未启用语音」状态 ---
//
// 在没有配置 VITE_VOICE_TRANSPORT 时使用。
//
// 为什么需要它：原先工厂在未配置时**默认 fallback 到 MockTransport**，
// 于是任何环境（包括生产构建）都会凭空出现一批虚构的「远端成员」，
// 而且它们的 isSpeaking 是随机翻转的。房间因此会显示根本不存在的人，
// 「谁在说话」也接在随机数上。
//
// 现在未配置即为 no-voice：不产生任何参与者、不发出任何 speaking 事件，
// 麦克风开关只记录本地布尔值。UI 应据此显示「语音未启用」而不是假装联通。

import type { ParticipantInfo, VoiceTransport, VoiceTransportEvents } from './types';

export class NoopTransport implements VoiceTransport {
  private micEnabled = false;
  private subscribers: Partial<VoiceTransportEvents>[] = [];

  async join(): Promise<void> {
    // 立刻报告「已连接、零参与者」，让消费方不必特判 undefined。
    for (const s of this.subscribers) {
      s.onConnected?.();
      s.onParticipantsChange?.([]);
    }
  }

  async leave(): Promise<void> {
    for (const s of this.subscribers) s.onDisconnected?.();
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    this.micEnabled = enabled;   // 只是本地状态，没有真实音轨
  }

  isMicEnabled(): boolean {
    return this.micEnabled;
  }

  subscribe(events: Partial<VoiceTransportEvents>): () => void {
    this.subscribers.push(events);
    return () => {
      this.subscribers = this.subscribers.filter(s => s !== events);
    };
  }

  getParticipants(): ParticipantInfo[] {
    return [];
  }
}

/** 语音是否真的可用。UI 用它来决定显示麦克风控件还是「语音未启用」。 */
export const VOICE_DISABLED_REASON = '语音功能尚未启用（未配置 VITE_VOICE_TRANSPORT）';
