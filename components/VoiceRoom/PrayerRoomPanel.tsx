import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Flame, Feather, ChevronRight, Crown, Shield,
  Users, Send, Trash2, EyeOff, Check, X, Plus as PlusIcon,
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
 * 视觉：深酒红底 + 暖光 bloom + 玻璃层卡片 + 金色描边。
 * 层次靠三样东西建立，缺一样都会显得平：
 *   1. 环境光（顶部金色 radial + 侧后方酒红 radial），让背景不是一块死色；
 *   2. 玻璃面（半透明 + backdrop-blur + 顶部 1px 内高光），让卡片浮起来；
 *   3. 双层阴影（贴近的暗影 + 扩散的环境影），而不是单一 box-shadow。
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
}

// ---------- 调色板 ----------
//
// 祷告室的配色可整体切换。酒红+金是很传统的教会配色，容易显旧；
// 而 App 的品牌色本来就是藏青+金（见 ChristianProfileView），
// 旧的酒红是从 rose 主题继承下来的，本来就不统一。
// 换主题只改这一个对象 + VoiceRoomOverlay 里 getBgGradient 的 prayer 一行。

type Palette = {
  /** 卡片主色（主题卡用），rgba 两段做垂直渐变 */
  cardFrom: string; cardTo: string; cardBorder: string;
  /** 强调色：标题、序号、图标、按钮 */
  accent: string; accentDeep: string; accentInk: string;
  /** 环境光三团 */
  glowTop: string; glowSide: string; glowBottom: string;
  /** 头像底 */
  avatarFrom: string; avatarTo: string; avatarInk: string;
  /** 徽章描边色（要与页面底色一致才像“挖空”） */
  badgeRing: string;
};

const PALETTES: Record<'midnight' | 'pine' | 'graphite', Palette> = {
  // 午夜靛蓝 · 与 App 品牌的藏青一脉相承，冷静、现代、夜祷感
  midnight: {
    cardFrom: 'rgba(30,52,110,.55)', cardTo: 'rgba(11,20,48,.66)', cardBorder: 'rgba(150,180,240,.20)',
    accent: '#A9C4F5', accentDeep: '#5B7FD4', accentInk: '#0A1633',
    glowTop: 'rgba(150,185,255,.26)', glowSide: 'rgba(58,96,190,.38)', glowBottom: 'rgba(30,48,110,.40)',
    avatarFrom: '#26406F', avatarTo: '#101c3a', avatarInk: 'rgba(196,216,255,.94)',
    badgeRing: '#0B1430',
  },
  // 深松绿 · 安静、有生命感，不冷不燥
  pine: {
    cardFrom: 'rgba(20,68,58,.55)', cardTo: 'rgba(7,26,23,.66)', cardBorder: 'rgba(150,220,196,.18)',
    accent: '#9EDCC2', accentDeep: '#3E8F72', accentInk: '#06201A',
    glowTop: 'rgba(168,236,206,.24)', glowSide: 'rgba(30,120,96,.36)', glowBottom: 'rgba(16,64,54,.40)',
    avatarFrom: '#1B5145', avatarTo: '#08221D', avatarInk: 'rgba(190,236,218,.94)',
    badgeRing: '#071A17',
  },
  // 石墨 + 琥珀 · 极简，几乎中性，靠单一强调色说话
  graphite: {
    cardFrom: 'rgba(58,60,68,.48)', cardTo: 'rgba(20,21,26,.66)', cardBorder: 'rgba(255,255,255,.12)',
    accent: '#F0C070', accentDeep: '#B8863A', accentInk: '#2A1B05',
    glowTop: 'rgba(240,192,112,.20)', glowSide: 'rgba(120,124,140,.26)', glowBottom: 'rgba(40,42,52,.45)',
    avatarFrom: '#3A3C46', avatarTo: '#17181D', avatarInk: 'rgba(240,214,170,.94)',
    badgeRing: '#15161A',
  },
};

/** 当前主题。换一行即可整体换色。 */
const P = PALETTES.midnight;

// ---------- 视觉基元 ----------

/** 玻璃卡：半透明面 + 模糊 + 顶部内高光 + 双层阴影。 */
const glass: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,.055) 0%, rgba(255,255,255,.022) 100%)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  border: '1px solid rgba(255,255,255,.10)',
  borderRadius: 20,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10), 0 2px 6px rgba(0,0,0,.35), 0 14px 40px rgba(0,0,0,.45)',
};

/** 主题卡：同样的玻璃，底色取调色板主色，作为页面的视觉重心。 */
const wineCard: React.CSSProperties = {
  ...glass,
  background: `linear-gradient(180deg, ${P.cardFrom} 0%, ${P.cardTo} 100%)`,
  border: `1px solid ${P.cardBorder}`,
};

const GOLD = P.accent;
const GOLD_DIM = P.accentDeep;

/** 区块标题：中文衬线 + 金色英文 eyebrow，与 App 其余板块层级一致。 */
const Head: React.FC<{ title: string; en: string; right?: React.ReactNode }> = ({ title, en, right }) => (
  <div className="flex items-center mb-3.5">
    <h3 className="font-serif text-white text-[16.5px] font-bold tracking-wide">{title}</h3>
    <span className="ml-2.5 text-[9px] font-black tracking-[2px] uppercase" style={{ color: 'rgba(232,201,140,.5)' }}>{en}</span>
    {right && <div className="ml-auto">{right}</div>}
  </div>
);

/**
 * 头像。项目里的 initialAvatar 生成的是高饱和彩色 SVG（粉/蓝/青/绿），
 * 放进酒金配色里非常刺眼，因此识别出这类占位图后换成同色系的首字头像。
 */
const isGenerated = (src?: string | null) => !!src && src.startsWith('data:image/svg+xml');

const Avatar: React.FC<{ src?: string | null; name: string; size?: number; gold?: boolean }> =
  ({ src, name, size = 56, gold }) => {
    const real = src && !isGenerated(src) ? src : null;
    return (
      <div
        className="relative rounded-full shrink-0"
        style={{
          width: size, height: size, padding: 2,
          background: gold
            ? `linear-gradient(145deg, ${P.accent}, ${P.accentDeep})`
            : `linear-gradient(145deg, ${P.accent}55, ${P.accentDeep}22)`,
          boxShadow: gold ? `0 0 14px ${P.accent}59` : '0 2px 8px rgba(0,0,0,.4)',
        }}
      >
        <div className="w-full h-full rounded-full overflow-hidden" style={{ background: P.avatarTo }}>
          {real ? (
            <img src={real} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: `radial-gradient(120% 120% at 30% 20%, ${P.avatarFrom} 0%, ${P.avatarTo} 70%)` }}
            >
              <span className="font-serif font-bold" style={{ fontSize: size * 0.4, color: P.avatarInk }}>
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

/** 环境光：让背景不是一块死色。三个 radial 各司其职，都不拦点击。 */
const Ambience: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
    <div className="absolute" style={{
      top: -170, left: '50%', transform: 'translateX(-50%)', width: 420, height: 340,
      background: `radial-gradient(closest-side, ${P.glowTop}, transparent 78%)`,
      filter: 'blur(14px)',
    }} />
    <div className="absolute" style={{
      top: 190, right: -130, width: 330, height: 330,
      background: `radial-gradient(closest-side, ${P.glowSide}, transparent 72%)`, filter: 'blur(24px)',
    }} />
    <div className="absolute" style={{
      bottom: -110, left: -110, width: 320, height: 320,
      background: `radial-gradient(closest-side, ${P.glowBottom}, transparent 72%)`, filter: 'blur(26px)',
    }} />
  </div>
);

const PrayerRoomPanel: React.FC<Props> = ({
  roomId, meName, meAvatar, fontSize, showToast,
  localParticipants = [], onViewParticipants, onViewProfile,
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

  const shown = showAllMembers ? online : online.slice(0, 6);
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
      <div className="flex-1 relative flex flex-col items-center justify-center px-8 animate-fade-in">
        <Ambience />
        <div className="relative flex items-center justify-center mb-8">
          <span className="absolute w-40 h-40 rounded-full animate-ping"
            style={{ background: `radial-gradient(closest-side, ${P.accent}29, transparent 70%)` }} />
          <span className="absolute w-28 h-28 rounded-full" style={{ border: `1px solid ${P.accent}40` }} />
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{
            background: `radial-gradient(120% 120% at 35% 25%, ${P.accent}38, ${P.cardTo})`,
            border: `1px solid ${P.accent}59`,
            boxShadow: `0 0 40px ${P.accent}38`,
          }}>
            <Feather size={30} style={{ color: GOLD }} />
          </div>
        </div>
        <p className="font-serif text-[20px] mb-3" style={{ color: GOLD }}>安静等候</p>
        <p className="text-white/45 text-[12.5px] mb-8 text-center leading-loose font-serif">
          「你们要休息，要知道我是神。」<br />不必说话，也不必做什么。
        </p>
        <p className="text-white/85 font-mono text-[34px] tracking-[6px] mb-10 tabular-nums">{mm}:{ss}</p>
        <button onClick={() => setPanel(null)}
          className="text-white/65 text-[12px] rounded-full px-6 py-2.5 active:scale-95 transition"
          style={{ border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.04)' }}>
          结束安静
        </button>
      </div>
    );
  }

  // ---------- 经文默想 ----------
  if (panel === 'verse') {
    return (
      <div className="flex-1 relative overflow-y-auto scrollbar-hide px-4 pt-2 animate-fade-in">
        <Ambience />
        <div className="relative">
          <button onClick={() => setPanel(null)} className="text-white/55 text-[12px] mb-4 flex items-center gap-1 active:scale-95">
            <X size={14} /> 返回
          </button>
          <div style={wineCard} className="p-7">
            <div className="flex items-center gap-2 mb-5">
              <Flame size={13} style={{ color: GOLD_DIM }} />
              <span className="text-[9.5px] font-black tracking-[2.5px] uppercase" style={{ color: `${P.accent}A6` }}>Verse of Today</span>
            </div>
            <p className="text-white/95 font-serif leading-[2.1]" style={{ fontSize: fontSize + 3 }}>{verse.text}</p>
            <div className="mt-6 pt-4" style={{ borderTop: `1px solid ${P.accent}2E` }}>
              <p className="text-[13px] font-bold font-serif" style={{ color: GOLD }}>{verse.ref}</p>
            </div>
          </div>
          <p className="text-white/35 text-[11px] leading-relaxed mt-5 px-1 text-center font-serif">
            每日一节，全房相同。安静读三遍，把其中一句带进祷告里。
          </p>
        </div>
      </div>
    );
  }

  // ---------- 主面板 ----------
  return (
    <div className="flex-1 relative overflow-y-auto scrollbar-hide">
      <Ambience />
      <div className="relative px-4 pb-6">

        {/* 房间副标题：承接顶栏的「祷告室」，在暖光里给一句定调的话 */}
        <p className="text-center font-serif text-[12.5px] tracking-[1px] pt-1 pb-3"
           style={{ color: `${P.accent}B0`, textShadow: `0 0 18px ${P.accent}59` }}>
          同心合意，为国度祷告。
        </p>

        {/* ===== 本次祷告主题 ===== */}
        <div ref={topicsRef} style={wineCard} className="overflow-hidden">
          <div className="px-5 pt-5 pb-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{
              background: `radial-gradient(120% 120% at 35% 25%, ${P.accent}4D, ${P.cardTo})`,
              border: `1px solid ${P.accent}59`,
              boxShadow: `0 0 18px ${P.accent}33`,
            }}>
              <span style={{ fontSize: 17 }}>🙏</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-serif text-white text-[18px] font-bold tracking-wide">本次祷告主题</h3>
              <p className="text-[9px] font-black tracking-[2px] mt-0.5" style={{ color: `${P.accent}80` }}>THIS SESSION</p>
            </div>
            {state.isHost && !editingTopics && (
              <button
                onClick={() => { setDraft(state.topics.length ? state.topics.map(t => t.text) : ['']); setEditingTopics(true); }}
                className="text-[11px] font-bold rounded-full px-3.5 py-1.5 active:scale-95 transition shrink-0"
                style={{ color: GOLD, border: `1px solid ${P.accentDeep}66`, background: `${P.accent}12` }}
              >编辑</button>
            )}
          </div>

          <div className="px-5 pb-5">
            {editingTopics ? (
              <div className="space-y-2.5">
                {draft.map((t, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl text-[12px] font-bold flex items-center justify-center shrink-0"
                      style={{ background: `${P.accent}1A`, color: GOLD, border: `1px solid ${P.accent}38` }}>{i + 1}</span>
                    <input
                      value={t} autoFocus={i === draft.length - 1}
                      onChange={e => setDraft(d => d.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder="例如：为教会复兴祷告"
                      className="flex-1 rounded-xl px-3.5 py-2.5 text-white text-[13.5px] outline-none"
                      style={{ background: 'rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.10)' }}
                    />
                    <button onClick={() => setDraft(d => d.filter((_, j) => j !== i))} className="text-white/35 p-1 active:scale-90"><X size={16} /></button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1.5">
                  {draft.length < 12 && (
                    <button onClick={() => setDraft(d => [...d, ''])}
                      className="text-[11px] text-white/55 rounded-xl px-3 py-2 flex items-center gap-1.5 active:scale-95"
                      style={{ border: '1px dashed rgba(255,255,255,.20)' }}>
                      <PlusIcon size={12} /> 添加一条
                    </button>
                  )}
                  <div className="flex-1" />
                  <button onClick={() => setEditingTopics(false)} className="text-[11.5px] text-white/45 px-3 py-2">取消</button>
                  <button onClick={saveTopics}
                    className="text-[11.5px] font-bold rounded-full px-5 py-2 active:scale-95 transition"
                    style={{ color: P.accentInk, background: `linear-gradient(180deg, ${P.accent}, ${P.accentDeep})`, boxShadow: `0 4px 14px ${P.accentDeep}59` }}>
                    保存
                  </button>
                </div>
              </div>
            ) : state.topics.length ? (
              <div className="space-y-3.5">
                {state.topics.map(t => (
                  <div key={t.id} className="flex items-start gap-3.5">
                    <span className="w-8 h-8 rounded-xl text-[12.5px] font-bold flex items-center justify-center shrink-0 mt-px"
                      style={{
                        background: `linear-gradient(160deg, ${P.accent}33, ${P.accent}0F)`,
                        color: GOLD, border: `1px solid ${P.accent}42`,
                      }}>{t.seq}</span>
                    <p className="font-serif leading-[1.85] flex-1 pt-1" style={{ fontSize, color: 'rgba(255,241,235,.94)' }}>{t.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/38 text-[12px] font-serif leading-relaxed py-0.5">
                {state.isHost ? '点击「编辑」写下本次的祷告主题，房内成员都会看到。' : '房主还没有设置本次祷告主题。'}
              </p>
            )}
          </div>
        </div>

        {/* ===== 在线成员 ===== */}
        <div style={glass} className="p-4 mt-3.5">
          <Head
            title="在线成员" en="Together"
            right={
              <button
                onClick={() => (onViewParticipants ? onViewParticipants() : setShowAllMembers(v => !v))}
                className="text-[11px] text-white/60 rounded-full px-3 py-1.5 flex items-center gap-0.5 active:scale-95 transition"
                style={{ border: '1px solid rgba(255,255,255,.14)' }}
              >查看全部 <ChevronRight size={12} /></button>
            }
          />
          <div className="flex items-center gap-1.5 -mt-2 mb-3.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 8px rgba(52,211,153,.9)' }} />
            <span className="text-[11.5px] text-white/55">{online.length} 人在线</span>
          </div>

          {online.length === 0 ? (
            <p className="text-white/35 text-[12px] py-2">
              {backend ? '正在同步房间成员…' : '多人在线需要连接服务器，当前未配置后端地址。'}
            </p>
          ) : (
            <div className="flex gap-3.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
              {shown.map(p => (
                <button key={p.userId}
                  onClick={() => onViewProfile?.({ id: p.userId, name: p.name, avatar: p.avatar ?? '', role: p.role })}
                  className="flex flex-col items-center shrink-0 w-[58px] active:scale-95 transition"
                >
                  <div className="relative">
                    <Avatar src={p.avatar} name={p.name} size={54} gold={p.role === 'host'} />
                    {/* 只有后端心跳确认在线的才点绿灯，不谎报在线 */}
                    {p.live && (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400"
                        style={{ border: `2.5px solid ${P.badgeRing}`, boxShadow: '0 0 7px rgba(52,211,153,.85)' }} />
                    )}
                    {p.role === 'host' && (
                      <span className="absolute -top-1 -right-1 rounded-full p-[3px]"
                        style={{ background: `linear-gradient(180deg, ${P.accent}, ${P.accentDeep})`, border: `2px solid ${P.badgeRing}` }}>
                        <Crown size={8} style={{ color: P.accentInk }} fill="currentColor" />
                      </span>
                    )}
                    {p.role === 'admin' && (
                      <span className="absolute -top-1 -right-1 rounded-full p-[3px]" style={{ background: '#8B5CF6', border: `2px solid ${P.badgeRing}` }}>
                        <Shield size={8} className="text-white" fill="currentColor" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold mt-2 truncate w-full text-center"
                    style={{ color: p.role === 'host' ? GOLD : 'rgba(255,255,255,.72)' }}>{p.name}</span>
                </button>
              ))}
              {!showAllMembers && online.length > 6 && (
                <button onClick={() => setShowAllMembers(true)}
                  className="shrink-0 w-[54px] h-[54px] rounded-full flex flex-col items-center justify-center active:scale-95 transition self-start"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}>
                  <Users size={13} className="text-white/55" />
                  <span className="text-[10px] text-white/70 font-black mt-0.5">{online.length - 6}+</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ===== 三个入口 ===== */}
        <div className="grid grid-cols-3 gap-2.5 mt-3.5">
          {([
            { key: 'topics' as const, icon: BookOpen, title: '祷告事项', sub: '查看并参与\n代祷事项' },
            { key: 'verse' as const, icon: Flame, title: '经文默想', sub: '每日一节经文\n安静默想' },
            { key: 'quiet' as const, icon: Feather, title: '安静等候', sub: '安静在主里\n等候祂' },
          ]).map(c => (
            <button key={c.key}
              onClick={() => {
                if (c.key === 'topics') topicsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                else setPanel(c.key);
              }}
              style={glass}
              className="px-2 py-4 flex flex-col items-center text-center active:scale-95 transition"
            >
              <div className="w-11 h-11 rounded-full flex items-center justify-center mb-2.5" style={{
                background: `linear-gradient(160deg, ${P.accent}, ${P.accentDeep})`,
                boxShadow: `0 4px 14px ${P.accentDeep}4D, inset 0 1px 0 rgba(255,255,255,.45)`,
              }}>
                <c.icon size={17} style={{ color: P.accentInk }} strokeWidth={2.2} />
              </div>
              <span className="font-serif text-white text-[13.5px] font-bold">{c.title}</span>
              <span className="text-[9.5px] leading-[1.5] mt-1.5 whitespace-pre-line" style={{ color: 'rgba(255,255,255,.38)' }}>{c.sub}</span>
              <ChevronRight size={13} className="mt-2.5" style={{ color: `${P.accent}66` }} />
            </button>
          ))}
        </div>

        {/* ===== 祷告分享 ===== */}
        <div style={glass} className="p-4 mt-3.5">
          <Head title="祷告分享" en="Shared" right={
            <span className="text-[9.5px] px-2 py-1 rounded-full" style={{ color: 'rgba(255,255,255,.40)', border: '1px solid rgba(255,255,255,.10)' }}>仅房内可见</span>
          } />
          <p className="text-[10.5px] leading-relaxed -mt-2 mb-3.5" style={{ color: 'rgba(255,255,255,.33)' }}>
            写下需要代祷的事。涉及他人的内容请先征得对方同意，也可以选择匿名。
          </p>

          {state.shares.length === 0 ? (
            <p className="text-white/35 text-[12px] py-5 text-center font-serif leading-loose whitespace-pre-line">
              {loaded ? '还没有人分享。\n第一个说出来的，往往最需要勇气。' : '正在加载…'}
            </p>
          ) : state.shares.map((s, i) => (
            <div key={s.id} className="flex gap-3 py-3.5" style={i ? { borderTop: '1px solid rgba(255,255,255,.07)' } : undefined}>
              <Avatar src={s.isAnonymous ? null : undefined} name={s.isAnonymous ? '友' : (s.isMine ? meName : (s.userId ?? '弟'))} size={40} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-bold text-white/90 truncate">
                    {s.isAnonymous ? '一位弟兄姊妹' : (s.isMine ? '我' : (s.userId ?? '弟兄姊妹'))}
                  </span>
                  {s.isAnonymous && <EyeOff size={10} className="text-white/30 shrink-0" />}
                  <span className="text-[10px] shrink-0" style={{ color: 'rgba(255,255,255,.32)' }}>{relativeTime(s.createdAt, nowMs)}</span>
                  {s.isMine && (
                    <button onClick={() => removeShare(s)} className="ml-auto text-white/25 p-1 active:scale-90" aria-label="删除">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <p className="text-[13px] leading-[1.75] mt-1.5 break-words" style={{ color: 'rgba(255,255,255,.78)' }}>{s.text}</p>
                <button
                  onClick={() => toggleIntercede(s)}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition active:scale-95"
                  style={s.didIntercede
                    ? { color: GOLD, background: `${P.accent}1F`, border: `1px solid ${P.accent}59` }
                    : { color: 'rgba(255,255,255,.55)', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)' }}
                >
                  <span style={{ fontSize: 12 }}>🙏</span>
                  {s.intercessions > 0 ? `${s.intercessions} 人正在为此祷告` : '我为你祷告'}
                  {s.didIntercede && <Check size={11} />}
                </button>
              </div>
            </div>
          ))}

          {/* 分享输入 */}
          <div className="mt-3.5 pt-3.5" style={{ borderTop: '1px solid rgba(255,255,255,.09)' }}>
            <div className="flex items-end gap-2.5">
              <textarea
                value={text} onChange={e => setText(e.target.value)} rows={2}
                placeholder={backend ? '输入祷告内容…' : '需要连接服务器后才能分享'}
                disabled={!backend}
                className="flex-1 rounded-2xl px-3.5 py-2.5 text-white text-[13px] outline-none resize-none disabled:opacity-40"
                style={{ background: 'rgba(0,0,0,.30)', border: '1px solid rgba(255,255,255,.10)' }}
              />
              <button onClick={submitShare} disabled={!backend || !text.trim()} aria-label="发送祷告"
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-30 active:scale-95 transition"
                style={{ background: `linear-gradient(180deg, ${P.accent}, ${P.accentDeep})`, boxShadow: `0 5px 16px ${P.accentDeep}61, inset 0 1px 0 rgba(255,255,255,.5)` }}>
                <Send size={17} style={{ color: P.accentInk }} strokeWidth={2.3} />
              </button>
            </div>
            <button onClick={() => setAnon(v => !v)} disabled={!backend}
              className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] rounded-full px-3 py-1.5 transition active:scale-95"
              style={anon
                ? { color: GOLD, background: `${P.accent}1F`, border: `1px solid ${P.accent}59` }
                : { color: 'rgba(255,255,255,.40)', border: '1px solid rgba(255,255,255,.10)' }}>
              <EyeOff size={11} /> 匿名分享{anon ? '（已开启）' : ''}
            </button>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed mt-5 px-2 text-center" style={{ color: 'rgba(255,255,255,.22)' }}>
          祷告分享仅本房间成员可见，发布者可随时删除。<br />请勿在此填写他人的病历、住址等敏感信息。
        </p>
      </div>
    </div>
  );
};

export default PrayerRoomPanel;
