import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Sparkles, Target, TrendingUp,
  ShieldCheck, RefreshCw, BookOpen, ArrowDown, Compass,
} from 'lucide-react';
import { Course } from '../types';

/**
 * 定制化神学 — AI 个性化神学装备系统 (v1)。
 *
 * 流程：认识我(自适应诊断对话) → 九维评分 → 神学成长画像 →
 * 装备路径(阶段化处方，挂接真实课程) → 持续训练 → 重新诊断。
 *
 * v1 的诊断由本地自适应规则驱动（按身份/受训背景动态选题与调难度），
 * 不依赖外部 AI 服务；配置 GEMINI_API_KEY 后可升级为自由对话式诊断
 * （架构预留：answers/scores 结构与对话式 UI 均可复用）。
 */

// ---------- 九维模型 ----------

type DimKey =
  | 'bible' | 'hermeneutics' | 'theology' | 'gospel' | 'life'
  | 'church' | 'ministry' | 'apologetics' | 'mission';

interface DimMeta {
  key: DimKey;
  label: string;
  strength: string;
  weakness: string;
  training: string[];
  courseIds: string[];
  weeks: number;
}

const DIMS: DimMeta[] = [
  { key: 'bible', label: '圣经基础', strength: '圣经整体结构与内容较为熟悉', weakness: '圣经整体框架与书卷脉络需要系统建立', training: ['新旧约整体脉络', '救恩历史主线', '书卷背景与结构'], courseIds: ['c_bible_intro', 'c_1cor'], weeks: 4 },
  { key: 'hermeneutics', label: '解经能力', strength: '能留意上下文与经文原意', weakness: '解经容易跳过观察与解释、直接进入应用', training: ['经文观察', '上下文判断', '历史背景', '中心思想提炼', '从解释到应用'], courseIds: ['c_dr_marking', 'c_bible_intro'], weeks: 3 },
  { key: 'theology', label: '系统神学', strength: '具备基本的教义框架', weakness: '系统神学框架较零散，教义之间缺少整体关联', training: ['神论与基督论', '救恩论要点', '教义整体框架'], courseIds: ['c_lay_systematic'], weeks: 4 },
  { key: 'gospel', label: '福音根基', strength: '对恩典与称义的核心认识清楚', weakness: '恩典与行为的关系需要进一步厘清', training: ['因信称义', '恩典与成圣', '福音与日常生活'], courseIds: ['c_romans', 'c_basics'], weeks: 3 },
  { key: 'life', label: '属灵生命', strength: '有稳定的读经祷告习惯', weakness: '灵修与属灵纪律需要重建节奏', training: ['祷告操练', '读经计划', '属灵纪律与品格'], courseIds: ['c_prayer', 'c_assurance'], weeks: 3 },
  { key: 'church', label: '教会生活', strength: '看重教会生活与肢体连结', weakness: '教会观与服事秩序的根基需要补强', training: ['教会论基础', '崇拜与圣礼', '肢体生活与权柄'], courseIds: ['c_worship_order', 'c_church_ops'], weeks: 3 },
  { key: 'ministry', label: '事奉能力', strength: '有实际带领与服事经验', weakness: '带领与教导的方法需要系统装备', training: ['小组带领', '门徒训练', '讲道预备入门'], courseIds: ['c_smallgroup', 'c_disciple', 'c_evangelism'], weeks: 4 },
  { key: 'apologetics', label: '护教分辨', strength: '对错误教导有基本警觉', weakness: '面对异端与错谬时缺少系统的判断框架', training: ['正统信仰要点', '异端识别原则', '牧养式沟通'], courseIds: ['c_warfare', 'c_dr_jude'], weeks: 3 },
  { key: 'mission', label: '宣教使命', strength: '对大使命有负担', weakness: '宣教视野与处境化理解可以进一步拓宽', training: ['大使命根基', '处境化原则', '职场与家庭见证'], courseIds: ['c_contextual', 'c_evangelism'], weeks: 3 },
];

const DIM_BY_KEY: Record<string, DimMeta> = Object.fromEntries(DIMS.map(d => [d.key, d]));

// ---------- 自适应题库 ----------

interface QOption { text: string; score?: number; tier?: number; focus?: DimKey }
interface Question {
  id: string;
  dim?: DimKey;              // 计分维度；无 dim 的是背景题
  minTier?: number;          // 仅在受访者层级 >= minTier 时使用（进阶变体）
  maxTier?: number;          // 仅在层级 <= maxTier 时使用（基础变体）
  text: string;
  options: QOption[];
}

// 背景题（决定后续出题深度）
const BG_QUESTIONS: Question[] = [
  {
    id: 'bg_role',
    text: '为了给你设计合适的装备路径，我想先了解你：你目前在教会中的角色更接近哪一种？',
    options: [
      { text: '慕道 / 初信不久', tier: 0 },
      { text: '稳定聚会的信徒', tier: 1 },
      { text: '服事同工 / 小组长', tier: 2 },
      { text: '传道人 / 牧者', tier: 3 },
    ],
  },
  {
    id: 'bg_training',
    text: '你之前接受过神学装备吗？',
    options: [
      { text: '还没有系统学习过', tier: 0 },
      { text: '零散听过一些课程或讲座', tier: 1 },
      { text: '读过部分神学课程（函授/在线）', tier: 2 },
      { text: '完成过神学院课程', tier: 3 },
    ],
  },
  {
    id: 'bg_need',
    text: '目前你最想优先解决的是哪方面？（这会影响你的装备路径重点）',
    options: [
      { text: '更系统地认识圣经', focus: 'bible' },
      { text: '生命与灵修的成长', focus: 'life' },
      { text: '带领与服事的装备', focus: 'ministry' },
      { text: '分辨异端与错误教导', focus: 'apologetics' },
    ],
  },
];

// 维度题（每个维度一题；部分有基础/进阶两个变体，按层级选择）
// 设计上覆盖 知道→理解→应用→教导 四层：低层级问“知道/理解”，高层级问“应用/教导”。
const DIM_QUESTIONS: Question[] = [
  {
    id: 'bible_low', dim: 'bible', maxTier: 1,
    text: '先聊聊圣经阅读：下面哪句更接近你现在的状态？',
    options: [
      { text: '还没有通读过圣经，读经比较随机', score: 30 },
      { text: '常读新约，旧约很多卷还不熟悉', score: 50 },
      { text: '通读过一遍圣经，大致知道各卷讲什么', score: 70 },
      { text: '多次通读，能说出多数书卷的主题与脉络', score: 88 },
    ],
  },
  {
    id: 'bible_high', dim: 'bible', minTier: 2,
    text: '如果请你用几句话向同工讲清楚“整本圣经的救恩主线”（创造—堕落—救赎—新造），你有多大把握？',
    options: [
      { text: '说不太上来，主要熟悉个别经卷', score: 45 },
      { text: '能讲个大概，但衔接不够清楚', score: 62 },
      { text: '能比较完整地讲出主线并举例', score: 80 },
      { text: '能自如地教导别人，并连接到具体书卷', score: 92 },
    ],
  },
  {
    id: 'herm_low', dim: 'hermeneutics', maxTier: 1,
    text: '读到一段不容易明白的经文时，你通常会怎么做？',
    options: [
      { text: '跳过去，或凭感动理解', score: 30 },
      { text: '直接找一个应用点套在自己身上', score: 45 },
      { text: '先看上下文，再想它对我的意义', score: 70 },
      { text: '查上下文和背景，先弄清原意再应用', score: 88 },
    ],
  },
  {
    id: 'herm_high', dim: 'hermeneutics', minTier: 2,
    text: '预备一篇信息时，从经文到讲章，你的流程更接近哪一种？',
    options: [
      { text: '先定主题，再找配合主题的经文', score: 40 },
      { text: '读几遍经文，把感动整理成三点', score: 55 },
      { text: '观察—解释—应用，逐步推出中心思想', score: 80 },
      { text: '完整释经流程，并检验应用是否出于经文原意', score: 93 },
    ],
  },
  {
    id: 'theology_q', dim: 'theology',
    text: '关于“三位一体”，下面哪句表述是正确的？',
    options: [
      { text: '父、子、圣灵是同一位神的三种不同形态', score: 35 },
      { text: '父是真神，子和圣灵是被造的', score: 20 },
      { text: '一位神，三个位格，同质、同权、同荣', score: 90 },
      { text: '说不准，这个问题我还不太清楚', score: 40 },
    ],
  },
  {
    id: 'gospel_q', dim: 'gospel',
    text: '一位信徒因为跌倒犯罪，觉得“神已经不爱我了，我大概失去救恩了”。你会怎样帮助他？（这是应用题，选最接近你会说的）',
    options: [
      { text: '劝他多做好事、多服事来弥补', score: 25 },
      { text: '告诉他不要想太多，神不会计较', score: 40 },
      { text: '带他回到福音：称义在乎基督的义，引导认罪悔改并确信恩典', score: 92 },
      { text: '我也不确定该怎么回应这种情况', score: 45 },
    ],
  },
  {
    id: 'life_q', dim: 'life',
    text: '过去一个月，你的灵修生活更接近哪种状态？',
    options: [
      { text: '几乎没有固定的读经祷告', score: 30 },
      { text: '想坚持但常中断，主要靠聚会', score: 50 },
      { text: '大部分日子有读经或祷告', score: 72 },
      { text: '有稳定的灵修节奏，也操练顺服与省察', score: 90 },
    ],
  },
  {
    id: 'church_q', dim: 'church',
    text: '关于教会，你更认同哪种理解？',
    options: [
      { text: '教会主要是听道和聚会的场所', score: 40 },
      { text: '信仰是个人的事，教会可有可无', score: 20 },
      { text: '教会是基督的身体，信徒彼此连结、一同事奉', score: 88 },
      { text: '没认真想过这个问题', score: 35 },
    ],
  },
  {
    id: 'ministry_low', dim: 'ministry', maxTier: 1,
    text: '在服事参与上，你现在的情况是？',
    options: [
      { text: '还没有参与服事', score: 30 },
      { text: '偶尔帮忙做一些事务性服事', score: 50 },
      { text: '有固定服事岗位', score: 70 },
      { text: '带领他人（小组/门训/教导）', score: 86 },
    ],
  },
  {
    id: 'ministry_high', dim: 'ministry', minTier: 2,
    text: '如果要带一位初信者开始门徒训练，你会怎么开始？',
    options: [
      { text: '先让他多参加聚会，慢慢就会成长', score: 45 },
      { text: '给他一本书或课程让他自己学', score: 55 },
      { text: '定期见面，从福音确据和读经祷告开始陪伴', score: 85 },
      { text: '有一套自己实践过的门训路径，并按他的情况调整', score: 94 },
    ],
  },
  {
    id: 'apolo_q', dim: 'apologetics',
    text: '有人对你说：“耶稣是神造的第一个受造物。”你会如何判断？',
    options: [
      { text: '听起来有道理，说不出问题在哪', score: 25 },
      { text: '感觉不对，但讲不清楚为什么', score: 45 },
      { text: '这是古代亚流主义的翻版，违背“子与父同质”的正统信仰', score: 92 },
      { text: '不同教会说法不同，无所谓对错', score: 20 },
    ],
  },
  {
    id: 'mission_q', dim: 'mission',
    text: '关于宣教与使命，你更接近哪种状态？',
    options: [
      { text: '觉得那是宣教士的事，与我关系不大', score: 30 },
      { text: '有感动，但不知道自己能做什么', score: 52 },
      { text: '在职场/家庭中有意识地作见证', score: 74 },
      { text: '持续参与或支持宣教，理解处境化的重要性', score: 90 },
    ],
  },
];

// ---------- 画像与路径 ----------

interface CTState {
  tier: number;
  focus: DimKey | null;
  scores: Record<DimKey, number>;
  completedAt: string;
}

const STORAGE_KEY = 'amas_ct_state';

const loadCT = (): CTState | null => {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const saveCT = (s: CTState) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };

const stageOf = (avg: number, tier: number): { name: string; level: number } => {
  if (avg >= 78 && tier >= 2) return { name: '成熟装备者', level: 4 };
  if (avg >= 63) return { name: '成长型服事者', level: 3 };
  if (avg >= 47) return { name: '稳定成长者', level: 2 };
  return { name: '初信扎根者', level: 1 };
};

interface ChatMsg { id: string; role: 'ai' | 'me'; text: string }

interface Props {
  onBack: () => void;
  courses: Course[];
  onCourseClick: (id: string) => void;
}

const CustomTheologyView: React.FC<Props> = ({ onBack, courses, onCourseClick }) => {
  const [ct, setCt] = useState<CTState | null>(() => loadCT());
  const [mode, setMode] = useState<'home' | 'quiz'>('home');

  // ---- 诊断对话状态 ----
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [tier, setTier] = useState(0);
  const [focus, setFocus] = useState<DimKey | null>(null);
  const [scores, setScores] = useState<Partial<Record<DimKey, number>>>({});
  const [queueIdx, setQueueIdx] = useState(0); // 0..2 背景题；3+ 维度题
  const [current, setCurrent] = useState<Question | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, current]);

  const dimQueueFor = (t: number, f: DimKey | null): Question[] => {
    const picked: Question[] = [];
    for (const d of DIMS) {
      const variants = DIM_QUESTIONS.filter(q => q.dim === d.key)
        .filter(q => (q.minTier === undefined || t >= q.minTier) && (q.maxTier === undefined || t <= q.maxTier));
      if (variants.length) picked.push(variants[0]);
    }
    // 优先问用户最关心的维度，体验上更像“围绕我提问”
    if (f) picked.sort((a, b) => (a.dim === f ? -1 : 0) - (b.dim === f ? -1 : 0));
    return picked;
  };
  const [dimQueue, setDimQueue] = useState<Question[]>([]);

  const startQuiz = () => {
    setMsgs([{ id: 'w', role: 'ai', text: '你好！我是你的装备顾问。接下来大约 5 分钟、十几个问题——我会先认识你，再为你设计专属的装备路径。放轻松，按真实情况选择即可。' }]);
    setTier(0); setFocus(null); setScores({}); setQueueIdx(0);
    setDimQueue([]);
    setCurrent(BG_QUESTIONS[0]);
    setMode('quiz');
  };

  const totalQuestions = BG_QUESTIONS.length + DIMS.length;

  const answer = (opt: QOption) => {
    if (!current) return;
    setMsgs(prev => [
      ...prev,
      { id: `q-${current.id}`, role: 'ai', text: current.text },
      { id: `a-${current.id}`, role: 'me', text: opt.text },
    ]);

    let nextTier = tier;
    let nextFocus = focus;
    const nextScores = { ...scores };
    if (opt.tier !== undefined) nextTier = Math.max(tier, opt.tier);
    if (opt.focus) nextFocus = opt.focus;
    if (current.dim && opt.score !== undefined) nextScores[current.dim] = opt.score;
    setTier(nextTier); setFocus(nextFocus); setScores(nextScores);

    const nextIdx = queueIdx + 1;
    setQueueIdx(nextIdx);

    if (nextIdx < BG_QUESTIONS.length) {
      setCurrent(BG_QUESTIONS[nextIdx]);
      return;
    }
    let queue = dimQueue;
    if (nextIdx === BG_QUESTIONS.length) {
      queue = dimQueueFor(nextTier, nextFocus);
      setDimQueue(queue);
    }
    const dimIdx = nextIdx - BG_QUESTIONS.length;
    if (dimIdx < queue.length) {
      setCurrent(queue[dimIdx]);
    } else {
      // 诊断完成 → 生成画像
      const full = {} as Record<DimKey, number>;
      for (const d of DIMS) full[d.key] = nextScores[d.key] ?? 50;
      if (nextFocus) full[nextFocus] = Math.max(20, full[nextFocus] - 4); // 用户自认的短板略降权，确保进入路径
      const state: CTState = { tier: nextTier, focus: nextFocus, scores: full, completedAt: new Date().toISOString() };
      saveCT(state); setCt(state);
      setCurrent(null);
      setMsgs(prev => [...prev, { id: 'done', role: 'ai', text: '诊断完成！我已经为你生成了「神学成长画像」和专属装备路径，一起来看看。' }]);
      setTimeout(() => setMode('home'), 900);
    }
  };

  // ---- 画像派生 ----
  const derive = (s: CTState) => {
    const entries = DIMS.map(d => ({ meta: d, score: s.scores[d.key] }));
    const sorted = [...entries].sort((a, b) => a.score - b.score);
    const weak = sorted.slice(0, 3);
    const strong = [...entries].sort((a, b) => b.score - a.score).slice(0, 3).filter(e => e.score >= 60);
    const avg = Math.round(entries.reduce((t, e) => t + e.score, 0) / entries.length);
    const stage = stageOf(avg, s.tier);
    // 装备路径：焦点维度优先，其后按分数从低到高
    const pathDims: typeof weak = [];
    if (s.focus) {
      const f = entries.find(e => e.meta.key === s.focus)!;
      pathDims.push(f);
    }
    for (const w of weak) if (!pathDims.some(p => p.meta.key === w.meta.key)) pathDims.push(w);
    return { entries, strong, weak, avg, stage, path: pathDims.slice(0, 3) };
  };

  const courseById = (id: string) => courses.find(c => c.id === id);

  const Bar: React.FC<{ label: string; score: number; highlight?: boolean }> = ({ label, score, highlight }) => (
    <div className="flex items-center" style={{ gap: 10 }}>
      <span className="shrink-0" style={{ width: 58, fontSize: 12, fontWeight: 600, color: highlight ? '#9A1239' : '#475467' }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, backgroundColor: '#EEF1F5' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${score}%`,
            background: highlight
              ? 'linear-gradient(90deg,#C2410C,#F59E0B)'
              : score >= 70
                ? 'linear-gradient(90deg,#04285F,#2563EB)'
                : 'linear-gradient(90deg,#C99A45,#E8C98C)',
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      <span className="shrink-0 text-right" style={{ width: 26, fontSize: 12, fontWeight: 800, color: '#1F2A37' }}>{score}</span>
    </div>
  );

  // ================= 渲染 =================

  if (mode === 'quiz') {
    const answered = Math.min(queueIdx, totalQuestions);
    return (
      <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
        <div className="flex items-center px-4 bg-white border-b border-slate-200" style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: 10 }}>
          <button onClick={() => setMode('home')} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
            <ChevronLeft size={24} className="text-slate-900" />
          </button>
          <div className="flex-1 ml-2">
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>AI 装备诊断</p>
            <div className="rounded-full overflow-hidden" style={{ height: 4, backgroundColor: '#EEF1F5', marginTop: 5 }}>
              <div style={{ height: '100%', width: `${(answered / totalQuestions) * 100}%`, background: 'linear-gradient(90deg,#04285F,#C99A45)', transition: 'width 0.4s ease' }} />
            </div>
          </div>
          <span className="ml-3 shrink-0" style={{ fontSize: 11, fontWeight: 700, color: '#98A2B3' }}>{answered}/{totalQuestions}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {msgs.map(m => (
            <div key={m.id} className={`flex ${m.role === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[86%] whitespace-pre-wrap"
                style={{
                  padding: '10px 13px', fontSize: 13.5, lineHeight: '21px',
                  borderRadius: m.role === 'me' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  ...(m.role === 'me'
                    ? { background: '#04285F', color: '#FFF' }
                    : { background: '#FFF', color: '#1F2A37', border: '1px solid #E8E4DA' }),
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          {current && (
            <div className="flex justify-start">
              <div className="max-w-[92%]" style={{ padding: '12px 14px', borderRadius: '16px 16px 16px 4px', background: '#FFF', border: '1px solid #E8E4DA' }}>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: '21px', color: '#1F2A37', fontWeight: 600 }}>{current.text}</p>
                <div className="flex flex-col" style={{ gap: 8, marginTop: 12 }}>
                  {current.options.map((o, i) => (
                    <button
                      key={i}
                      onClick={() => answer(o)}
                      className="text-left active:scale-[0.99] transition-transform"
                      style={{
                        fontSize: 13, lineHeight: '19px', color: '#04285F', fontWeight: 600,
                        border: '1.5px solid rgba(4,40,95,0.22)', borderRadius: 12,
                        padding: '10px 12px', background: '#F8FAFF',
                      }}
                    >
                      {o.text}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
    );
  }

  // ---- 主页 ----
  const portrait = ct ? derive(ct) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
      <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
        <button onClick={onBack} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
          <ChevronLeft size={24} className="text-slate-900" />
        </button>
        <h2 className="ml-2 font-bold text-lg text-slate-900">定制化神学</h2>
      </div>

      <div className="p-4 pt-content-safe space-y-4">
        {/* 引导卡 */}
        <div
          style={{
            borderRadius: 16, padding: '18px 16px',
            background: 'linear-gradient(160deg, #0B2450 0%, #071A3C 70%, #051530 100%)',
            border: '1px solid rgba(232,201,140,0.18)',
          }}
        >
          <div className="flex items-center" style={{ gap: 8 }}>
            <Sparkles size={16} color="#E8C98C" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#E8C98C', letterSpacing: '1px' }}>
              认识你，才能装备你
            </h3>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: '19px', color: 'rgba(255,255,255,0.85)' }}>
            不是每个人都需要从同一课开始。AI 将根据你的
            <b style={{ color: '#E8C98C' }}> 信仰 · 圣经 · 神学 · 生命 · 服事 </b>
            五个方面，诊断你现在最需要装备什么，并建立专属成长路径。
          </p>
          <button
            onClick={startQuiz}
            className="mt-4 inline-flex items-center active:scale-95 transition"
            style={{
              background: '#E8C98C', color: '#04285F', borderRadius: 999,
              fontWeight: 800, fontSize: 13, height: 36, paddingLeft: 16, paddingRight: 12, gap: 4,
            }}
          >
            {ct ? '重新进行 AI 诊断' : '开始 AI 诊断（约 5 分钟）'}
            <ChevronRight size={15} strokeWidth={2.6} />
          </button>
        </div>

        {portrait && ct && (
          <>
            {/* 成长画像 */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center">
                  <div className="p-2 bg-amber-50 rounded-lg mr-3"><TrendingUp size={18} className="text-amber-600" /></div>
                  <h3 className="font-bold text-base text-slate-800">我的神学成长画像</h3>
                </div>
                <button onClick={startQuiz} aria-label="重新诊断" className="p-2 rounded-full text-slate-300 hover:text-slate-500 transition">
                  <RefreshCw size={15} />
                </button>
              </div>
              <div className="flex items-baseline" style={{ gap: 8, margin: '8px 0 14px' }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#04285F' }}>{portrait.stage.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#C99A45' }}>Level {portrait.stage.level}</span>
                <span style={{ fontSize: 11, color: '#98A2B3' }}>综合 {portrait.avg} 分</span>
              </div>
              <div className="space-y-2.5">
                {portrait.entries.map(e => (
                  <Bar key={e.meta.key} label={e.meta.label} score={e.score} highlight={portrait.path[0]?.meta.key === e.meta.key} />
                ))}
              </div>

              {portrait.strong.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 800, color: '#137A4F' }}>✦ 优势</p>
                  {portrait.strong.map(s => (
                    <p key={s.meta.key} style={{ margin: '0 0 3px', fontSize: 12, color: '#475467' }}>· {s.meta.strength}</p>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 800, color: '#B42318' }}>✦ 需要加强</p>
                {portrait.weak.map(w => (
                  <p key={w.meta.key} style={{ margin: '0 0 3px', fontSize: 12, color: '#475467' }}>· {w.meta.weakness}</p>
                ))}
              </div>
            </div>

            {/* 当前重点 */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="p-2 bg-rose-50 rounded-lg mr-3"><Target size={18} className="text-rose-600" /></div>
                <h3 className="font-bold text-base text-slate-800">当前重点</h3>
              </div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#1F2A37' }}>{portrait.path[0].meta.label}</p>
              <p style={{ margin: '4px 0 10px', fontSize: 12, color: '#667085', lineHeight: '19px' }}>
                {portrait.path[0].meta.weakness}。这是你现在最值得优先强化的能力。
              </p>
              {portrait.path[0].meta.courseIds.map(id => courseById(id)).filter(Boolean).slice(0, 1).map(c => (
                <button
                  key={c!.id}
                  onClick={() => onCourseClick(c!.id)}
                  className="inline-flex items-center active:scale-95 transition"
                  style={{
                    background: '#04285F', color: '#E8C98C', borderRadius: 999,
                    fontWeight: 800, fontSize: 12.5, height: 34, paddingLeft: 14, paddingRight: 10, gap: 4,
                  }}
                >
                  继续训练：{c!.title}
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>

            {/* 装备路径 */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center mb-3">
                <div className="p-2 bg-blue-50 rounded-lg mr-3"><Compass size={18} className="text-blue-700" /></div>
                <h3 className="font-bold text-base text-slate-800">我的装备路径</h3>
              </div>
              {portrait.path.map((p, i) => (
                <React.Fragment key={p.meta.key}>
                  {i > 0 && (
                    <div className="flex justify-center" style={{ padding: '2px 0' }}>
                      <ArrowDown size={14} color="#C9C2B5" />
                    </div>
                  )}
                  <div style={{ border: '1px solid #EEEAE0', borderRadius: 14, padding: '12px 13px' }}>
                    <div className="flex items-center justify-between">
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#1F2A37' }}>
                        第{['一', '二', '三'][i]}阶段 · {p.meta.label}
                      </p>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#C99A45' }}>约 {p.meta.weeks} 周</span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#667085', lineHeight: '18px' }}>
                      训练：{p.meta.training.join(' · ')}
                    </p>
                    <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                      {p.meta.courseIds.map(id => courseById(id)).filter(Boolean).map(c => (
                        <button
                          key={c!.id}
                          onClick={() => onCourseClick(c!.id)}
                          className="inline-flex items-center active:scale-95 transition"
                          style={{
                            fontSize: 11.5, fontWeight: 700, color: '#04285F',
                            border: '1px solid rgba(4,40,95,0.25)', borderRadius: 999,
                            padding: '5px 10px', background: '#F8FAFF', gap: 3,
                          }}
                        >
                          <BookOpen size={11} /> {c!.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </React.Fragment>
              ))}
              <p style={{ margin: '12px 0 0', fontSize: 10.5, color: '#98A2B3', lineHeight: '16px' }}>
                路径会随你的学习与再次诊断动态调整；完成一个阶段后，建议重新诊断以更新画像。
              </p>
            </div>
          </>
        )}

        {/* 神学框架边界说明 */}
        <div className="flex items-start bg-white rounded-2xl p-4 border border-slate-200" style={{ gap: 10 }}>
          <ShieldCheck size={16} className="text-slate-400 shrink-0" style={{ marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 10.5, color: '#98A2B3', lineHeight: '16px' }}>
            诊断与建议在 AMAS 神学框架内进行，以圣经为最高权威、以学院官方教导为准；涉及争议性神学议题时，请以课程与导师的引导为主。
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomTheologyView;
