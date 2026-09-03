import React from 'react';
import { HandHeart, Flame, BookOpen, MoreHorizontal, Headphones, Mic, MicOff } from 'lucide-react';
import { PT } from './prayerTheme';

/**
 * 祷告室底部固定操作栏。
 *
 * 语音按钮**只在 transport 真实可用时出现**（livekit/agora 已配置）。
 * 未配置时走 NoopTransport，此处不渲染任何语音控件——不给一个能点却没用的假按钮。
 *
 * 刻意仍**不含**举手 / 上下麦 / 强制静音：Phase 4 只做
 * 「加入语音 → listen-only → 自己 mute/unmute」，麦序留给后续阶段（§24）。
 */

export type PrayerAction = 'write' | 'quiet' | 'verse' | 'more' | 'voice' | 'mic';

interface Props {
  onAction: (a: PrayerAction) => void;
  /** 当前处于哪个子页，用于高亮 */
  active?: 'quiet' | 'verse' | null;
  /**
   * 语音状态（Phase 4）。voiceAvailable=false 时**完全不显示语音按钮**——
   * 未配置 transport 就不该出现一个能点但没用的假按钮。
   */
  voiceAvailable?: boolean;
  voiceConnected?: boolean;
  voiceBusy?: boolean;
  micOn?: boolean;
}

const ITEMS: { key: PrayerAction; icon: React.ElementType; label: string; primary?: boolean }[] = [
  { key: 'write', icon: HandHeart, label: '写代祷', primary: true },
  { key: 'quiet', icon: Flame, label: '安静等候' },
  { key: 'verse', icon: BookOpen, label: '经文' },
  { key: 'more', icon: MoreHorizontal, label: '更多' },
];

const PrayerRoomActionBar: React.FC<Props> = ({
  onAction, active, voiceAvailable, voiceConnected, voiceBusy, micOn,
}) => (
  <div
    className="shrink-0 relative z-40"
    style={{
      background: 'rgba(255,255,255,.94)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderTop: `1px solid ${PT.divider}`,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}
  >
    <div className="flex items-stretch px-2 py-2">
      {/* 语音入口：未加入显示「加入语音」，加入后变成真实麦克风开关。
          刻意不做大红录音按钮 / LIVE 字样——祷告室仍是安静空间（§7）。 */}
      {voiceAvailable && (
        <button
          onClick={() => onAction(voiceConnected ? 'mic' : 'voice')}
          disabled={voiceBusy}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl active:scale-95 transition disabled:opacity-50"
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: voiceConnected && micOn ? PT.navy : PT.neutralWash }}>
            {!voiceConnected
              ? <Headphones size={17} strokeWidth={2} style={{ color: PT.body }} />
              : micOn
                ? <Mic size={17} strokeWidth={2} style={{ color: '#FFFFFF' }} />
                : <MicOff size={17} strokeWidth={2} style={{ color: PT.muted }} />}
          </div>
          <span className="text-[10.5px] font-medium" style={{ color: voiceConnected && micOn ? PT.navy : PT.muted }}>
            {voiceBusy ? '连接中' : !voiceConnected ? '加入语音' : micOn ? '麦克风开' : '麦克风关'}
          </span>
        </button>
      )}
      {ITEMS.map(it => {
        const on = active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onAction(it.key)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl active:scale-95 transition"
            style={on ? { background: PT.goldWash } : undefined}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={
                it.primary
                  ? { background: PT.navy, boxShadow: '0 4px 12px rgba(13,42,82,.24)' }
                  : { background: on ? PT.goldWash : PT.neutralWash }
              }
            >
              <it.icon
                size={17}
                strokeWidth={2}
                style={{ color: it.primary ? '#FFFFFF' : on ? PT.gold : PT.body }}
              />
            </div>
            <span
              className="text-[10.5px] font-medium"
              style={{ color: it.primary ? PT.navy : on ? PT.gold : PT.muted }}
            >
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export default PrayerRoomActionBar;
