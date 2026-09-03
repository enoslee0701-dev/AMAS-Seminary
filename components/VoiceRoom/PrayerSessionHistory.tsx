import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Clock } from 'lucide-react';
import { PT, prayerCard, MODAL_WIDTH } from './prayerTheme';
import {
  fetchHistory, formatDuration, formatSessionDate,
  type HistoryEntry,
} from '../../services/prayerHistoryService';

/**
 * 历次祷告会（Phase 5）。
 *
 * 每一行只放服务端确凿给出的东西：主题、日期、时长、**实际进行过**的项数、带领者。
 * 没有参与人数——见 PrayerSessionSummary 顶部的说明，那些数字没有历史数据支撑。
 *
 * 「进行了 N 项」用的是 visitedItemCount（事件日志重建），不是计划项数。
 * 一场计划了 6 项、只带领了 2 项的祷告会，这里写 2。
 */

interface Props {
  roomId: string;
  onOpenSummary: (sessionId: string) => void;
  onClose: () => void;
}

const PAGE = 20;

const PrayerSessionHistory: React.FC<Props> = ({ roomId, onOpenSummary, onClose }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const serverNow = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setState('loading');
    void fetchHistory(roomId, { limit: PAGE }).then(r => {
      if (!alive) return;
      if (r.ok && r.data) {
        setEntries(r.data.sessions);
        setNextBefore(r.data.nextBefore);
        serverNow.current = r.data.serverNow;
        setState('ready');
      } else {
        setState('error');
      }
    });
    return () => { alive = false; };
  }, [roomId]);

  const loadMore = useCallback(async () => {
    if (nextBefore === null || loadingMore) return;
    setLoadingMore(true);
    const r = await fetchHistory(roomId, { limit: PAGE, before: nextBefore });
    if (r.ok && r.data) {
      // 用 id 去重：分页边界上时间戳相同的两场不会重复插入
      setEntries(prev => {
        const seen = new Set(prev.map(e => e.id));
        return [...prev, ...r.data!.sessions.filter(e => !seen.has(e.id))];
      });
      setNextBefore(r.data.nextBefore);
    }
    setLoadingMore(false);
  }, [roomId, nextBefore, loadingMore]);

  return (
    <div className={`fixed inset-0 z-[150] ${MODAL_WIDTH} flex flex-col`} style={{ background: PT.page }}>
      <header
        className="shrink-0 flex items-center gap-2 px-4"
        style={{
          paddingTop: 'calc(var(--safe-top, 0px) + 10px)', paddingBottom: 12,
          background: PT.page, borderBottom: `1px solid ${PT.divider}`,
        }}
      >
        <button onClick={onClose} aria-label="返回" className="p-1.5 -ml-1.5 active:scale-90" style={{ color: PT.navy }}>
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-bold text-[16px]" style={{ color: PT.navy }}>历次祷告会</h2>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}>

        {state === 'loading' && (
          <div className="animate-pulse space-y-2.5">
            {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl" style={{ background: PT.neutralWash }} />)}
          </div>
        )}

        {state === 'error' && (
          <p className="text-[13px] text-center mt-16 leading-relaxed" style={{ color: PT.muted }}>
            没能取到历史记录。<br />请稍后再试。
          </p>
        )}

        {state === 'ready' && entries.length === 0 && (
          <div className="text-center mt-20 px-6">
            <p className="text-[14px] font-semibold" style={{ color: PT.navy }}>还没有结束过的祷告会</p>
            <p className="text-[12.5px] mt-2 leading-relaxed" style={{ color: PT.muted }}>
              祷告会结束后会自动留在这里，可以随时回来看看那天一同祷告了什么。
            </p>
          </div>
        )}

        {state === 'ready' && entries.length > 0 && (
          <>
            <ul className="space-y-2.5">
              {entries.map(e => (
                <li key={e.id}>
                  <button
                    onClick={() => onOpenSummary(e.id)}
                    className="w-full text-left flex items-center gap-3 px-4 py-3.5 active:scale-[.985] transition-transform"
                    style={prayerCard}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] truncate" style={{ color: PT.navy }}>
                        {e.title || '祷告会'}
                      </p>
                      <p className="text-[12px] mt-1" style={{ color: PT.muted }}>
                        {formatSessionDate(e.endedAt, serverNow.current) ?? '时间未记录'}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-[11.5px]" style={{ color: PT.faint }}>
                          <Clock size={11} />{formatDuration(e.durationMs) ?? '时长未记录'}
                        </span>
                        {/* 实际进行过的项数，不是计划项数 */}
                        <span className="text-[11.5px]" style={{ color: PT.faint }}>
                          进行了 {e.visitedItemCount} 项
                        </span>
                        {e.facilitator && (
                          <span className="text-[11.5px] truncate" style={{ color: PT.faint }}>
                            {e.facilitator.name} 带领
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={17} className="shrink-0" style={{ color: PT.faint }} />
                  </button>
                </li>
              ))}
            </ul>

            {nextBefore !== null && (
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="w-full mt-4 py-3 rounded-2xl text-[13px] font-semibold active:scale-[.98] transition-transform disabled:opacity-50"
                style={{ background: PT.neutralWash, color: PT.body }}
              >
                {loadingMore ? '加载中…' : '加载更早的祷告会'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PrayerSessionHistory;
