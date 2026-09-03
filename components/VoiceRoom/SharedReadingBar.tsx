import React from 'react';
import { BookOpen, Radio, PauseCircle, CornerUpLeft, Megaphone, AlertTriangle } from 'lucide-react';
import { formatLocation } from '../../services/roomReadingService';
import type { SharedReading } from './useSharedReading';

/**
 * 读经室共享阅读位置条（P1-2）。
 *
 * ## 它要回答的两个问题
 *
 *   1. 整个房间在读哪里
 *   2. 我自己在读哪里，是否跟着房间
 *
 * 两者必须同时可见。用户永远不该猜「我看到的是房间进度还是我自己翻的」。
 *
 * ## 刻意没有的东西
 *
 * 没有假经文：房间还没设过位置时显示「尚未设置共同阅读位置」，
 * **不伪造成创世记 1:1**。同步失败时显示「暂时无法同步」并保留上次已知位置，
 * 不显示假成功，也不把故障伪装成「没有共享位置」。
 *
 * 发布按钮只在服务端判定 canPublish 时出现，且必须**显式点击**才发布——
 * 主持人自己翻页不会把房间拖走。
 */

interface Props {
  reading: SharedReading;
  /** 我当前本地在读的位置。 */
  localBook: string;
  localChapter: number;
  /** 跳到房间当前位置。 */
  onGoToRoom: () => void;
  /** 把我当前位置发布为房间共同位置。 */
  onPublish: () => void;
  publishing?: boolean;
}

const SharedReadingBar: React.FC<Props> = ({
  reading, localBook, localChapter, onGoToRoom, onPublish, publishing,
}) => {
  const { position, status, error, canPublish, following, setFollowing } = reading;

  if (status === 'unavailable') {
    return (
      <Shell>
        <span className="text-[11px] text-white/45">共同读经需要连接服务器</span>
      </Shell>
    );
  }

  const roomLabel = position ? formatLocation(position) : null;
  const localLabel = `${localBook} ${localChapter}`;
  const atRoomPosition = Boolean(position)
    && position!.book === localBook && position!.chapter === localChapter;

  return (
    <Shell>
      <div className="flex items-center gap-2 min-w-0">
        <BookOpen size={13} className="text-blue-300/70 shrink-0" />
        {status === 'loading' && !position ? (
          <span className="text-[11px] text-white/45">正在获取房间阅读进度…</span>
        ) : roomLabel ? (
          <>
            <span className="text-[11px] text-white/45 shrink-0">房间正在阅读</span>
            <span className="text-[12px] font-bold text-white truncate">{roomLabel}</span>
          </>
        ) : (
          // 没有共享位置是合法状态，如实说明，不编一个默认章节出来
          <span className="text-[11px] text-white/45">尚未设置共同阅读位置</span>
        )}
      </div>

      {/* 同步失败：保留上面已知的位置，同时明确告知同步中断 */}
      {status === 'error' && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <AlertTriangle size={11} className="text-amber-400/80 shrink-0" />
          <span className="text-[10.5px] text-amber-200/70">
            {error === 'FORBIDDEN' ? '没有权限查看房间阅读进度' : '房间阅读进度暂时无法同步'}
          </span>
        </div>
      )}

      {/* 暂停跟随时必须让用户知道自己在哪、房间在哪 */}
      {position && !following && (
        <div className="mt-2 rounded-lg bg-black/25 border border-white/10 px-2.5 py-2">
          <p className="text-[10.5px] text-white/60 leading-relaxed">
            你已暂停跟随房间阅读，当前自己在读 <b className="text-white/85">{localLabel}</b>
            {!atRoomPosition && <> · 房间当前：<b className="text-white/85">{roomLabel}</b></>}
          </p>
          <button
            onClick={() => { setFollowing(true); onGoToRoom(); }}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-blue-300 active:scale-95"
          >
            <CornerUpLeft size={12} /> 回到房间进度
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {position && following && (
          <button
            onClick={() => setFollowing(false)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold bg-white/10 text-white/70 active:scale-95"
          >
            <PauseCircle size={11} /> 暂停跟随
          </button>
        )}
        {position && !following && (
          <button
            onClick={() => { setFollowing(true); onGoToRoom(); }}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold bg-blue-500/25 text-blue-200 active:scale-95"
          >
            <Radio size={11} /> 跟随阅读
          </button>
        )}
        {/*
          发布权限由服务端 requireRoomManager 判定；这里只是不显示按钮，
          真正的门在服务端——普通成员即使造一个请求也会被 403 挡住。
          必须显式点击才发布：主持人自己翻页不会把整个房间拖走。
        */}
        {canPublish && (
          <button
            onClick={onPublish}
            disabled={publishing || atRoomPosition}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold bg-amber-500/25 text-amber-200 active:scale-95 disabled:opacity-40"
          >
            <Megaphone size={11} />
            {publishing ? '同步中…' : atRoomPosition ? '房间已在此处' : `带领大家读 ${localLabel}`}
          </button>
        )}
      </div>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5">{children}</div>
);

export default SharedReadingBar;
