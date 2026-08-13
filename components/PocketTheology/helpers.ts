// ============================================================
// PocketTheology · HELPERS
// (Extracted verbatim from PocketTheologyView.tsx lines 1116-1283.)
// ============================================================

import type { PTLesson, PTBadge, PTProgressEntry, PTStreak, PTJournalEntry, PTUserState, PTDeepDive } from './types';
import { LEVELS, LESSONS, BADGES, XP_TIERS, GLOSSARY } from './constants';

// ============================================================
// 7. HELPERS
// ============================================================

export const STORAGE_KEY = 'amas_pt_state';
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
export const getWeekRange = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
};
export const getWeekKey = (date = new Date()) => getWeekRange(date).start.toISOString().slice(0, 10);
export const fmtDate = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
export const defaultState = (): PTUserState => ({ xp: 0, streak: { current: 0, longest: 0, lastDate: '' }, progress: {}, badges: [], journal: [], dailyGoalMinutes: 3, favorites: [] });
export const loadState = (): PTUserState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    return { ...defaultState(), ...p, streak: { ...defaultState().streak, ...(p.streak || {}) }, progress: p.progress || {}, badges: p.badges || [], journal: p.journal || [], favorites: p.favorites || [] };
  } catch { return defaultState(); }
};
export const saveState = (s: PTUserState) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };
export const xpTierFor = (xp: number) => XP_TIERS.find(l => xp >= l.min && xp <= l.max) || XP_TIERS[0];

export const lessonsOfLevel = (levelId: string) => LESSONS.filter(l => l.levelId === levelId).sort((a, b) => a.order - b.order);
export const lessonsOfTradition = (tid: string) => LESSONS.filter(l => l.traditionId === tid).sort((a, b) => a.order - b.order);

// Optional deep-dive content for select lessons (历史背景 / 神学家 / 宗派比较)
export const DEEP_DIVES: Record<string, PTDeepDive> = {
  'l1_1': {
    title: '神的形象（Imago Dei）的三种解读',
    content: '神学家给出三个互补的解读：①结构论（教父、阿奎那）：神形象指人独特的能力——理性、意志、不朽的灵魂。②关系论（卡尔·巴特）：三一神是关系性的，所以人也是关系性的——男女互补、群体生活反映神。③功能论（韦斯特敏斯特、N.T. Wright）：人是神在世界上的「代表 / 形象」，托管受造之物，反映神的统治。三种合起来才完整：人有特殊能力、活在关系里、并被赋予使命。',
    sources: ['创世记 1:26-28', '卡尔·巴特《教会教义学》'],
  },
  'l1_4': {
    title: '迦克墩信经的「四不」',
    content: '主后 451 年迦克墩大公会议为基督的两性（神性 + 人性）定下四个负面界定：①不混乱、②不变化、③不分开、④不离散。「不混乱」否定欧迪奇主义（神人混合成新性），「不变化」否定阿波利拿留派（神性吞没人性），「不分开 / 不离散」否定聂斯多留派（两个分开的位格）。这四不像四面墙，把基督的奥秘围在中间——祂是 100% 的神，也是 100% 的人，二性在一个位格里完整地联合。所有正统教会都接纳这定义。',
    sources: ['迦克墩信经'],
  },
  'l1_5': {
    title: '代赎、得胜、模范：救赎论的三种传统',
    content: '教会历史上对「基督的死救赎我们」有三种主要解释。①模范说（Abelard, 12 世纪）：耶稣的爱激发我们悔改。②基督得胜说（早期教会, Christus Victor）：基督借十字架战胜罪与魔鬼。③代赎说（安瑟伦 / 改革宗）：耶稣替罪人承担神公义的刑罚。这三种不互相排斥，但代赎说在更正教中是核心——它最直接地回答「神的公义如何与神的爱在十字架同时成全」。',
    sources: ['安瑟伦《神为何成为人》', '加拉太书 3:13'],
  },
  'l3_1': {
    title: 'creatio ex nihilo：「从无中创造」',
    content: '教会传统用拉丁文 creatio ex nihilo（从无中创造）来描述创世——神不是用预先存在的材料造万有，而是凭祂的话使万有从「无」中出现。这与古希腊哲学（物质永恒）和古近东神话（神在原初混沌中塑造）都不同。它强调三件事：①万有完全依赖神，没有什么是「中立的」；②神有绝对自由，创造是恩典而非必然；③物质本身是好的（神看为甚好），所以基督教不接受灵肉二元的轻物质论。',
    sources: ['创世记 1', '希伯来书 11:3'],
  },
  'l3_3': {
    title: '奥古斯丁 vs 伯拉纠：恩典之争',
    content: '4 世纪末，英国修士伯拉纠（Pelagius）教导：人靠自由意志可以选择行善，恩典只是「帮助」。北非主教奥古斯丁（Augustine）回应：人因堕落根本「无法不犯罪」，恩典必须是先于人意志的「先存恩典」。418 年迦太基会议正式定伯拉纠主义为异端。这场争论塑造了西方神学的基本框架——恩典不是人选择神后神才给的奖品，而是神先寻找人，使人能回应。',
    sources: ['奥古斯丁《论自由意志》', '《论本性与恩典》'],
  },
  'l4_terms': {
    title: '为什么神学有这么多「术语」？',
    content: '神学术语并非神职人员的「行话」，而是历代教会在面对错误教导时打磨出的「精确武器」。比如「同质」（homoousios）一词的出现，是为了驳斥亚流派把基督说成受造物的危险；「二性」（two natures）是为回应基督论争论；「称义」（justification）是为澄清救恩不靠功德。这些词的存在证明：每代教会都需要「分辨真理」与「错谬」的能力。学神学术语，不是为了显得有学问，是为了在风浪里站得稳。',
    sources: ['尼西亚信经', '迦克墩信经'],
  },
  't_reformed_1': {
    title: '宗教改革的五个 Sola',
    content: '宗教改革凝练为五个拉丁短语：①Sola Scriptura（唯独圣经）—— 圣经是最终权威；②Sola Fide（唯独信心）—— 称义只借信心；③Sola Gratia（唯独恩典）—— 救恩完全是神白白的恩；④Solus Christus（唯独基督）—— 救恩唯独借基督；⑤Soli Deo Gloria（唯独荣耀归神）—— 一切的中心与目的都是神的荣耀。前四个回答「我如何得救」，第五个回答「我为何而活」。这五句话至今仍是更正教的纲领。',
    sources: ['加拉太书 2:16', '哥林多前书 10:31'],
  },
  't_lutheran_1': {
    title: '路德 95 条到底说了什么？',
    content: '1517 年路德钉的 95 条不是一份「反对教皇宣言」，而是一份「学术辩论邀请」。核心针对当时的赎罪券：教会售卖「免炼狱时间」的纸券。路德反对的不是悔改，而是：①把神的赦免商品化；②把「内心的悔改」变成「外在的购买」；③让最贫穷的人最害怕。第 1 条就直说：「我们的主耶稣说『你们当悔改』时，乃是要信徒一生悔改。」这是宗教改革的火种。',
    sources: ['马太福音 4:17', '路德《九十五条论纲》'],
  },
};

// Compute lesson → glossary themes map (build once at module load)
export const GLOSSARY_TERMS = Object.keys(GLOSSARY);
export const LESSON_THEMES: Record<string, Set<string>> = (() => {
  const out: Record<string, Set<string>> = {};
  for (const lesson of LESSONS) {
    if (!lesson.steps) continue;
    const themes = new Set<string>();
    // Always include lesson title for theme matching
    const allTexts: string[] = [lesson.title];
    for (const step of lesson.steps) {
      if (step.type === 'truth') allTexts.push(step.body);
      else if (step.type === 'reflect') allTexts.push(step.prompt);
      else if (step.type === 'quiz_single') allTexts.push(step.question, step.explanation);
      else if (step.type === 'quiz_life') allTexts.push(step.scenario, step.question, step.explanation);
      else if (step.type === 'match') allTexts.push(step.question, step.explanation);
      else if (step.type === 'verse_fill') allTexts.push(step.template, step.explanation);
      else if (step.type === 'gospel_express') allTexts.push(step.prompt);
      else if (step.type === 'order_seq') allTexts.push(step.prompt, step.explanation, ...step.items.map(i => i.label));
      else if (step.type === 'scripture') allTexts.push(step.text);
      // skip prayer (devotional)
    }
    const joined = allTexts.join(' ');
    GLOSSARY_TERMS.forEach(term => { if (joined.includes(term)) themes.add(term); });
    out[lesson.id] = themes;
  }
  return out;
})();

// Recommend related lessons for a given lesson id (by theme overlap, max N playable lessons)
export const getRelatedLessons = (lessonId: string, max = 3): PTLesson[] => {
  const myThemes = LESSON_THEMES[lessonId];
  if (!myThemes || myThemes.size === 0) return [];
  const scores: Array<{ lesson: PTLesson; score: number }> = [];
  for (const lesson of LESSONS) {
    if (lesson.id === lessonId) continue;
    if (!lesson.steps) continue;
    const otherThemes = LESSON_THEMES[lesson.id];
    if (!otherThemes) continue;
    let score = 0;
    myThemes.forEach(t => { if (otherThemes.has(t)) score++; });
    if (score > 0) scores.push({ lesson, score });
  }
  // Sort by score desc, then by order to make output deterministic
  scores.sort((a, b) => b.score - a.score || a.lesson.order - b.lesson.order);
  return scores.slice(0, max).map(s => s.lesson);
};
export const levelProgress = (levelId: string, progress: PTUserState['progress']) => {
  const ls = lessonsOfLevel(levelId);
  const done = ls.filter(l => progress[l.id]).length;
  return { done, total: ls.length, ratio: ls.length ? done / ls.length : 0 };
};
export const isLevelUnlocked = (levelId: string, progress: PTUserState['progress']): { unlocked: boolean; reason?: string } => {
  const lvl = LEVELS.find(l => l.id === levelId);
  if (!lvl?.requirements || lvl.requirements.length === 0) return { unlocked: true };
  const missing: string[] = [];
  for (const req of lvl.requirements) {
    const reqProg = levelProgress(req.levelId, progress);
    const ok = req.type === 'level_complete' ? reqProg.ratio >= 1 : reqProg.ratio >= (req.threshold || 0);
    if (!ok) {
      missing.push(req.type === 'level_complete' ? `完成 ${req.levelId}` : `${req.levelId} 进度 ≥ ${Math.round((req.threshold || 0) * 100)}%`);
    }
  }
  if (missing.length === 0) return { unlocked: true };
  return { unlocked: false, reason: missing.join(' + ') };
};

export const checkBadges = (s: PTUserState): string[] => {
  const u = new Set(s.badges);
  const completed = Object.keys(s.progress);
  if (completed.length >= 1) u.add('b_first');
  if (completed.length >= 10) u.add('b_lessons_10');
  if (completed.length >= 30) u.add('b_lessons_30');
  if (s.streak.current >= 3) u.add('b_streak_3');
  if (s.streak.current >= 7) u.add('b_streak_7');
  if (s.streak.current >= 30) u.add('b_streak_30');
  if (levelProgress('L0', s.progress).ratio >= 1) u.add('b_l0_done');
  if (levelProgress('L1', s.progress).ratio >= 1) u.add('b_l1_done');
  if (s.progress['l4_terms']) u.add('b_terms');
  if (s.progress['l7_radar']) u.add('b_radar');
  const distinctTraditions = new Set<string>();
  completed.forEach(lid => {
    const lesson = LESSONS.find(l => l.id === lid);
    if (lesson?.traditionId) distinctTraditions.add(lesson.traditionId);
  });
  if (distinctTraditions.size >= 2) u.add('b_tradition');
  return Array.from(u);
};
