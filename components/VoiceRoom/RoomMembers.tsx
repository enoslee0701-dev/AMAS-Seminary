import React from 'react';
import { Users } from 'lucide-react';
import { initialAvatar } from '../../services/imageFallback';
import type { RoomPresence } from './useRoomPresence';

/**
 * 房间在线成员（P1-1）。读经室 / 讲道室 / 赞美室 / 交通室共用。
 *
 * ## 硬条件
 *
 * **这里显示的每一个人，都对应后端 room_presence 的一行真实记录。**
 * 不为了页面不空而补任何虚拟用户、占位头像或凑整的人数。
 * 房里只有你一个人，就显示「1 人在线」——那是事实。
 *
 * ## 刻意不显示的东西
 *
 * 没有「正在讲话」、没有麦克风图标、没有举手、没有 speaker 角标、
 * 没有「N 人正在听 / 正在敬拜 / 正在交通」。
 * Presence 只证明一件事：这个人此刻开着这个房间。它不证明有人在说话，
 * 也不证明有人在听——实时语音尚未接入（Phase 4B 仍 BLOCKED）。
 *
 * 文案只写「N 人在线」。
 */

interface Props {
  presence: RoomPresence;
  /** 我的 userId，用于把自己标出来。 */
  meId?: string;
  /** 深色房间（除祷告室外都是）。 */
  dark?: boolean;
}

const RoomMembers: React.FC<Props> = ({ presence, meId, dark = true }) => {
  const { status, members, onlineCount } = presence;

  const textMain = dark ? 'text-white' : 'text-[#0D2A52]';
  const textSub = dark ? 'text-white/45' : 'text-[#8A93A3]';
  const surface = dark ? 'bg-white/5 border-white/10' : 'bg-white border-[#EFE8DB]';

  return (
    <div className={`rounded-2xl border px-3.5 py-3 ${surface}`}>
      <div className="flex items-center gap-2">
        <Users size={13} className={textSub} />
        <span className={`text-[11px] font-bold tracking-wide ${textSub}`}>
          {status === 'ready'
            // Presence 只证明在线。不写「正在听」「正在敬拜」——那需要语音能力。
            ? `${onlineCount} 人在线`
            : status === 'loading' ? '正在加入房间…'
              : status === 'error' ? '成员状态暂时无法更新'
                : '需要连接服务器才能看到房间成员'}
        </span>
      </div>

      {/* 出错时保留上一次拿到的名单（如果有），绝不用假数据顶替 */}
      {members.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-2.5 mt-3">
          {members.map(m => (
            <div key={m.userId} className="flex flex-col items-center w-12">
              <img
                src={m.avatar || initialAvatar(m.userId, m.name)}
                alt={m.name}
                className={`w-9 h-9 rounded-squircle object-cover border ${dark ? 'border-white/10' : 'border-[#EFE8DB]'}`}
              />
              <span className={`text-[10px] mt-1 w-full text-center truncate ${textMain}`}>
                <bdi dir="auto">{m.userId === meId ? '我' : m.name}</bdi>
              </span>
            </div>
          ))}
        </div>
      )}

      {status === 'ready' && members.length === 0 && (
        <p className={`text-[11px] mt-2 ${textSub}`}>房间里还没有人。</p>
      )}
    </div>
  );
};

export default RoomMembers;
