import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList, BookMarked, Leaf, ChevronRight, Crown, Shield, Lock,
  Users, Send, Trash2, EyeOff, Check, X, Plus as PlusIcon, Minimize2, MoreHorizontal,
} from 'lucide-react';
import {
  fetchPrayerRoom, savePrayerTopics, postPrayerShare, deletePrayerShare,
  setIntercession, sendHeartbeat, leavePresence, relativeTime,
  isPrayerBackendConfigured, EMPTY_STATE, POLL_MS, HEARTBEAT_MS,
  type PrayerRoomState, type PrayerShare,
} from '../../services/prayerRoomService';

/**
 * 祷告室主面板。只服务 `prayer` 房间，其余四种房间不受影响。
 *
 * 视觉：晨光浅色 —— 暖米白底 + 拱窗晨曦 hero + 纯白卡片 + 柔和投影。
 * 与深色版取向相反：不靠发光制造层次，而靠
 *   1. 极浅底色与纯白卡片之间的明度差；
 *   2. 两层极轻的投影（1px 贴边 + 大范围柔影）；
 *   3. 低饱和强调色（晨曦金、天蓝、嫩绿）点缀，其余全部留白。
 *
 * hero 的晨曦、拱窗、十字架、烛光、叶影全部用 CSS/SVG 绘制，不依赖任何外部图片。
 *
 * 决策（docs/PRAYER_ROOM_REDESIGN.md）：
 *  A1 只有祷告室用这套版式；B 代祷不是点赞；D1 轮询；E 分享仅房内可见/可匿名/可删。
 */

interface Props {
  roomId: string;
  meName: string;
  meAvatar: string;
  fontSize: number;
  showToast: (msg: string) => void;
  /** 房间本地已知的成员（麦位）。与后端 presence 合并，避免两处人数矛盾。 */
  localParticipants?: { id: string; name: string; avatar: string; role: string; isSpeaking?: boolean }[];
  onViewParticipants?: () => void;
  onViewProfile?: (p: any) => void;
  /** hero 内的两个控件，接管原房间顶栏的功能 */
  onMinimize?: () => void;
  onOpenInfo?: () => void;
}

// ---------- 设计令牌 ----------

const C = {
  page: '#FAF6F0',        // 暖米白页面底
  card: '#FFFFFF',
  ink: '#1E2A44',         // 标题（藏青偏黑，与 App 品牌一致）
  body: '#5A6472',
  muted: '#8A93A3',
  faint: '#AEB6C2',
  line: 'rgba(30,42,68,.07)',
  gold: '#C99A45',        // 晨曦金：查看全部 / 仅房内可见 / 短分隔线
  goldSoft: '#F3E4C8',
  goldBg: '#FCF6EA',
  blue: '#3E6BC4',        // 发送按钮
  blueSoft: '#E4ECFB',
  green: '#34C77B',
  greenSoft: '#E3F6EC',
  creamSoft: '#FBEEDC',
  neutralBg: '#F4F6F9',
};

/** 白卡：贴边 1px 投影 + 大范围柔影。浅色下的层次全靠这两层。 */
const card: React.CSSProperties = {
  background: C.card,
  borderRadius: 20,
  boxShadow: '0 1px 2px rgba(16,24,40,.05), 0 10px 28px rgba(16,24,40,.055)',
};

/** 区块标题：粗体中文 +（可选）底部一小段金色短线。 */
const Head: React.FC<{ title: string; right?: React.ReactNode; rule?: boolean }> = ({ title, right, rule }) => (
  <div className="flex items-center">
    <div>
      <h3 className="font-bold text-[16px] tracking-wide" style={{ color: C.ink }}>{title}</h3>
      {rule && <div className="mt-1.5 h-[2.5px] w-7 rounded-full" style={{ background: `linear-gradient(90deg, ${C.gold}, ${C.goldSoft})` }} />}
    </div>
    {right && <div className="ml-auto">{right}</div>}
  </div>
);

/** 项目里的 initialAvatar 是高饱和彩色 SVG，浅色卡上同样刺眼，识别后换成柔和首字头像。 */
const isGenerated = (src?: string | null) => !!src && src.startsWith('data:image/svg+xml');

const Avatar: React.FC<{ src?: string | null; name: string; size?: number; host?: boolean }> =
  ({ src, name, size = 52, host }) => {
    const real = src && !isGenerated(src) ? src : null;
    return (
      <div className="relative rounded-full shrink-0"
        style={{
          width: size, height: size, padding: 2.5,
          background: C.card,
          boxShadow: host
            ? `0 0 0 2px ${C.gold}, 0 4px 12px rgba(201,154,69,.28)`
            : '0 2px 8px rgba(16,24,40,.10)',
        }}>
        <div className="w-full h-full rounded-full overflow-hidden">
          {real ? (
            <img src={real} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: `linear-gradient(155deg, #FCF2E2, #EDF1EA)` }}>
              <span className="font-serif font-bold" style={{ fontSize: size * 0.38, color: '#93825F' }}>
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
 * Hero：拱窗晨曦。全部 CSS/SVG 绘制，零外部图片资源。
 * 由远及近四层：天光 → 拱窗 → 十字架与烛光 → 叶影与光斑。
 */
const Hero: React.FC<{ onMinimize?: () => void; onOpenInfo?: () => void }> = ({ onMinimize, onOpenInfo }) => (
  <div className="relative shrink-0 overflow-hidden" style={{ height: 212 }}>
    <div className="absolute inset-0" style={{
      background: 'linear-gradient(165deg, #FDF3E4 0%, #FBEEDF 42%, #F8F0E7 100%)',
    }} />
    {/* 右上晨曦 */}
    <div className="absolute" style={{
      top: -70, right: -50, width: 300, height: 300,
      background: 'radial-gradient(closest-side, rgba(255,214,146,.80), rgba(255,226,180,.32) 55%, transparent 78%)',
      filter: 'blur(6px)',
    }} />
    {/* 拱窗 */}
    <div className="absolute" style={{
      top: 14, right: 22, width: 154, height: 212,
      borderRadius: '77px 77px 12px 12px',
      background: 'linear-gradient(180deg, rgba(255,243,221,.98) 0%, rgba(255,249,240,.62) 62%, rgba(255,252,247,.12) 100%)',
      border: '1px solid rgba(214,178,120,.28)',
      borderBottom: 'none',
      boxShadow: 'inset 0 0 44px rgba(255,201,124,.42), 0 8px 26px rgba(196,150,88,.10)',
    }} />
    {/* 十字架 */}
    <svg className="absolute" style={{ top: 58, right: 82, opacity: .30, filter: 'blur(.4px)' }} width="42" height="74" viewBox="0 0 42 74" aria-hidden>
      <rect x="18.5" y="0" width="5" height="74" rx="2.5" fill="#B08A5C" />
      <rect x="6" y="19" width="30" height="5" rx="2.5" fill="#B08A5C" />
    </svg>
    {/* 烛台与烛光 */}
    <div className="absolute" style={{ top: 138, right: 40, width: 10, height: 34, borderRadius: 5, background: 'linear-gradient(180deg,#FFF6E6,#EBD8B8)', opacity: .85 }} />
    <div className="absolute" style={{
      top: 124, right: 38, width: 15, height: 22,
      background: 'radial-gradient(closest-side, rgba(255,196,100,.85), transparent 74%)', filter: 'blur(3.5px)',
    }} />
    {/* 左下叶影 */}
    <svg className="absolute" style={{ bottom: -4, left: 8, opacity: .28 }} width="88" height="72" viewBox="0 0 88 72" aria-hidden>
      <path d="M4 70 C22 42 48 26 84 18" stroke="#8FA97E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="30" cy="45" rx="13" ry="6.5" fill="#9CB98A" transform="rotate(-28 30 45)" />
      <ellipse cx="56" cy="31" rx="12" ry="6" fill="#A8C296" transform="rotate(-24 56 31)" />
    </svg>

    {/* 控件 */}
    <button onClick={onMinimize} aria-label="最小化"
      className="absolute left-4 w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition z-10"
      style={{ top: 'calc(var(--safe-top, 0px) + 10px)', background: 'rgba(255,255,255,.75)', boxShadow: '0 2px 8px rgba(16,24,40,.10)' }}>
      <Minimize2 size={16} style={{ color: C.body }} />
    </button>
    <button onClick={onOpenInfo} aria-label="房间设置"
      className="absolute right-4 w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition z-10"
      style={{ top: 'calc(var(--safe-top, 0px) + 10px)', background: 'rgba(255,255,255,.75)', boxShadow: '0 2px 8px rgba(16,24,40,.10)' }}>
      <MoreHorizontal size={17} style={{ color: C.body }} />
    </button>

    {/* 标题 */}
    <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: 'calc(var(--safe-top, 0px) + 46px)' }}>
      <h1 className="font-serif font-bold" style={{ fontSize: 30, letterSpacing: '5px', color: C.ink, textShadow: '0 1px 0 rgba(255,255,255,.75)' }}>
        祷告室
      </h1>
      {/* 细线 + 十字的分隔装饰 */}
      <div className="flex items-center gap-2 mt-2">
        <span style={{ width: 44, height: 1, background: `linear-gradient(90deg, transparent, ${C.gold}99)` }} />
        <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden>
          <rect x="3.6" y="0" width="1.8" height="12" rx=".9" fill={C.gold} />
          <rect x="0" y="3.2" width="9" height="1.8" rx=".9" fill={C.gold} />
        </svg>
        <span style={{ width: 44, height: 1, background: `linear-gradient(270deg, transparent, ${C.gold}99)` }} />
      </div>
      <p className="mt-2 text-[12.5px]" style={{ color: C.body }}>同心合意，为国度祷告。</p>
    </div>
  </div>
);

const PrayerRoomPanel: React.FC<Props> = ({
  roomId, meName, meAvatar, fontSize, showToast,
  localParticipants = [], onViewParticipants, onViewProfile, onMinimize, onOpenInfo,
}) => {
  const [state, setState] = useState<PrayerRoomState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [editingTopics, setEditingTopics] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [panel, setPanel] = useState<null | 'verse' | 'quiet'>(null);
  const [quietSec, setQuietSec] = useState(0);
  const backend = isPrayerBackendConfigured();
  const topicsRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const s = await fetchPrayerRoom(roomId);
    if (s) setState(s);
    setLoaded(true);
  }, [roomId]);

  useEffect(() => {
    if (!backend) { setLoaded(true); return; }
    void sendHeartbeat(roomId, meName, meAvatar);
    void refresh();
    const poll = window.setInterval(() => { void refresh(); }, POLL_MS);
    const beat = window.setInterval(() => { void sendHeartbeat(roomId, meName, meAvatar); }, HEARTBEAT_MS);
    return () => {
      window.clearInterval(poll); window.clearInterval(beat);
      void leavePresence(roomId);
    };
  }, [backend, roomId, meName, meAvatar, refresh]);

  useEffect(() => {
    if (panel !== 'quiet') { setQuietSec(0); return; }
    const t = window.setInterval(() => setQuietSec(s => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [panel]);

  const nowMs = state.serverTime || Date.now();

  /** 在线成员 = 后端 presence ∪ 房间本地成员，去重后房主优先。 */
  const online = useMemo(() => {
    const out: { userId: string; name: string; avatar: string | null; role: string; live: boolean }[] = [];
    const seen = new Set<string>();
    for (const p of state.presence) {
      out.push({ userId: p.userId, name: p.name, avatar: p.avatar, role: p.role, live: true });
      seen.add(p.userId); seen.add(p.name);
    }
    for (const p of localParticipants) {
      if (seen.has(p.id) || seen.has(p.name)) continue;
      seen.add(p.id); seen.add(p.name);
      out.push({ userId: p.id, name: p.name, avatar: p.avatar || null, role: p.role, live: false });
    }
    const rank = (r: string) => (r === 'host' ? 0 : r === 'admin' ? 1 : 2);
    return out.sort((a, b) => rank(a.role) - rank(b.role));
  }, [state.presence, localParticipants]);

  const shown = showAllMembers ? online : online.slice(0, 5);
  const verse = useMemo(verseOfToday, []);

  const submitShare = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    const r = await postPrayerShare(roomId, t, anon);
    if (!r) { showToast('发送失败，请稍后再试'); setText(t); return; }
    setAnon(false);
    void refresh();
  };

  const toggleIntercede = async (s: PrayerShare) => {
    // 乐观更新，失败由下一轮轮询纠正
    setState(prev => ({
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
    const r = await savePrayerTopics(roomId, draft);
    if (!r) { showToast('保存失败，请稍后再试'); return; }
    setState(prev => ({ ...prev, topics: r.topics }));
    setEditingTopics(false);
    showToast('祷告主题已更新，房内成员都会看到');
  };

  // ---------- 安静等候 ----------
  if (panel === 'quiet') {
    const mm = String(Math.floor(quietSec / 60)).padStart(2, '0');
    const ss = String(quietSec % 60).padStart(2, '0');
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 animate-fade-in" style={{ background: C.page }}>
        <div className="relative flex items-center justify-center mb-8">
          <span className="absolute w-40 h-40 rounded-full animate-ping"
            style={{ background: 'radial-gradient(closest-side, rgba(201,154,69,.14), transparent 70%)' }} />
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: `linear-gradient(155deg, ${C.creamSoft}, #F1EAF7)`, boxShadow: '0 8px 26px rgba(16,24,40,.10)' }}>
            <Leaf size={30} style={{ color: '#8FA97E' }} />
          </div>
        </div>
        <p className="font-serif text-[20px] mb-3 font-bold" style={{ color: C.ink }}>安静等候</p>
        <p className="text-[12.5px] mb-8 text-center leading-loose font-serif" style={{ color: C.muted }}>
          「你们要休息，要知道我是神。」<br />不必说话，也不必做什么。
        </p>
        <p className="font-mono text-[34px] tracking-[6px] mb-10 tabular-nums" style={{ color: C.ink }}>{mm}:{ss}</p>
        <button onClick={() => setPanel(null)}
          className="text-[12px] rounded-full px-6 py-2.5 active:scale-95 transition"
          style={{ color: C.body, background: C.card, boxShadow: '0 2px 10px rgba(16,24,40,.08)' }}>
          结束安静
        </button>
      </div>
    );
  }

  // ---------- 经文默想 ----------
  if (panel === 'verse') {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-hide animate-fade-in" style={{ background: C.page }}>
        <div className="px-4 pt-4 pb-8" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 16px)' }}>
          <button onClick={() => setPanel(null)} className="text-[12px] mb-4 flex items-center gap-1 active:scale-95" style={{ color: C.muted }}>
            <X size={14} /> 返回
          </button>
          <div style={{ ...card, padding: 28 }}>
            <div className="flex items-center gap-2 mb-5">
              <BookMarked size={13} style={{ color: C.gold }} />
              <span className="text-[9.5px] font-black tracking-[2.5px] uppercase" style={{ color: C.gold }}>Verse of Today</span>
            </div>
            <p className="font-serif leading-[2.1]" style={{ fontSize: fontSize + 3, color: C.ink }}>{verse.text}</p>
            <div className="mt-6 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
              <p className="text-[13px] font-bold font-serif" style={{ color: C.gold }}>{verse.ref}</p>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed mt-5 px-1 text-center font-serif" style={{ color: C.faint }}>
            每日一节，全房相同。安静读三遍，把其中一句带进祷告里。
          </p>
        </div>
      </div>
    );
  }

  // ---------- 主面板 ----------
  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ background: C.page }}>
      <Hero onMinimize={onMinimize} onOpenInfo={onOpenInfo} />

      <div className="px-4 pb-6 -mt-5 relative">

        {/* ===== 本次祷告主题 ===== */}
        <div ref={topicsRef} style={{ ...card, overflow: 'hidden' }}>
          <div className="px-5 pt-5 pb-4 flex items-start gap-4 relative">
            {/* 右侧鸽子水印 */}
            <svg className="absolute pointer-events-none" style={{ right: 12, top: 16, opacity: .13 }} width="80" height="58" viewBox="0 0 80 58" aria-hidden>
              <path d="M4 34 C20 16 44 8 76 12 C62 22 52 34 45 50 C36 39 20 36 4 34 Z" fill="#C7B7A0" />
              <path d="M26 30 C38 22 54 18 72 18" stroke="#FFFFFF" strokeWidth="1.6" fill="none" opacity=".7" />
            </svg>
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(155deg, ${C.creamSoft}, #FBE0C0)`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.85)' }}>
              <span style={{ fontSize: 20 }}>🙏</span>
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="font-bold text-[17px] tracking-wide" style={{ color: C.ink }}>本次祷告主题</h3>
              {!editingTopics && !state.topics.length && (
                <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: C.muted }}>
                  {state.isHost ? '点击「编辑」写下本次的祷告主题，房内成员都会看到。' : '房主还没有设置本次祷告主题。'}
                </p>
              )}
            </div>
            {state.isHost && !editingTopics && (
              <button
                onClick={() => { setDraft(state.topics.length ? state.topics.map(t => t.text) : ['']); setEditingTopics(true); }}
                className="text-[11.5px] font-bold rounded-full px-3.5 py-1.5 active:scale-95 transition shrink-0"
                style={{ color: C.gold, background: C.goldBg }}
              >编辑</button>
            )}
          </div>

          {(editingTopics || state.topics.length > 0) && (
            <div className="px-5 pb-5">
              {editingTopics ? (
                <div className="space-y-2.5">
                  {draft.map((t, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg text-[12px] font-bold flex items-center justify-center shrink-0"
                        style={{ background: C.goldBg, color: C.gold }}>{i + 1}</span>
                      <input
                        value={t} autoFocus={i === draft.length - 1}
                        onChange={e => setDraft(d => d.map((x, j) => (j === i ? e.target.value : x)))}
                        placeholder="例如：为教会复兴祷告"
                        className="flex-1 rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none"
                        style={{ background: '#F7F8FA', border: `1px solid ${C.line}`, color: C.ink }}
                      />
                      <button onClick={() => setDraft(d => d.filter((_, j) => j !== i))} className="p-1 active:scale-90" style={{ color: C.faint }}><X size={16} /></button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1.5">
                    {draft.length < 12 && (
                      <button onClick={() => setDraft(d => [...d, ''])}
                        className="text-[11px] rounded-xl px-3 py-2 flex items-center gap-1.5 active:scale-95"
                        style={{ color: C.muted, border: `1px dashed ${C.faint}` }}>
                        <PlusIcon size={12} /> 添加一条
                      </button>
                    )}
                    <div className="flex-1" />
                    <button onClick={() => setEditingTopics(false)} className="text-[11.5px] px-3 py-2" style={{ color: C.muted }}>取消</button>
                    <button onClick={saveTopics}
                      className="text-[11.5px] font-bold rounded-full px-5 py-2 text-white active:scale-95 transition"
                      style={{ background: C.blue, boxShadow: '0 4px 12px rgba(62,107,196,.30)' }}>
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {state.topics.map(t => (
                    <div key={t.id} className="flex items-start gap-3">
                      <span className="w-7 h-7 rounded-lg text-[12px] font-bold flex items-center justify-center shrink-0 mt-px"
                        style={{ background: C.goldBg, color: C.gold }}>{t.seq}</span>
                      <p className="leading-[1.8] flex-1 pt-0.5" style={{ fontSize, color: C.body }}>{t.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== 在线成员 ===== */}
        <div style={{ ...card, padding: 16 }} className="mt-3.5">
          <Head
            title="在线成员"
            right={
              <button
                onClick={() => (onViewParticipants ? onViewParticipants() : setShowAllMembers(v => !v))}
                className="text-[11.5px] font-medium flex items-center gap-0.5 active:scale-95 transition"
                style={{ color: C.gold }}
              >查看全部 <ChevronRight size={12} /></button>
            }
          />
          <div className="flex items-center gap-1.5 mt-1 mb-3.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />
            <span className="text-[11.5px]" style={{ color: C.muted }}>{online.length} 人在线</span>
          </div>

          {online.length === 0 ? (
            <p className="text-[12px] py-2" style={{ color: C.faint }}>
              {backend ? '正在同步房间成员…' : '多人在线需要连接服务器，当前未配置后端地址。'}
            </p>
          ) : (
            <div className="flex gap-3.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
              {shown.map(p => (
                <button key={p.userId}
                  onClick={() => onViewProfile?.({ id: p.userId, name: p.name, avatar: p.avatar ?? '', role: p.role })}
                  className="flex flex-col items-center shrink-0 w-[56px] active:scale-95 transition"
                >
                  <div className="relative">
                    <Avatar src={p.avatar} name={p.name} size={52} host={p.role === 'host'} />
                    {/* 只有后端心跳确认在线的才点绿灯，不谎报在线 */}
                    {p.live && (
                      <span className="absolute top-0 right-0 w-3 h-3 rounded-full"
                        style={{ background: C.green, border: `2px solid ${C.card}` }} />
                    )}
                    {p.role === 'host' && (
                      <span className="absolute -bottom-0.5 -right-0.5 rounded-full p-[3px]"
                        style={{ background: C.gold, border: `2px solid ${C.card}` }}>
                        <Crown size={7} className="text-white" fill="currentColor" />
                      </span>
                    )}
                    {p.role === 'admin' && (
                      <span className="absolute -bottom-0.5 -right-0.5 rounded-full p-[3px]"
                        style={{ background: '#8B7FD4', border: `2px solid ${C.card}` }}>
                        <Shield size={7} className="text-white" fill="currentColor" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10.5px] mt-2 truncate w-full text-center" style={{ color: C.muted }}>{p.name}</span>
                </button>
              ))}
              {!showAllMembers && online.length > 5 && (
                <button onClick={() => setShowAllMembers(true)}
                  className="shrink-0 w-[52px] h-[52px] rounded-full flex flex-col items-center justify-center active:scale-95 transition self-start"
                  style={{ background: C.neutralBg, border: `1px solid ${C.line}` }}>
                  <Users size={13} style={{ color: C.muted }} />
                  <span className="text-[10px] font-bold mt-0.5" style={{ color: C.muted }}>{online.length - 5}+</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ===== 三个入口 ===== */}
        <div className="grid grid-cols-3 gap-2.5 mt-3.5">
          {([
            { key: 'topics' as const, icon: ClipboardList, title: '祷告事项', sub: '查看并参与\n代祷事项', bg: C.blueSoft, ink: '#4A72C4' },
            { key: 'verse' as const, icon: BookMarked, title: '经文默想', sub: '每日一节经文\n安静默想', bg: C.creamSoft, ink: '#B78A3F' },
            { key: 'quiet' as const, icon: Leaf, title: '安静等候', sub: '安静在主里\n等候祷告', bg: C.greenSoft, ink: '#4FA277' },
          ]).map(c => (
            <button key={c.key}
              onClick={() => {
                if (c.key === 'topics') topicsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                else setPanel(c.key);
              }}
              style={{ ...card, padding: '16px 6px 12px' }}
              className="flex flex-col items-center text-center active:scale-95 transition"
            >
              <div className="w-11 h-11 rounded-full flex items-center justify-center mb-2.5" style={{ background: c.bg }}>
                <c.icon size={18} style={{ color: c.ink }} strokeWidth={2} />
              </div>
              <span className="font-bold text-[13.5px]" style={{ color: C.ink }}>{c.title}</span>
              <span className="text-[9.5px] leading-[1.55] mt-1.5 whitespace-pre-line" style={{ color: C.faint }}>{c.sub}</span>
              <ChevronRight size={13} className="mt-2" style={{ color: C.faint }} />
            </button>
          ))}
        </div>

        {/* ===== 祷告分享 ===== */}
        <div style={{ ...card, padding: 16 }} className="mt-3.5">
          <Head title="祷告分享" rule right={
            <span className="text-[10px] px-2.5 py-1 rounded-full inline-flex items-center gap-1"
              style={{ color: C.gold, background: C.goldBg }}>
              <Lock size={9} /> 仅房内可见
            </span>
          } />
          <p className="text-[11px] leading-relaxed mt-3" style={{ color: C.muted }}>
            写下需要代祷的事，涉及他人的内容请先征得对方同意，也可以选择匿名。
          </p>

          {state.shares.length === 0 ? (
            <div className="py-7 flex flex-col items-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                style={{ background: `linear-gradient(155deg, ${C.creamSoft}, #EFF4EA)` }}>
                <Leaf size={22} style={{ color: '#A8BE96' }} />
              </div>
              <p className="text-[12px] text-center" style={{ color: C.muted }}>
                {loaded ? '还没有人分享。' : '正在加载…'}
              </p>
              {loaded && <p className="text-[11px] text-center mt-1" style={{ color: C.faint }}>第一个说出来的，往往最需要勇气。</p>}
            </div>
          ) : state.shares.map((s, i) => (
            <div key={s.id} className="flex gap-3 py-3.5" style={i ? { borderTop: `1px solid ${C.line}` } : { marginTop: 6 }}>
              <Avatar src={s.isAnonymous ? null : undefined} name={s.isAnonymous ? '友' : (s.isMine ? meName : (s.userId ?? '弟'))} size={38} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-bold truncate" style={{ color: C.ink }}>
                    {s.isAnonymous ? '一位弟兄姊妹' : (s.isMine ? '我' : (s.userId ?? '弟兄姊妹'))}
                  </span>
                  {s.isAnonymous && <EyeOff size={10} style={{ color: C.faint }} className="shrink-0" />}
                  <span className="text-[10px] shrink-0" style={{ color: C.faint }}>{relativeTime(s.createdAt, nowMs)}</span>
                  {s.isMine && (
                    <button onClick={() => removeShare(s)} className="ml-auto p-1 active:scale-90" style={{ color: C.faint }} aria-label="删除">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <p className="text-[13px] leading-[1.75] mt-1.5 break-words" style={{ color: C.body }}>{s.text}</p>
                <button
                  onClick={() => toggleIntercede(s)}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition active:scale-95"
                  style={s.didIntercede
                    ? { color: C.gold, background: C.goldBg }
                    : { color: C.muted, background: C.neutralBg }}
                >
                  <span style={{ fontSize: 12 }}>🙏</span>
                  {s.intercessions > 0 ? `${s.intercessions} 人正在为此祷告` : '我为你祷告'}
                  {s.didIntercede && <Check size={11} />}
                </button>
              </div>
            </div>
          ))}

          {/* 分享输入 */}
          <div className="mt-3 flex items-center gap-2.5">
            <input
              value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitShare()}
              placeholder={backend ? '输入祷告内容...' : '需要连接服务器后才能分享'}
              disabled={!backend}
              className="flex-1 rounded-full px-4 h-11 text-[13px] outline-none disabled:opacity-50"
              style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink, boxShadow: '0 1px 3px rgba(16,24,40,.05)' }}
            />
            <button onClick={submitShare} disabled={!backend || !text.trim()} aria-label="发送祷告"
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-35 active:scale-95 transition"
              style={{ background: C.blue, boxShadow: '0 5px 14px rgba(62,107,196,.32)' }}>
              <Send size={17} className="text-white" strokeWidth={2.2} />
            </button>
          </div>
          <button onClick={() => setAnon(v => !v)} disabled={!backend}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] rounded-full px-3 py-1.5 transition active:scale-95"
            style={anon
              ? { color: C.gold, background: C.goldBg }
              : { color: C.muted, background: C.neutralBg }}>
            <EyeOff size={11} /> 匿名分享{anon ? '（已开启）' : ''}
          </button>
        </div>

        <p className="text-[10px] leading-relaxed mt-5 px-2 text-center" style={{ color: C.faint }}>
          祷告分享仅本房间成员可见，发布者可随时删除。<br />请勿在此填写他人的病历、住址等敏感信息。
        </p>
      </div>
    </div>
  );
};

export default PrayerRoomPanel;
