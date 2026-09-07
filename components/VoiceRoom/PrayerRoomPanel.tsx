import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ClipboardList, BookMarked, Leaf, ChevronRight, Crown, Shield, Lock,
  Users, Trash2, EyeOff, Check, X, Plus as PlusIcon, ChevronLeft, MoreHorizontal,
  Flag, EyeOff as HideIcon, Eye, Play, SkipForward, SkipBack, Square, UserCheck, Pencil,
  History,
} from 'lucide-react';
import {
  fetchPrayerRoom, savePrayerTopics, postPrayerShare, deletePrayerShare,
  setIntercession, sendHeartbeat, leavePresence, relativeTime, joinRoom,
  reportShare, setShareHidden, REPORT_REASON_LABEL, type ReportReason,
  isPrayerBackendConfigured, EMPTY_STATE, POLL_MS, HEARTBEAT_MS,
  type PrayerRoomState, type PrayerShare,
} from '../../services/prayerRoomService';
import { PT, prayerCard } from './prayerTheme';
import { usePrayerSession } from './usePrayerSession';
import { usePrayerRoomRealtime } from './usePrayerRoomRealtime';
import { useRoomVoice } from './useRoomVoice';
import VoiceDiagnostics, { voiceDebugEnabled } from './VoiceDiagnostics';
import { elapsedText, ERROR_TEXT, type DraftItem } from '../../services/prayerSessionService';
import PrayerSessionBuilder from './PrayerSessionBuilder';
import PrayerRoomActionBar, { type PrayerAction } from './PrayerRoomActionBar';
import PrayerBottomSheet from './PrayerBottomSheet';
import PrayerSessionSummary from './PrayerSessionSummary';
import PrayerSessionHistory from './PrayerSessionHistory';

/**
 * 祷告室主面板（Phase 1）。只服务 `prayer` 房间。
 *
 * 定位：**真实数据驱动的浅色祷告房间 UI + 本地非实时交互**。
 * 不是伪实时语音房，也不是伪共享祷告进程。
 * 凡是跨设备实际没有同步的数据，一律不包装成实时功能——因此本面板
 * 没有「已祷告 XX 分钟」、没有「某某正在带领」、没有 speaking 光环。
 *
 * 视觉三层（不是每个模块都做成厚卡）：
 *   1. 晨光背景        —— Hero 与页面底
 *   2. 重点白卡        —— 只给「本次祷告主题」和「代祷墙」
 *   3. 落在背景上的辅助 —— 在线成员、祷告次序、快捷入口
 *
 * 色值只从 prayerTheme.PT 取。
 */

interface Props {
  roomId: string;
  meId: string;
  meName: string;
  meAvatar: string;
  fontSize: number;
  showToast: (msg: string) => void;
  onViewParticipants?: () => void;
  onViewProfile?: (p: any) => void;
  onBack?: () => void;
  onOpenInfo?: () => void;
}

// ---------- 本地 UI 状态（不重复存服务端数据） ----------

type BottomSheet = 'write' | null;
type SubPage = 'verse' | 'quiet' | null;

interface UiState {
  activeBottomSheet: BottomSheet;
  subPage: SubPage;
  expandedMembers: boolean;
  editingTopics: boolean;
  draft: string[];
  quietSec: number;
}

type UiAction =
  | { t: 'sheet'; v: BottomSheet }
  | { t: 'page'; v: SubPage }
  | { t: 'members'; v: boolean }
  | { t: 'editTopics'; draft: string[] }
  | { t: 'setDraft'; draft: string[] }
  | { t: 'stopEdit' }
  | { t: 'tick' };

const initialUi: UiState = {
  activeBottomSheet: null, subPage: null, expandedMembers: false,
  editingTopics: false, draft: [], quietSec: 0,
};

function uiReducer(s: UiState, a: UiAction): UiState {
  switch (a.t) {
    case 'sheet': return { ...s, activeBottomSheet: a.v };
    case 'page': return { ...s, subPage: a.v, quietSec: 0 };
    case 'members': return { ...s, expandedMembers: a.v };
    case 'editTopics': return { ...s, editingTopics: true, draft: a.draft };
    case 'setDraft': return { ...s, draft: a.draft };
    case 'stopEdit': return { ...s, editingTopics: false, draft: [] };
    case 'tick': return { ...s, quietSec: s.quietSec + 1 };
    default: return s;
  }
}

// ---------- 视觉基元 ----------

/** 区块标题。辅助区块只用它 + 留白，不加卡片。 */
const Head: React.FC<{ title: string; right?: React.ReactNode; rule?: boolean }> = ({ title, right, rule }) => (
  <div className="flex items-end px-1">
    <div>
      <h3 className="font-bold text-[15.5px] tracking-wide" style={{ color: PT.navy }}>{title}</h3>
      {rule && <div className="mt-1.5 h-[2.5px] w-6 rounded-full" style={{ background: PT.gold }} />}
    </div>
    {right && <div className="ml-auto">{right}</div>}
  </div>
);

/** 项目里的 initialAvatar 生成高饱和彩色 SVG，浅色下刺眼；识别后换成首字占位。 */
const isGenerated = (src?: string | null) => !!src && src.startsWith('data:image/svg+xml');

const Avatar: React.FC<{ src?: string | null; name: string; size?: number; host?: boolean }> =
  ({ src, name, size = 50, host }) => {
    const real = src && !isGenerated(src) ? src : null;
    return (
      <div className="relative rounded-full shrink-0"
        style={{
          width: size, height: size, padding: 2,
          background: PT.card,
          boxShadow: host ? `0 0 0 1.5px ${PT.gold}` : `0 0 0 1px ${PT.divider}`,
        }}>
        <div className="w-full h-full rounded-full overflow-hidden">
          {real ? (
            <img src={real} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: PT.goldWash }}>
              <span className="font-serif font-bold" style={{ fontSize: size * 0.38, color: PT.gold }}>
                {name.slice(0, 1)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

/** 每日经文：按日期确定性选取，同一天全房相同。 */
const DAILY_VERSES = [
  { ref: '腓立比书 4:6', text: '应当一无挂虑，只要凡事藉着祷告、祈求和感谢，将你们所要的告诉神。' },
  { ref: '诗篇 46:10', text: '你们要休息，要知道我是神。' },
  { ref: '马太福音 18:20', text: '因为无论在哪里，有两三个人奉我的名聚会，那里就有我在他们中间。' },
  { ref: '雅各书 5:16', text: '义人祈祷所发的力量是大有功效的。' },
  { ref: '耶利米书 33:3', text: '你求告我，我就应允你，并将你所不知道、又大又难的事指示你。' },
  { ref: '以弗所书 6:18', text: '靠着圣灵，随时多方祷告祈求，并要在此警醒不倦。' },
  { ref: '罗马书 8:26', text: '因为我们本不晓得当怎样祷告，只是圣灵亲自用说不出来的叹息替我们祷告。' },
];
const verseOfToday = () => {
  const d = new Date();
  const n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  return DAILY_VERSES[n % DAILY_VERSES.length];
};

/**
 * Hero：约 160px 的晨光带。窗、十字架、烛光全部 CSS/SVG 绘制，零外部图片。
 * 只显示真实可得的状态（在线人数）；不显示「已祷告 XX 分钟」。
 */
const Hero: React.FC<{ online: number; voiceCount?: number; onBack?: () => void; onOpenInfo?: () => void }> =
  ({ online, voiceCount = 0, onBack, onOpenInfo }) => (
    <div className="relative shrink-0 overflow-hidden" style={{ height: 164 }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(168deg, #FDF4E7 0%, #FBEFE1 48%, #FAF7F0 100%)' }} />
      <div className="absolute" style={{
        top: -60, right: -40, width: 240, height: 240,
        background: 'radial-gradient(closest-side, rgba(255,214,150,.66), rgba(255,228,186,.24) 55%, transparent 78%)',
        filter: 'blur(6px)',
      }} />
      {/* 拱窗 */}
      <div className="absolute" style={{
        top: 8, right: 20, width: 116, height: 160,
        borderRadius: '58px 58px 10px 10px',
        background: 'linear-gradient(180deg, rgba(255,244,224,.96) 0%, rgba(255,250,242,.5) 66%, transparent 100%)',
        border: `1px solid rgba(183,134,56,.20)`, borderBottom: 'none',
        boxShadow: 'inset 0 0 34px rgba(255,204,132,.36)',
      }} />
      {/* 十字架 */}
      <svg className="absolute" style={{ top: 42, right: 64, opacity: .26, filter: 'blur(.4px)' }} width="32" height="56" viewBox="0 0 32 56" aria-hidden>
        <rect x="14" y="0" width="4" height="56" rx="2" fill="#A87F4A" />
        <rect x="5" y="15" width="22" height="4" rx="2" fill="#A87F4A" />
      </svg>
      {/* 烛光：允许的极克制动效之一 */}
      <div className="absolute animate-pulse" style={{
        top: 96, right: 30, width: 13, height: 19,
        background: 'radial-gradient(closest-side, rgba(255,196,100,.8), transparent 74%)', filter: 'blur(3px)',
      }} />
      <div className="absolute" style={{ top: 108, right: 32, width: 8, height: 26, borderRadius: 4, background: 'linear-gradient(180deg,#FFF6E6,#EBDCC0)', opacity: .8 }} />
      {/* 叶影 */}
      <svg className="absolute" style={{ bottom: -2, left: 6, opacity: .22 }} width="70" height="56" viewBox="0 0 70 56" aria-hidden>
        <path d="M3 54 C18 32 38 20 66 14" stroke={PT.sage} strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="24" cy="35" rx="11" ry="5.5" fill={PT.sage} transform="rotate(-28 24 35)" />
        <ellipse cx="45" cy="24" rx="10" ry="5" fill={PT.sage} transform="rotate(-24 45 24)" />
      </svg>

      {/* 顶栏：返回 / 祷告室 / 更多 */}
      <div className="absolute inset-x-0 flex items-center px-4 z-10" style={{ top: 'calc(var(--safe-top, 0px) + 8px)' }}>
        <button onClick={onBack} aria-label="返回"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition"
          style={{ background: 'rgba(255,255,255,.8)', boxShadow: '0 1px 4px rgba(13,42,82,.10)' }}>
          <ChevronLeft size={18} style={{ color: PT.navy }} />
        </button>
        <span className="flex-1" />
        <button onClick={onOpenInfo} aria-label="更多"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition"
          style={{ background: 'rgba(255,255,255,.8)', boxShadow: '0 1px 4px rgba(13,42,82,.10)' }}>
          <MoreHorizontal size={17} style={{ color: PT.navy }} />
        </button>
      </div>

      {/* 标题区 */}
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: 'calc(var(--safe-top, 0px) + 52px)' }}>
        <h1 className="font-serif font-bold" style={{ fontSize: 25, letterSpacing: '5px', color: PT.navy }}>祷告室</h1>
        <div className="flex items-center gap-2 mt-1.5">
          <span style={{ width: 34, height: 1, background: `linear-gradient(90deg, transparent, ${PT.gold}88)` }} />
          <svg width="8" height="11" viewBox="0 0 8 11" aria-hidden>
            <rect x="3.2" y="0" width="1.6" height="11" rx=".8" fill={PT.gold} />
            <rect x="0" y="3" width="8" height="1.6" rx=".8" fill={PT.gold} />
          </svg>
          <span style={{ width: 34, height: 1, background: `linear-gradient(270deg, transparent, ${PT.gold}88)` }} />
        </div>
        <p className="mt-1.5 text-[11.5px]" style={{ color: PT.body }}>同心合意，为国度祷告。</p>
        {/* 只显示真实状态：后端 presence 的在线人数 */}
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1"
          style={{ background: 'rgba(255,255,255,.7)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: PT.online }} />
          <span className="text-[11px] font-medium" style={{ color: PT.body }}>{online} 人在线</span>
          {/* §2 presence 与 voice participants 是两个数字，刻意不合并成一个 */}
          {voiceCount > 0 && (
            <span className="text-[11px]" style={{ color: PT.muted }}>· {voiceCount} 人已连接语音</span>
          )}
        </div>
      </div>
    </div>
  );

/**
 * 共享祷告会区块。**所有显示值都来自服务器**，本组件不持有任何共享状态。
 *
 * 「正在带领」来自 session.facilitator（manager 指定的展示角色），
 * **不是** voice 的 isSpeaking——两者完全无关。
 *
 * 次序里的 ✓ 只表示「已经经过该祷告事项」，不是「已完成属灵任务」。
 */
/** 历次祷告会入口。文字动作用古金，与其它可点击文字保持一致。 */
const HistoryLink: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick}
    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold active:scale-95"
    style={{ color: PT.gold, background: PT.card }}>
    <History size={13} /> 历次祷告会
  </button>
);

const PrayerSessionBlock: React.FC<{
  ps: ReturnType<typeof usePrayerSession>;
  clockTick: number;
  showToast: (m: string) => void;
  presence: { userId: string; name: string; role: string }[];
  /** Phase 5：结束成功后带着刚结束那场的 id 打开纪要。 */
  onSessionEnded: (sessionId: string) => void;
  onOpenHistory: () => void;
}> = ({ ps, clockTick, showToast, presence, onSessionEnded, onOpenHistory }) => {
  const { session: s, canManage, pending } = ps;
  const [pickFacilitator, setPickFacilitator] = useState(false);
  const [builder, setBuilder] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const act = async (fn: () => Promise<{ ok: boolean; code?: keyof typeof ERROR_TEXT }>) => {
    const r = await fn();
    // §31 必须按错误码区分提示，不能一律「操作失败」
    if (!r.ok && r.code) showToast(ERROR_TEXT[r.code]);
  };

  /** 保存 Builder。andStart 时保存成功后再调 start——**绝不在客户端直接置 active**。 */
  const saveFromBuilder = async (items: DraftItem[], title: string | null, andStart: boolean) => {
    const r = s ? await ps.update(items, title) : await ps.create(items, title ?? undefined);
    if (!r.ok) { if (r.code) showToast(ERROR_TEXT[r.code]); return; }
    setBuilder(false);
    if (andStart) {
      const started = await ps.start();
      if (!started.ok && started.code) showToast(ERROR_TEXT[started.code]);
    }
    await ps.refresh();     // start 之后重新读取服务器状态
  };

  if (builder) {
    return (
      <PrayerSessionBuilder
        initialTitle={s?.title}
        initialItems={s?.status === 'scheduled'
          ? s.items.map(i => ({
              title: i.title,
              description: i.description ?? undefined,
              scriptureRef: i.scriptureRef ?? undefined,
              scriptureText: i.scriptureText ?? undefined,
            }))
          : undefined}
        saving={pending === 'create' || pending === 'update' || pending === 'start'}
        onCancel={() => setBuilder(false)}
        onSave={saveFromBuilder}
      />
    );
  }

  // ---------- 没有祷告会 ----------
  if (!s) {
    return (
      <div className="mt-6">
        <Head title="祷告会" />
        <p className="text-[12px] mt-2.5 px-1 leading-relaxed" style={{ color: PT.muted }}>
          目前没有正在进行的祷告会。你仍然可以浏览代祷墙、发布代祷、默想经文或安静等候。
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {canManage && (
            <button onClick={() => setBuilder(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold text-white active:scale-95 transition"
              style={{ background: PT.navy }}>
              <Pencil size={13} /> 准备新的祷告会
            </button>
          )}
          <HistoryLink onClick={onOpenHistory} />
        </div>
      </div>
    );
  }

  const current = s.items.find(i => i.id === s.currentItemId) ?? null;
  const curIdx = s.items.findIndex(i => i.id === s.currentItemId);
  const isLast = curIdx >= 0 && curIdx === s.items.length - 1;
  // §1 用服务器时间的估算值，而不是裸 Date.now()——消除设备时钟偏差
  const elapsed = elapsedText(s.startedAt, ps.serverNow());
  void clockTick;   // 依赖它触发每秒重渲染

  return (
    <div className="mt-6">
      {/* ---------- 当前祷告卡 ---------- */}
      {s.status === 'active' && current && (
        <div style={{ ...prayerCard, padding: '16px 18px' }}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: PT.online }} />
            <span className="text-[11px] font-bold tracking-wide" style={{ color: PT.gold }}>当前祷告</span>
            {s.title && <bdi dir="auto" className="text-[11px] truncate" style={{ color: PT.muted }}>· {s.title}</bdi>}
            <span className="ml-auto font-mono text-[11px] tabular-nums" style={{ color: PT.muted }}>
              已进行 {elapsed}
            </span>
          </div>

          <div className="flex items-start gap-3 mt-3">
            <span className="font-mono text-[15px] font-bold tabular-nums shrink-0" style={{ color: PT.gold }}>
              {String(current.position).padStart(2, '0')}
            </span>
            <bdi dir="auto" className="block text-[16px] font-bold leading-[1.5]" style={{ color: PT.navy }}>
              {current.title}
            </bdi>
          </div>

          {s.facilitator && (
            <p className="text-[12px] mt-2.5" style={{ color: PT.body }}>
              <bdi dir="auto" className="font-bold">{s.facilitator.name}</bdi> 正在带领
            </p>
          )}

          {current.scriptureText && (
            <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${PT.divider}` }}>
              <bdi dir="auto" className="block font-serif text-[13px] leading-[1.9]" style={{ color: PT.body }}>
                「{current.scriptureText}」
              </bdi>
              {current.scriptureRef && (
                <p className="text-[11px] mt-1.5 font-serif" style={{ color: PT.gold }}>{current.scriptureRef}</p>
              )}
            </div>
          )}
        </div>
      )}

      {s.status === 'scheduled' && (
        <div style={{ ...prayerCard, padding: '14px 18px' }}>
          {s.title && <bdi dir="auto" className="block text-[15px] font-bold mb-1" style={{ color: PT.navy }}>{s.title}</bdi>}
          <p className="text-[13px]" style={{ color: PT.navy }}>祷告会已准备好，等待开始。</p>
          <p className="text-[11px] mt-1" style={{ color: PT.muted }}>共 {s.items.length} 项祷告事项。</p>
          {canManage && (
            <button onClick={() => setBuilder(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold active:scale-95"
              style={{ color: PT.gold, background: PT.goldWash }}>
              <Pencil size={12} /> 编辑内容
            </button>
          )}
        </div>
      )}

      {/* ---------- 祷告次序 ---------- */}
      <div className="mt-5">
        <Head title="祷告次序" />
        <div className="mt-3 px-1 space-y-2.5">
          {s.items.map((it, i) => {
            const passed = curIdx >= 0 && i < curIdx;
            const isCur = it.id === s.currentItemId && s.status === 'active';
            return (
              <button key={it.id}
                onClick={() => canManage && s.status === 'active' && act(() => ps.selectItem(it.id))}
                disabled={!canManage || s.status !== 'active' || pending === `select:${it.id}`}
                className="w-full flex items-start gap-3 text-left disabled:cursor-default">
                <span className="w-4 shrink-0 pt-0.5 text-center">
                  {passed
                    ? <Check size={12} style={{ color: PT.sage }} />
                    : isCur
                      ? <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: PT.gold }} />
                      : null}
                </span>
                <span className="text-[11px] font-bold font-mono tabular-nums shrink-0 pt-0.5"
                  style={{ color: isCur ? PT.gold : PT.faint }}>
                  {String(it.position).padStart(2, '0')}
                </span>
                <bdi dir="auto" className="block text-[13px] leading-[1.7] flex-1"
                  style={{ color: isCur ? PT.navy : passed ? PT.faint : PT.body, fontWeight: isCur ? 700 : 400 }}>
                  {it.title}
                </bdi>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] mt-3 px-1" style={{ color: PT.faint }}>
          ✓ 表示已经经过该祷告事项。
        </p>
      </div>

      {/* ---------- Manager 控制（普通成员完全看不到） ---------- */}
      {canManage && (
        <div className="mt-4 rounded-2xl p-3" style={{ background: PT.neutralWash }}>
          <p className="text-[10px] font-bold mb-2.5" style={{ color: PT.muted }}>管理（仅房主与版主可见）</p>
          <div className="flex flex-wrap gap-2">
            {s.status === 'scheduled' && (
              <button onClick={() => act(ps.start)} disabled={pending === 'start'}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold text-white active:scale-95 disabled:opacity-50"
                style={{ background: PT.navy }}>
                <Play size={13} /> {pending === 'start' ? '开始中…' : '开始祷告会'}
              </button>
            )}
            {s.status === 'active' && (
              <>
                <button onClick={() => act(ps.previous)} disabled={pending === 'previous' || curIdx <= 0}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold active:scale-95 disabled:opacity-40"
                  style={{ color: PT.navy, background: PT.card }}>
                  <SkipBack size={13} /> {pending === 'previous' ? '切换中…' : '上一项'}
                </button>
                <button onClick={() => act(ps.advance)} disabled={pending === 'advance' || isLast}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold active:scale-95 disabled:opacity-40"
                  style={{ color: PT.navy, background: PT.card }}>
                  <SkipForward size={13} /> {pending === 'advance' ? '切换中…' : isLast ? '已是最后一项' : '下一项'}
                </button>
                <button onClick={() => setPickFacilitator(v => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold active:scale-95"
                  style={{ color: PT.navy, background: PT.card }}>
                  <UserCheck size={13} /> 更换带领者
                </button>
              </>
            )}
            {s.status !== 'ended' && (
              <button onClick={() => setConfirmEnd(true)} disabled={pending === 'end'}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold active:scale-95 disabled:opacity-50"
                style={{ color: '#9B2C2C', background: PT.card }}>
                <Square size={12} /> {pending === 'end' ? '结束中…' : '结束祷告会'}
              </button>
            )}
            <HistoryLink onClick={onOpenHistory} />
          </div>

          {/* §17 结束确认，避免误触 */}
          {confirmEnd && (
            <div className="mt-3 rounded-xl p-3" style={{ background: PT.card }}>
              <p className="text-[13px] font-bold" style={{ color: PT.navy }}>确定结束本次祷告会？</p>
              <p className="text-[11.5px] mt-1" style={{ color: PT.muted }}>结束后仍可查看本次祷告记录。</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setConfirmEnd(false)}
                  className="flex-1 h-9 rounded-full text-[12px] font-bold" style={{ color: PT.body, background: PT.neutralWash }}>
                  继续祷告
                </button>
                <button onClick={async () => {
                  setConfirmEnd(false);
                  // 先记住 id——end 成功后 current 就返回 null，s 会变成 null
                  const endedId = s.id;
                  const r = await ps.end();
                  if (!r.ok) { if (r.code) showToast(ERROR_TEXT[r.code]); return; }
                  onSessionEnded(endedId);
                }}
                  className="flex-1 h-9 rounded-full text-[12px] font-bold text-white" style={{ background: '#9B2C2C' }}>
                  结束祷告会
                </button>
              </div>
            </div>
          )}

          {pickFacilitator && s.status === 'active' && (
            <div className="mt-3 pt-3 flex flex-wrap gap-1.5" style={{ borderTop: `1px solid ${PT.divider}` }}>
              {presence.length === 0 && <span className="text-[11px]" style={{ color: PT.faint }}>暂无在线成员可指定。</span>}
              {presence.map(p => (
                <button key={p.userId}
                  onClick={async () => { await act(() => ps.assignFacilitator(p.userId)); setPickFacilitator(false); }}
                  disabled={pending === 'facilitator'}
                  className="text-[11.5px] rounded-full px-3 py-1.5 active:scale-95 disabled:opacity-50"
                  style={s.facilitator?.userId === p.userId
                    ? { color: PT.gold, background: PT.goldWash }
                    : { color: PT.body, background: PT.card }}>
                  <bdi dir="auto">{p.name}</bdi>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


const PrayerRoomPanel: React.FC<Props> = ({
  roomId, meId, meName, meAvatar, fontSize, showToast,
  onViewParticipants, onViewProfile, onBack, onOpenInfo,
}) => {
  const [server, setServer] = useState<PrayerRoomState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [reportFor, setReportFor] = useState<string | null>(null);

  const [ui, dispatch] = useReducer(uiReducer, initialUi);
  const backend = isPrayerBackendConfigured();
  const topicsRef = useRef<HTMLDivElement>(null);
  /**
    * Phase 3 Realtime：事件只做失效通知，收到后回 REST 拿 canonical state。
    * realtime 健康时 polling 自动降频（30s/60s），断开时回到快档（3s/10s/15s）。
    */
  const [rtHealthy, setRtHealthy] = useState(false);
  /**
   * 语音（Phase 4）。**它不产出成员列表**——在线成员永远来自 presence。
   * voice.peers 只表示「在线成员中当前连着音频的那部分」，是另一个数字。
   */
  const voice = useRoomVoice(roomId, meId, meName);
  // §4 诊断面板只在 ?voiceDebug=1 且（开发构建 或 显式 VITE_ALLOW_VOICE_DEBUG=1）时可用
  const [showDiag, setShowDiag] = useState(voiceDebugEnabled());
  /**
   * Phase 5 历史沉淀的两层覆盖：历次列表 → 单场纪要。
   * 纪要可以从「刚结束」直接进（origin='just-ended'），也可以从历史进。
   * 两者是同一个组件，只有标题文案不同。
   */
  const [showHistory, setShowHistory] = useState(false);
  const [summary, setSummary] = useState<{ id: string; origin: 'just-ended' | 'history' } | null>(null);
  /** 共享祷告会：**服务器唯一真相源**。currentItemId 等绝不复制进本地 reducer。 */
  const ps = usePrayerSession(roomId, backend, rtHealthy);
  // 只用于「已进行 mm:ss」的视觉刷新；基准始终是 server 的 startedAt
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    if (ps.session?.status !== 'active') return;
    const t = window.setInterval(() => setClockTick(v => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [ps.session?.status]);

  const refresh = useCallback(async () => {
    const s = await fetchPrayerRoom(roomId);
    if (s) setServer(s);
    setLoaded(true);
  }, [roomId]);

  useEffect(() => {
    if (!backend) { setLoaded(true); return; }
    let poll = 0, beat = 0;
    // SEC-2：先建立 membership，再心跳与轮询。没有 membership 时后续接口一律 403。
    void (async () => {
      await joinRoom(roomId);
      await sendHeartbeat(roomId);
      await refresh();
      poll = window.setInterval(() => { void refresh(); }, POLL_MS);
      beat = window.setInterval(() => { void sendHeartbeat(roomId); }, HEARTBEAT_MS);
    })();
    return () => {
      window.clearInterval(poll); window.clearInterval(beat);
      // 只清在线状态，**不解除成员关系**——收起房间/切后台/断网都不该丢授权。
      // 解除成员关系只发生在用户显式「离开房间」时（见 VoiceRoomOverlay 的结束房间）。
      void leavePresence(roomId);
    };
  }, [backend, roomId, refresh]);

  // Realtime：连接就绪 / 重新可见时全量刷新；事件到达时按类型失效对应资源
  const rt = usePrayerRoomRealtime(roomId, backend, {
    onSession: () => { void ps.refresh(); },
    onPrayer: () => { void refresh(); },
    onTheme: () => { void refresh(); },
    onModeration: () => { void refresh(); },
    onFullRefresh: () => { void refresh(); void ps.refresh(); },
  });
  useEffect(() => { setRtHealthy(rt.healthy); }, [rt.healthy]);

  useEffect(() => {
    if (ui.subPage !== 'quiet') return;
    const t = window.setInterval(() => dispatch({ t: 'tick' }), 1000);
    return () => window.clearInterval(t);
  }, [ui.subPage]);

  const nowMs = server.serverTime || Date.now();
  const verse = useMemo(verseOfToday, []);

  /**
   * 在线成员**只来自后端 room_presence**。
   * 不再合并 MockTransport 的虚拟 peer——那些人根本不存在，
   * 而且它们的 isSpeaking 是随机翻转的，不能驱动任何正式 UI。
   */
  const online = server.presence;
  const shown = ui.expandedMembers ? online : online.slice(0, 6);

  const publishShare = async (text: string, anonymous: boolean): Promise<boolean> => {
    const cid = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const r = await postPrayerShare(roomId, text, anonymous, cid);
    if (!r) { showToast('发布失败，请稍后再试'); return false; }
    await refresh();
    showToast('已发布，仅本房间成员可见');
    return true;
  };

  const toggleIntercede = async (s: PrayerShare) => {
    // 乐观 +1/-1，失败由下一轮轮询纠正
    setServer(prev => ({
      ...prev,
      shares: prev.shares.map(x => x.id === s.id
        ? { ...x, didIntercede: !x.didIntercede, intercessions: x.intercessions + (x.didIntercede ? -1 : 1) }
        : x),
    }));
    const r = await setIntercession(roomId, s.id, !s.didIntercede);
    if (!r) void refresh();
    else if (!s.didIntercede) showToast('已记下，愿主垂听');
  };

  const removeShare = async (s: PrayerShare) => {
    const r = await deletePrayerShare(roomId, s.id);
    if (!r) { showToast('删除失败'); return; }
    showToast('已删除'); void refresh();
  };

  const saveTopics = async () => {
    const r = await savePrayerTopics(roomId, ui.draft);
    if (!r) { showToast('保存失败，请稍后再试'); return; }
    setServer(prev => ({ ...prev, topics: r.topics }));
    dispatch({ t: 'stopEdit' });
    showToast('祷告主题已更新，房内成员都会看到');
  };

  const onAction = (a: PrayerAction) => {
    if (a === 'write') dispatch({ t: 'sheet', v: 'write' });
    else if (a === 'quiet') dispatch({ t: 'page', v: ui.subPage === 'quiet' ? null : 'quiet' });
    else if (a === 'verse') dispatch({ t: 'page', v: ui.subPage === 'verse' ? null : 'verse' });
    else if (a === 'voice') void voice.joinVoice();
    else if (a === 'mic') void voice.toggleMic();
    else onOpenInfo?.();
  };

  // §14/§23 语音出错只提示一行，绝不让祷告室其余功能失效
  useEffect(() => {
    if (!voice.error) return;
    showToast(voice.error);
    voice.clearError();
  }, [voice.error]);   // eslint-disable-line react-hooks/exhaustive-deps

  const shell = (children: React.ReactNode) => (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: PT.page }}>
      {children}
      {showDiag && voiceDebugEnabled() && (
        <VoiceDiagnostics diag={voice.diagnostics} peers={voice.peers} onClose={() => setShowDiag(false)} />
      )}
      <PrayerRoomActionBar
        onAction={onAction}
        active={ui.subPage}
        voiceAvailable={voice.available}
        voiceConnected={voice.state === 'connected'}
        voiceBusy={voice.state === 'connecting' || voice.state === 'requesting_permission'}
        micOn={voice.micOn}
      />
      {showHistory && (
        <PrayerSessionHistory
          roomId={roomId}
          onOpenSummary={id => setSummary({ id, origin: 'history' })}
          onClose={() => setShowHistory(false)}
        />
      )}
      {/* 纪要在历史之上：从历史点进来时返回应回到列表，而不是直接回祷告室 */}
      {summary && (
        <PrayerSessionSummary
          roomId={roomId}
          sessionId={summary.id}
          origin={summary.origin}
          onClose={() => setSummary(null)}
        />
      )}
      <PrayerBottomSheet
        open={ui.activeBottomSheet === 'write'}
        onClose={() => dispatch({ t: 'sheet', v: null })}
        onSubmit={publishShare}
        disabled={!backend}
        disabledHint="需要连接服务器后才能发布代祷"
      />
    </div>
  );

  // ---------- 安静等候 ----------
  if (ui.subPage === 'quiet') {
    const mm = String(Math.floor(ui.quietSec / 60)).padStart(2, '0');
    const ss = String(ui.quietSec % 60).padStart(2, '0');
    return shell(
      <div className="flex-1 flex flex-col items-center justify-center px-8 animate-fade-in">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-7" style={{ background: PT.sageWash }}>
          <Leaf size={28} style={{ color: PT.sage }} />
        </div>
        <p className="font-serif text-[19px] font-bold mb-3" style={{ color: PT.navy }}>安静等候</p>
        <p className="text-[12.5px] mb-8 text-center leading-loose font-serif" style={{ color: PT.muted }}>
          「你们要休息，要知道我是神。」<br />不必说话，也不必做什么。
        </p>
        <p className="font-mono text-[32px] tracking-[6px] tabular-nums" style={{ color: PT.navy }}>{mm}:{ss}</p>
        <p className="text-[10.5px] mt-3" style={{ color: PT.faint }}>这段计时只属于你，不会同步给房内其他人。</p>
      </div>,
    );
  }

  // ---------- 经文默想 ----------
  if (ui.subPage === 'verse') {
    return shell(
      <div className="flex-1 overflow-y-auto scrollbar-hide animate-fade-in">
        <div className="px-4 pb-8" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 18px)' }}>
          <button onClick={() => dispatch({ t: 'page', v: null })}
            className="text-[12px] mb-4 flex items-center gap-1 active:scale-95" style={{ color: PT.muted }}>
            <X size={14} /> 返回
          </button>
          <div style={{ ...prayerCard, padding: 26 }}>
            <div className="flex items-center gap-2 mb-5">
              <BookMarked size={13} style={{ color: PT.gold }} />
              <span className="text-[9.5px] font-black tracking-[2.5px] uppercase" style={{ color: PT.gold }}>Verse of Today</span>
            </div>
            <p className="font-serif leading-[2.1]" style={{ fontSize: fontSize + 2, color: PT.navy }}>{verse.text}</p>
            <div className="mt-6 pt-4" style={{ borderTop: `1px solid ${PT.divider}` }}>
              <p className="text-[13px] font-bold font-serif" style={{ color: PT.gold }}>{verse.ref}</p>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed mt-5 text-center font-serif" style={{ color: PT.faint }}>
            每日一节，全房相同。安静读三遍，把其中一句带进祷告里。
          </p>
        </div>
      </div>,
    );
  }

  // ---------- 主页面 ----------
  return shell(
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <Hero online={online.length} voiceCount={voice.state === 'connected' ? voice.peers.length : 0}
        onBack={onBack} onOpenInfo={onOpenInfo} />

      <div className="px-4 pb-5">

        {/* ===== 1. 本次祷告主题（重点白卡） ===== */}
        <div ref={topicsRef} style={{ ...prayerCard, overflow: 'hidden' }}>
          <div className="px-5 pt-4 pb-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: PT.goldWash }}>
              <span style={{ fontSize: 16 }}>🙏</span>
            </div>
            <h3 className="font-bold text-[16px] tracking-wide flex-1" style={{ color: PT.navy }}>本次祷告主题</h3>
            {server.isHost && !ui.editingTopics && (
              <button
                onClick={() => dispatch({ t: 'editTopics', draft: server.topics.length ? server.topics.map(t => t.text) : [''] })}
                className="text-[11.5px] font-bold rounded-full px-3.5 py-1.5 active:scale-95 transition shrink-0"
                style={{ color: PT.gold, background: PT.goldWash }}
              >编辑</button>
            )}
          </div>
          <div style={{ height: 1, background: PT.divider }} />

          <div className="px-5 py-4">
            {ui.editingTopics ? (
              <div className="space-y-2.5">
                {ui.draft.map((t, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg text-[11.5px] font-bold flex items-center justify-center shrink-0"
                      style={{ background: PT.goldWash, color: PT.gold }}>{String(i + 1).padStart(2, '0')}</span>
                    <input
                      value={t} autoFocus={i === ui.draft.length - 1}
                      onChange={e => dispatch({ t: 'setDraft', draft: ui.draft.map((x, j) => (j === i ? e.target.value : x)) })}
                      placeholder="例如：为教会复兴祷告"
                      className="flex-1 rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none"
                      style={{ background: PT.neutralWash, color: PT.navy }}
                    />
                    <button onClick={() => dispatch({ t: 'setDraft', draft: ui.draft.filter((_, j) => j !== i) })}
                      className="p-1 active:scale-90" style={{ color: PT.faint }}><X size={16} /></button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  {ui.draft.length < 12 && (
                    <button onClick={() => dispatch({ t: 'setDraft', draft: [...ui.draft, ''] })}
                      className="text-[11px] rounded-xl px-3 py-2 flex items-center gap-1.5 active:scale-95"
                      style={{ color: PT.muted, border: `1px dashed ${PT.divider}` }}>
                      <PlusIcon size={12} /> 添加一条
                    </button>
                  )}
                  <div className="flex-1" />
                  <button onClick={() => dispatch({ t: 'stopEdit' })} className="text-[11.5px] px-3 py-2" style={{ color: PT.muted }}>取消</button>
                  <button onClick={saveTopics}
                    className="text-[11.5px] font-bold rounded-full px-5 py-2 text-white active:scale-95 transition"
                    style={{ background: PT.navy }}>保存</button>
                </div>
              </div>
            ) : server.topics.length ? (
              <p className="text-[14px] leading-[1.85]" style={{ color: PT.navy }}>{server.topics[0].text}</p>
            ) : (
              /* 轻量空状态：不占大版面，也不伪造 description / scripture */
              <p className="text-[12.5px] leading-relaxed" style={{ color: PT.muted }}>
                房主还没有设置本次祷告主题。
              </p>
            )}
          </div>
        </div>

        {/* ===== 2. 在线成员（辅助层：无卡片，直接落在背景上） ===== */}
        <div className="mt-6">
          <Head title="在线成员" right={
            online.length > 0 ? (
              <button onClick={() => (onViewParticipants ? onViewParticipants() : dispatch({ t: 'members', v: !ui.expandedMembers }))}
                className="text-[11.5px] flex items-center gap-0.5 active:scale-95" style={{ color: PT.gold }}>
                查看全部 <ChevronRight size={12} />
              </button>
            ) : undefined
          } />
          {online.length === 0 ? (
            <p className="text-[11.5px] mt-2.5 px-1 leading-relaxed" style={{ color: PT.faint }}>
              {backend ? '正在同步房间成员…' : '成员在线状态需要连接服务器，当前未配置后端地址。'}
            </p>
          ) : (
            <div className="flex gap-3.5 overflow-x-auto scrollbar-hide mt-3 px-1 pb-1">
              {shown.map(p => (
                <button key={p.userId}
                  onClick={() => onViewProfile?.({ id: p.userId, name: p.name, avatar: p.avatar ?? '', role: p.role })}
                  className="flex flex-col items-center shrink-0 w-[54px] active:scale-95 transition">
                  <div className="relative">
                    <Avatar src={p.avatar} name={p.name} size={50} host={p.role === 'host'} />
                    {/* presence 里的成员按定义就是在线的 */}
                    <span className="absolute top-0 right-0 w-3 h-3 rounded-full"
                      style={{ background: PT.online, border: `2px solid ${PT.page}` }} />
                    {p.role === 'host' && (
                      <span className="absolute -bottom-0.5 -right-0.5 rounded-full p-[3px]"
                        style={{ background: PT.gold, border: `2px solid ${PT.page}` }}>
                        <Crown size={7} className="text-white" fill="currentColor" />
                      </span>
                    )}
                    {p.role === 'admin' && (
                      <span className="absolute -bottom-0.5 -right-0.5 rounded-full p-[3px]"
                        style={{ background: PT.sage, border: `2px solid ${PT.page}` }}>
                        <Shield size={7} className="text-white" fill="currentColor" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] mt-1.5 truncate w-full text-center" style={{ color: PT.muted }}>{p.name}</span>
                </button>
              ))}
              {!ui.expandedMembers && online.length > 6 && (
                <button onClick={() => dispatch({ t: 'members', v: true })}
                  className="shrink-0 w-[50px] h-[50px] rounded-full flex flex-col items-center justify-center active:scale-95 self-start"
                  style={{ background: PT.neutralWash }}>
                  <Users size={13} style={{ color: PT.muted }} />
                  <span className="text-[10px] font-bold" style={{ color: PT.muted }}>{online.length - 6}+</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ===== 3. 共享祷告会（Phase 2）——全部来自服务器 ===== */}
        <PrayerSessionBlock
          ps={ps} clockTick={clockTick} showToast={showToast} presence={online}
          onSessionEnded={id => setSummary({ id, origin: 'just-ended' })}
          onOpenHistory={() => setShowHistory(true)}
        />

        {/* ===== 4. 快捷功能（轻量三列，不再是厚卡） ===== */}
        <div className="mt-6">
          <Head title="快捷" />
          <div className="grid grid-cols-3 gap-2 mt-3">
            {([
              { key: 'topics' as const, icon: ClipboardList, label: '祷告事项', wash: PT.navyWash, ink: PT.navy },
              { key: 'verse' as const, icon: BookMarked, label: '经文默想', wash: PT.goldWash, ink: PT.gold },
              { key: 'quiet' as const, icon: Leaf, label: '安静等候', wash: PT.sageWash, ink: PT.sage },
            ]).map(c => (
              <button key={c.key}
                onClick={() => {
                  if (c.key === 'topics') topicsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  else dispatch({ t: 'page', v: c.key });
                }}
                className="flex flex-col items-center py-3 rounded-2xl active:scale-95 transition"
                style={{ background: 'rgba(255,255,255,.55)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center mb-1.5" style={{ background: c.wash }}>
                  <c.icon size={16} style={{ color: c.ink }} strokeWidth={2} />
                </div>
                <span className="text-[11.5px] font-medium" style={{ color: PT.body }}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ===== 5. 代祷墙（重点白卡） ===== */}
        <div className="mt-6">
          <Head title="代祷墙" rule right={
            <span className="text-[10px] px-2.5 py-1 rounded-full inline-flex items-center gap-1"
              style={{ color: PT.gold, background: PT.goldWash }}>
              <Lock size={9} /> 仅房内可见
            </span>
          } />

          <div style={{ ...prayerCard, marginTop: 12, padding: '4px 16px 14px' }}>
            {server.shares.length === 0 ? (
              <div className="py-8 flex flex-col items-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: PT.sageWash }}>
                  <Leaf size={20} style={{ color: PT.sage }} />
                </div>
                <p className="text-[12px]" style={{ color: PT.muted }}>{loaded ? '还没有人分享代祷。' : '正在加载…'}</p>
                {loaded && <p className="text-[11px] mt-1" style={{ color: PT.faint }}>第一个说出来的，往往最需要勇气。</p>}
              </div>
            ) : server.shares.map((s, i) => (
              <div key={s.id} className="flex gap-3 py-3.5 animate-fade-in"
                style={i ? { borderTop: `1px solid ${PT.divider}` } : undefined}>
                <Avatar src={s.isAnonymous ? null : undefined} name={s.authorState === 'deleted_account' ? '注' : (s.isAnonymous ? '友' : (s.isMine ? meName : (s.userId ?? '弟')))} size={38} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <bdi dir="auto" className="text-[12.5px] font-bold truncate" style={{ color: PT.navy }}>
                      {/* 作者已注销：显示「已注销用户」。刻意**不**显示成「匿名用户」——
                          那会把系统状态冒充成作者主动选择匿名（D-AUTH-1 第 5 条）。 */}
                      {s.authorState === 'deleted_account'
                        ? '已注销用户'
                        : (s.isAnonymous ? '一位弟兄姊妹' : (s.isMine ? '我' : (s.userId ?? '弟兄姊妹')))}
                    </bdi>
                    {s.isAnonymous && <EyeOff size={10} style={{ color: PT.faint }} className="shrink-0" />}
                    <span className="text-[10px] shrink-0" style={{ color: PT.faint }}>{relativeTime(s.createdAt, nowMs)}</span>
                    {s.isMine && (
                      <button onClick={() => removeShare(s)} className="ml-auto p-1 active:scale-90" style={{ color: PT.faint }} aria-label="删除">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <bdi dir="auto" className="block text-[13px] leading-[1.75] mt-1.5 break-words"
                  style={{ color: s.hidden ? PT.faint : PT.body, unicodeBidi: 'plaintext', fontStyle: s.hidden ? 'italic' : undefined }}>
                  {s.text}
                </bdi>

                  <div className="flex items-center gap-3 mt-2.5">
                    <button onClick={() => toggleIntercede(s)}
                      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition active:scale-95"
                      style={s.didIntercede
                        ? { color: PT.gold, background: PT.goldWash }
                        : { color: PT.body, background: PT.neutralWash }}>
                      <span style={{ fontSize: 12 }}>🙏</span>
                      {s.didIntercede ? '已同心祷告' : '我也为此祷告'}
                      {s.didIntercede && <Check size={11} />}
                    </button>
                    {s.intercessions > 0 && (
                      <span className="text-[11px] tabular-nums" style={{ color: PT.muted }}>
                        {s.intercessions} 人同心祷告
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {/* 举报：任何成员可用；同一人对同一条重复举报不产生新记录 */}
                      {!s.isMine && (
                        <button onClick={() => setReportFor(reportFor === s.id ? null : s.id)}
                          aria-label="举报" className="p-1 active:scale-90" style={{ color: PT.faint }}>
                          <Flag size={12} />
                        </button>
                      )}
                      {/* 隐藏：仅 manager（真人 host 或本房 moderator）。与作者的「删除」是两回事 */}
                      {server.isManager && (
                        <button
                          onClick={async () => {
                            const r = await setShareHidden(roomId, s.id, !s.hidden, '管理员处理');
                            showToast(r ? (s.hidden ? '已取消隐藏' : '已隐藏该内容') : '操作失败');
                            void refresh();
                          }}
                          aria-label={s.hidden ? '取消隐藏' : '隐藏'}
                          className="p-1 active:scale-90" style={{ color: s.hidden ? PT.gold : PT.faint }}>
                          {s.hidden ? <Eye size={12} /> : <HideIcon size={12} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 举报原因选择 */}
                  {reportFor === s.id && (
                    <div className="mt-2 rounded-xl p-2.5" style={{ background: PT.neutralWash }}>
                      <p className="text-[10.5px] mb-2" style={{ color: PT.muted }}>举报原因（管理员会看到内容摘要，不会看到匿名作者身份）</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map(rr => (
                          <button key={rr}
                            onClick={async () => {
                              const r = await reportShare(roomId, s.id, rr);
                              setReportFor(null);
                              showToast(r ? (r.created ? '已收到你的举报' : '你已举报过这条内容') : '举报失败');
                            }}
                            className="text-[11px] rounded-full px-2.5 py-1 active:scale-95"
                            style={{ color: PT.body, background: PT.card }}>
                            {REPORT_REASON_LABEL[rr]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] leading-relaxed mt-3 px-1 text-center" style={{ color: PT.faint }}>
            代祷墙仅本房间成员可见，发布者可随时删除。请勿填写他人的病历、住址等敏感信息。<br />
            匿名后，房内其他成员及房主不会看到你的身份；系统仍会保留账号关联，用于内容管理与安全保护。
          </p>
        </div>
      </div>
    </div>,
  );
};

export default PrayerRoomPanel;
