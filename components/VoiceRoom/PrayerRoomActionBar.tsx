import React from 'react';
import { HandHeart, Flame, BookOpen, MoreHorizontal } from 'lucide-react';
import { PT } from './prayerTheme';

/**
 * 祷告室底部固定操作栏。
 *
 * 刻意**不含**静音 / 举手 / 正在讲话：当前没有任何真实语音能力
 * （VITE_VOICE_TRANSPORT 未配置时走 NoopTransport），
 * 放这些按钮等于承诺一个不存在的功能。等真实 voice 接入后再加。
 */

export type PrayerAction = 'write' | 'quiet' | 'verse' | 'more';

interface Props {
  onAction: (a: PrayerAction) => void;
  /** 当前处于哪个子页，用于高亮 */
  active?: 'quiet' | 'verse' | null;
}

const ITEMS: { key: PrayerAction; icon: React.ElementType; label: string; primary?: boolean }[] = [
  { key: 'write', icon: HandHeart, label: '写代祷', primary: true },
  { key: 'quiet', icon: Flame, label: '安静等候' },
  { key: 'verse', icon: BookOpen, label: '经文' },
  { key: 'more', icon: MoreHorizontal, label: '更多' },
];

const PrayerRoomActionBar: React.FC<Props> = ({ onAction, active }) => (
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
