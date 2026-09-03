import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Check, Clock, HandHeart, UserRound } from 'lucide-react';
import { PT, prayerCard, MODAL_WIDTH } from './prayerTheme';
import {
  fetchSummary, toggleIntercede, formatDuration, formatSessionDate,
  type SessionSummary, type SummaryShare,
} from '../../services/prayerHistoryService';

/**
 * 祷告会纪要（Phase 5）。
 *
 * 回答两个问题：**今日共同祷告了什么**、**经历了哪些祷告事项**。
 *
 * ## 这里刻意没有的东西
 *
 * 没有「本次共有 18 人参与」，没有「累计祷告 46 人次」，没有任何排行。
 * 不是漏了，是**这些数字没有真实数据支撑**：room_presence 在离开与超时
 * 清扫时都是 DELETE，只存当下不存历史，祷告会一结束就查不回来了。
 * 后端连字段都不返回（见 prayerHistory.ts），前端也不拿当前在线人数去顶替。
 *
 * 没有真实数据，就不做看起来很真实的 UI。
 *
 * ## 计划过 != 进行过
 *
 * 「共同祷告了什么」列的是 journey——由服务端事件日志重建的**实际**带领序列。
 * 计划了却没进行的项目单独放在下面，标明「本次未进行」。
 * 不静默丢弃（会歪曲计划），也不混进上面（会歪曲事实）。
 */

interface Props {
  roomId: string;
  sessionId: string;
  /** 刚结束时进入用 'just-ended'，从历史进入用 'history'。只影响标题文案。 */
  origin?: 'just-ended' | 'history';
  onClose: () => void;
}

const PrayerSessionSummary: React.FC<Props> = ({ roomId, sessionId, origin = 'history', onClose }) => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<SessionSummary | null>(null);
  const [shares, setShares] = useState<SummaryShare[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setState('loading');
    void fetchSummary(roomId, sessionId).then(r => {
      if (!alive) return;
      if (r.ok && r.data) {
        setData(r.data);
        setShares(r.data.shares);
        setState('ready');
      } else {
        setState('error');
      }
    });
    return () => { alive = false; };
  }, [roomId, sessionId]);

  /**
   * 继续代祷。乐观更新，失败回滚——不留下一个界面上已登记、服务器上没有的状态。
   */
  const onIntercede = useCallback(async (s: SummaryShare) => {
    if (busy.has(s.id)) return;
    setBusy(b => new Set(b).add(s.id));
    const next = !s.didIntercede;
    setShares(list => list.map(x => x.id === s.id
      ? { ...x, didIntercede: next, intercessions: x.intercessions + (next ? 1 : -1) }
      : x));
    const r = await toggleIntercede(roomId, s.id, next);
    setShares(list => list.map(x => {
      if (x.id !== s.id) return x;
      if (!r.ok) return s;                       // 回滚到操作前的原值
      return {
        ...x,
        didIntercede: r.didIntercede ?? next,
        intercessions: r.intercessions ?? x.intercessions,
      };
    }));
    setBusy(b => { const n = new Set(b); n.delete(s.id); return n; });
  }, [roomId, busy]);

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
        <h2 className="font-bold text-[16px]" style={{ color: PT.navy }}>
          {origin === 'just-ended' ? '祷告会已结束' : '祷告会纪要'}
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}>

        {state === 'loading' && <Skeleton />}

        {state === 'error' && (
          <p className="text-[13px] text-center mt-16 leading-relaxed" style={{ color: PT.muted }}>
            没能取到这场祷告会的纪要。<br />请稍后再试。
          </p>
        )}

        {state === 'ready' && data && (
          <>
            {/* ---- 抬头：只放确凿的事实 ---- */}
            <section className="px-1 mb-5">
              <h3 className="font-bold text-[19px] leading-snug" style={{ color: PT.navy }}>
                {data.session.title || '祷告会'}
              </h3>
              <p className="text-[12.5px] mt-1.5" style={{ color: PT.muted }}>
                {formatSessionDate(data.session.startedAt, data.serverNow) ?? '时间未记录'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
                <Fact icon={<Clock size={13} />} text={formatDuration(data.session.durationMs) ?? '时长未记录'} />
                {data.session.facilitator && (
                  <Fact icon={<UserRound size={13} />} text={`${data.session.facilitator.name} 带领`} />
                )}
              </div>
            </section>

            {/* ---- 今日共同祷告了什么 ---- */}
            <SectionTitle>今日共同祷告了什么</SectionTitle>
            {data.journey.length === 0 ? (
              <Empty>这场祷告会没有留下带领记录。</Empty>
            ) : (
              <ol className="space-y-2.5 mb-6">
                {data.journey.map((j, idx) => (
                  <li key={`${j.itemId}-${j.enteredAt}`} className="flex gap-3 px-4 py-3.5" style={prayerCard}>
                    <span
                      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-[1px]"
                      style={{ background: PT.goldWash, color: PT.gold }}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] leading-snug" style={{ color: PT.navy }}>{j.title}</p>
                      {j.description && (
                        <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: PT.body }}>{j.description}</p>
                      )}
                      {j.scriptureRef && (
                        <p className="flex items-center gap-1.5 text-[12px] mt-1.5" style={{ color: PT.sage }}>
                          <BookOpen size={12} />{j.scriptureRef}
                        </p>
                      )}
                      {/* 时长未闭合时写「时长未记录」，不写 0 分钟 */}
                      <p className="text-[11.5px] mt-2" style={{ color: PT.faint }}>
                        {formatDuration(j.durationMs) ?? '时长未记录'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {/* ---- 计划了但没进行 ---- */}
            {data.notVisited.length > 0 && (
              <>
                <SectionTitle>本次未进行</SectionTitle>
                <ul className="mb-6 px-1">
                  {data.notVisited.map(n => (
                    <li key={n.itemId} className="flex items-start gap-2.5 py-1.5">
                      <span className="shrink-0 w-1 h-1 rounded-full mt-[9px]" style={{ background: PT.faint }} />
                      <span className="text-[13.5px] leading-relaxed" style={{ color: PT.muted }}>{n.title}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11.5px] leading-relaxed mb-6 px-1" style={{ color: PT.faint }}>
                  这些是拟定过、但这场祷告会没有进行到的项目。可以留到下一次。
                </p>
              </>
            )}

            {/* ---- 经历了哪些祷告事项 ---- */}
            <SectionTitle>祷告会期间分享的代祷</SectionTitle>
            {shares.length === 0 ? (
              <Empty>这场祷告会期间没有人分享代祷事项。</Empty>
            ) : (
              <ul className="space-y-2.5">
                {shares.map(s => (
                  <li key={s.id} className="px-4 py-3.5" style={prayerCard}>
                    <p className="text-[10.5px] mb-1.5" style={{ color: PT.faint }}>
                      {s.isAnonymous ? '匿名分享' : s.isMine ? '我' : '弟兄姊妹'}
                    </p>
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: PT.navy }}>
                      {s.text}
                    </p>
                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={() => void onIntercede(s)}
                        disabled={busy.has(s.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold active:scale-95 transition-transform disabled:opacity-50"
                        style={s.didIntercede
                          ? { background: PT.goldWash, color: PT.gold }
                          : { background: PT.neutralWash, color: PT.body }}
                      >
                        {s.didIntercede ? <Check size={13} /> : <HandHeart size={13} />}
                        {s.didIntercede ? '我在为此代祷' : '继续为此代祷'}
                      </button>
                      {/* 这个数字是真的：prayer_intercessions 一人一行，可取消 */}
                      {s.intercessions > 0 && (
                        <span className="text-[11.5px]" style={{ color: PT.muted }}>
                          {s.intercessions} 人正在代祷
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[11px] leading-relaxed text-center mt-8 px-4" style={{ color: PT.faint }}>
              匿名分享对房间成员匿名。作者本人可随时删除自己的分享，删除后历史纪要中也不再显示。
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-[12px] font-bold tracking-wide mb-2.5 px-1" style={{ color: PT.gold }}>{children}</h4>
);

const Fact: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: PT.body }}>{icon}{text}</span>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[13px] leading-relaxed mb-6 px-1" style={{ color: PT.muted }}>{children}</p>
);

const Skeleton: React.FC = () => (
  <div className="animate-pulse space-y-3 mt-2">
    <div className="h-6 rounded-lg w-2/3" style={{ background: PT.neutralWash }} />
    <div className="h-3 rounded w-1/3" style={{ background: PT.neutralWash }} />
    <div className="h-24 rounded-2xl mt-6" style={{ background: PT.neutralWash }} />
    <div className="h-24 rounded-2xl" style={{ background: PT.neutralWash }} />
  </div>
);

export default PrayerSessionSummary;
