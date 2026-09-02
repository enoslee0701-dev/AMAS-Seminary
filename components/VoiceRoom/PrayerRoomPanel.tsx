import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HandHeart, BookOpen, Flame, Feather, ChevronRight, Crown, Shield,
  Users, Send, Trash2, EyeOff, Check, X, Plus as PlusIcon,
} from 'lucide-react';
import {
  fetchPrayerRoom, savePrayerTopics, postPrayerShare, deletePrayerShare,
  setIntercession, sendHeartbeat, leavePresence, relativeTime,
  isPrayerBackendConfigured, EMPTY_STATE, POLL_MS, HEARTBEAT_MS,
  type PrayerRoomState, type PrayerShare,
} from '../../services/prayerRoomService';

/**
 * 祷告室主面板（重新设计 · P0–P2）。
 *
 * 只服务 `prayer` 房间，其余四种房间的版式完全不受影响。
 *
 * 决策（docs/PRAYER_ROOM_REDESIGN.md）：
 *  A1 只有祷告室用这套深色暗金版式；
 *  B  「代祷」不是点赞——用 🙏 与「N 人正在为此祷告」，不用 ❤️；
 *  D1 10 秒轮询 + 20 秒心跳，不引入 WebSocket；
 *  E  祷告分享仅房内可见、可匿名、发布者与房主可删。
 */

interface Props {
  roomId: string;
  meName: string;
  meAvatar: string;
  fontSize: number;
  showToast: (msg: string) => void;
}

const wine = {
  card: 'bg-[#3b0b1a]/85 border border-[#5c1a2e] rounded-2xl backdrop-blur-sm',
  soft: 'bg-black/25 border border-white/10 rounded-2xl',
};

/** 头像取不到时用姓名首字生成，不显示碎图。 */
const Avatar: React.FC<{ src?: string | null; name: string; size?: number; ring?: string }> =
  ({ src, name, size = 44, ring = 'ring-[#C99A45]/40' }) => (
    <div className={`relative rounded-full overflow-hidden ring-2 ${ring} shrink-0`} style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt={name} className="w-full h-full object-cover" />
        : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#5c1a2e] to-[#2a0812]">
            <span className="text-white font-black" style={{ fontSize: size * 0.38 }}>{name.slice(0, 1)}</span>
          </div>
        )}
    </div>
  );

/** 每日经文：按日期确定性选取，同一天所有人看到同一节。 */
const DAILY_VERSES: { ref: string; text: string }[] = [
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

const PrayerRoomPanel: React.FC<Props> = ({ roomId, meName, meAvatar, fontSize, showToast }) => {
  const [state, setState] = useState<PrayerRoomState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [editingTopics, setEditingTopics] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [panel, setPanel] = useState<null | 'topics' | 'verse' | 'quiet'>(null);
  const [quietSec, setQuietSec] = useState(0);
  const backend = isPrayerBackendConfigured();
  const topicsRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const s = await fetchPrayerRoom(roomId);
    if (s) setState(s);
    setLoaded(true);
  }, [roomId]);

  // D1 轮询：10 秒拉一次全量状态，20 秒发一次心跳
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

  // 安静等候计时
  useEffect(() => {
    if (panel !== 'quiet') { setQuietSec(0); return; }
    const t = window.setInterval(() => setQuietSec(s => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [panel]);

  const nowMs = state.serverTime || Date.now();
  const online = state.presence;
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
    // 乐观更新，失败时由下一轮轮询纠正
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
    showToast('已删除');
    void refresh();
  };

  const saveTopics = async () => {
    const r = await savePrayerTopics(roomId, draft);
    if (!r) { showToast('保存失败，请稍后再试'); return; }
    setState(prev => ({ ...prev, topics: r.topics }));
    setEditingTopics(false);
    showToast('祷告主题已更新，房内成员都会看到');
  };

  // ---------- 子面板 ----------
  if (panel === 'quiet') {
    const mm = String(Math.floor(quietSec / 60)).padStart(2, '0');
    const ss = String(quietSec % 60).padStart(2, '0');
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 animate-fade-in">
        <div className="w-24 h-24 rounded-full border border-[#C99A45]/40 flex items-center justify-center animate-pulse mb-6">
          <Feather size={34} className="text-[#E8C98C]" />
        </div>
        <p className="text-[#E8C98C] font-serif text-lg mb-1">安静等候</p>
        <p className="text-white/50 text-xs mb-6 text-center leading-relaxed">
          「你们要休息，要知道我是神。」<br />不必说话，也不必做什么。
        </p>
        <p className="text-white/80 font-mono text-3xl tracking-widest mb-8">{mm}:{ss}</p>
        <button onClick={() => setPanel(null)} className="text-white/60 text-xs border border-white/20 rounded-full px-5 py-2">
          结束安静
        </button>
      </div>
    );
  }

  if (panel === 'verse') {
    return (
      <div className="flex-1 flex flex-col px-4 pt-2 animate-fade-in">
        <button onClick={() => setPanel(null)} className="self-start text-white/60 text-xs mb-3 flex items-center gap-1">
          <X size={14} /> 返回
        </button>
        <div className={`${wine.card} p-6`}>
          <p className="text-[10px] font-black tracking-[2px] text-[#C99A45] uppercase mb-4">今日经文</p>
          <p className="text-white/95 font-serif leading-loose" style={{ fontSize: fontSize + 2 }}>{verse.text}</p>
          <p className="text-[#E8C98C] text-sm font-bold mt-4">— {verse.ref}</p>
        </div>
        <p className="text-white/40 text-[11px] leading-relaxed mt-4 px-1">
          每日一节，全房相同。安静读三遍，把其中一句带进祷告里。
        </p>
      </div>
    );
  }

  // ---------- 主面板 ----------
  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4 animate-fade-in">
      {/* ===== 本次祷告主题 ===== */}
      <div ref={topicsRef} className={`${wine.card} overflow-hidden mt-1`}>
        <div className="px-4 py-3 flex items-center gap-3 border-b border-[#5c1a2e]">
          <div className="w-9 h-9 rounded-full bg-[#5c1a2e] flex items-center justify-center shrink-0">
            <HandHeart size={17} className="text-[#E8C98C]" />
          </div>
          <span className="font-serif text-white text-[17px] font-bold flex-1">本次祷告主题</span>
          {state.isHost && !editingTopics && (
            <button
              onClick={() => { setDraft(state.topics.length ? state.topics.map(t => t.text) : ['']); setEditingTopics(true); }}
              className="text-[11px] font-bold text-[#E8C98C] border border-[#C99A45]/40 rounded-full px-3 py-1"
            >编辑</button>
          )}
        </div>

        <div className="p-4">
          {editingTopics ? (
            <div className="space-y-2">
              {draft.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#5c1a2e] text-[#E8C98C] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <input
                    value={t} autoFocus={i === draft.length - 1}
                    onChange={e => setDraft(d => d.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="例如：为教会复兴祷告"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#C99A45]/50"
                  />
                  <button onClick={() => setDraft(d => d.filter((_, j) => j !== i))} className="text-white/40 p-1"><X size={15} /></button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                {draft.length < 12 && (
                  <button onClick={() => setDraft(d => [...d, ''])} className="text-[11px] text-white/60 border border-dashed border-white/20 rounded-lg px-3 py-1.5 flex items-center gap-1">
                    <PlusIcon size={12} /> 添加一条
                  </button>
                )}
                <div className="flex-1" />
                <button onClick={() => setEditingTopics(false)} className="text-[11px] text-white/50 px-3 py-1.5">取消</button>
                <button onClick={saveTopics} className="text-[11px] font-bold text-[#123061] bg-gradient-to-b from-[#F4D796] to-[#E1B75F] rounded-full px-4 py-1.5">保存</button>
              </div>
            </div>
          ) : state.topics.length ? (
            <div className="space-y-3">
              {state.topics.map(t => (
                <div key={t.id} className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#5c1a2e] text-[#E8C98C] text-xs font-bold flex items-center justify-center shrink-0 mt-[1px]">{t.seq}</span>
                  <p className="text-rose-50/95 font-serif leading-relaxed flex-1" style={{ fontSize }}>{t.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-sm py-3 text-center">
              {state.isHost ? '点击「编辑」写下本次的祷告主题，房内成员都会看到。' : '房主还没有设置本次祷告主题。'}
            </p>
          )}
        </div>
      </div>

      {/* ===== 在线成员 ===== */}
      <div className={`${wine.soft} p-4 mt-3`}>
        <div className="flex items-center mb-3">
          <span className="font-serif text-white text-[15px] font-bold">在线成员</span>
          <span className="ml-2 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="ml-1.5 text-[11px] text-white/60">{online.length} 人在线</span>
          {online.length > 6 && (
            <button onClick={() => setShowAllMembers(v => !v)} className="ml-auto text-[11px] text-white/60 border border-white/15 rounded-full px-3 py-1 flex items-center gap-1">
              {showAllMembers ? '收起' : '查看全部'} <ChevronRight size={11} />
            </button>
          )}
        </div>
        {online.length === 0 ? (
          <p className="text-white/40 text-xs py-2">
            {backend ? '正在同步房间成员…' : '多人在线需要连接服务器，当前未配置后端地址。'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {shown.map(p => (
              <div key={p.userId} className="flex flex-col items-center w-12">
                <div className="relative">
                  <Avatar src={p.avatar} name={p.name} size={44} />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#1a0510]" />
                  {p.role === 'host' && (
                    <span className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[#1a0510]">
                      <Crown size={8} className="text-white" fill="currentColor" />
                    </span>
                  )}
                  {p.role === 'admin' && (
                    <span className="absolute -top-1 -right-1 bg-purple-500 rounded-full p-0.5 border border-[#1a0510]">
                      <Shield size={8} className="text-white" fill="currentColor" />
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-white/70 font-bold mt-1 truncate w-full text-center">{p.name}</span>
              </div>
            ))}
            {!showAllMembers && online.length > 6 && (
              <button onClick={() => setShowAllMembers(true)} className="w-11 h-11 rounded-full bg-white/5 border border-white/15 flex flex-col items-center justify-center">
                <Users size={12} className="text-white/60" />
                <span className="text-[9px] text-white/60 font-bold">{online.length - 6}+</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== 三个入口 ===== */}
      <div className="grid grid-cols-3 gap-2.5 mt-3">
        {([
          { key: 'topics' as const, icon: BookOpen, title: '祷告事项', sub: '查看并参与\n代祷事项' },
          { key: 'verse' as const, icon: Flame, title: '经文默想', sub: '每日一节经文\n安静默想' },
          { key: 'quiet' as const, icon: Feather, title: '安静等候', sub: '安静在主里\n等候祂' },
        ]).map(c => (
          <button
            key={c.key}
            onClick={() => {
              if (c.key === 'topics') topicsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              else setPanel(c.key);
            }}
            className={`${wine.soft} p-3 flex flex-col items-center text-center active:scale-95 transition`}
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C99A45] to-[#8A6519] flex items-center justify-center mb-2">
              <c.icon size={17} className="text-white" />
            </div>
            <span className="font-serif text-white text-[13px] font-bold">{c.title}</span>
            <span className="text-[9.5px] text-white/45 leading-snug mt-1 whitespace-pre-line">{c.sub}</span>
            <ChevronRight size={13} className="text-white/30 mt-2" />
          </button>
        ))}
      </div>

      {/* ===== 祷告分享 ===== */}
      <div className={`${wine.soft} p-4 mt-3`}>
        <div className="flex items-center mb-1">
          <span className="font-serif text-white text-[15px] font-bold">祷告分享</span>
          <span className="ml-auto text-[10px] text-white/40">仅房内可见</span>
        </div>
        <p className="text-[10px] text-white/35 leading-relaxed mb-3">
          写下需要代祷的事。涉及他人的内容请先征得对方同意，也可以选择匿名。
        </p>

        {state.shares.length === 0 ? (
          <p className="text-white/40 text-xs py-3 text-center">
            {loaded ? '还没有人分享。第一个说出来的，往往最需要勇气。' : '正在加载…'}
          </p>
        ) : state.shares.map(s => (
          <div key={s.id} className="flex gap-3 py-3 border-t border-white/8 first:border-t-0">
            <Avatar src={s.isAnonymous ? null : undefined} name={s.isAnonymous ? '匿' : (s.userId ?? '弟')} size={38} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-bold text-white/90">
                  {s.isAnonymous ? '一位弟兄姊妹' : (s.isMine ? '我' : (s.userId ?? '弟兄姊妹'))}
                </span>
                {s.isAnonymous && <EyeOff size={10} className="text-white/30" />}
                <span className="text-[10px] text-white/35">{relativeTime(s.createdAt, nowMs)}</span>
                {s.isMine && (
                  <button onClick={() => removeShare(s)} className="ml-auto text-white/30 p-1" aria-label="删除">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <p className="text-[12.5px] text-white/75 leading-relaxed mt-1 break-words">{s.text}</p>
              <button
                onClick={() => toggleIntercede(s)}
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition active:scale-95 ${
                  s.didIntercede
                    ? 'bg-[#5c1a2e] text-[#E8C98C] border border-[#C99A45]/40'
                    : 'bg-white/5 text-white/60 border border-white/10'
                }`}
              >
                <span>🙏</span>
                {s.intercessions > 0
                  ? <span>{s.intercessions} 人正在为此祷告</span>
                  : <span>我为你祷告</span>}
                {s.didIntercede && <Check size={11} />}
              </button>
            </div>
          </div>
        ))}

        {/* 分享输入 */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-end gap-2">
            <textarea
              value={text} onChange={e => setText(e.target.value)} rows={2}
              placeholder={backend ? '输入祷告内容…' : '需要连接服务器后才能分享'}
              disabled={!backend}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-[12.5px] outline-none resize-none focus:border-[#C99A45]/50 disabled:opacity-40"
            />
            <button
              onClick={submitShare} disabled={!backend || !text.trim()}
              aria-label="发送祷告"
              className="w-10 h-10 rounded-full bg-gradient-to-b from-[#F4D796] to-[#E1B75F] flex items-center justify-center shrink-0 disabled:opacity-35 active:scale-95 transition"
            >
              <Send size={16} className="text-[#123061]" />
            </button>
          </div>
          <button
            onClick={() => setAnon(v => !v)} disabled={!backend}
            className={`mt-2 inline-flex items-center gap-1.5 text-[11px] rounded-full px-3 py-1 border transition ${
              anon ? 'bg-[#5c1a2e] text-[#E8C98C] border-[#C99A45]/40' : 'text-white/45 border-white/10'
            }`}
          >
            <EyeOff size={11} /> 匿名分享{anon ? '（已开启）' : ''}
          </button>
        </div>
      </div>

      <p className="text-white/25 text-[10px] leading-relaxed mt-4 px-1">
        祷告分享仅本房间成员可见，发布者可随时删除。请勿在此填写他人的病历、住址等敏感信息。
      </p>
    </div>
  );
};

export default PrayerRoomPanel;
