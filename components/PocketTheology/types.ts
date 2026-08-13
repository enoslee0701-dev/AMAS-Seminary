// ============================================================
// PocketTheology · TYPES
// (Extracted verbatim from the original PocketTheologyView.tsx — no
// behavioural changes. Splitting types here so the rest of the folder
// can import them without pulling in the whole monolith.)
// ============================================================

export interface PTLevel {
  id: string; // 'L0' .. 'L8'
  title: string;     // 慕道探索
  friendlyTitle: string; // 我想了解信仰
  description: string;
  icon: any;
  baseColor: string;
  titleColor: string;
  subColor: string;
  order: number;
  requirements?: { type: 'level_complete' | 'level_partial'; levelId: string; threshold?: number }[];
}

export interface PTTradition {
  id: string;
  name: string;
  family: '共同核心' | '更正教' | '历史大公';
  shortIntro: string;
  coreEmphases: string[];
  icon: any;
  baseColor: string;
  titleColor: string;
  reviewLevel: 'A' | 'B' | 'C' | 'D';
}

export interface PTTopic {
  id: string;
  title: string;
  intro: string;
  views: { traditionId: string; summary: string }[];
}

export type PTStep =
  | { type: 'truth'; body: string }
  | { type: 'scripture'; reference: string; text: string }
  | { type: 'quiz_single'; question: string; options: string[]; correctIndex: number; explanation: string }
  | { type: 'quiz_life'; scenario: string; question: string; options: string[]; correctIndex: number; explanation: string }
  | { type: 'match'; question: string; pairs: { left: string; right: string }[]; explanation: string }
  | { type: 'verse_fill'; reference: string; template: string; blanks: string[]; distractors?: string[]; explanation: string }
  | { type: 'gospel_express'; prompt: string; elements: Array<{ id: string; label: string; keywords: string[]; tip: string }> }
  | { type: 'order_seq'; prompt: string; items: Array<{ label: string; hint?: string }>; explanation: string }
  | { type: 'reflect'; prompt: string }
  | { type: 'prayer'; text: string };

export interface PTLesson {
  id: string;
  levelId?: string;     // either belongs to a level
  traditionId?: string; // or a tradition (mutually exclusive)
  title: string;
  description?: string;
  estimatedMinutes: number;
  xpReward: number;
  order: number;
  steps?: PTStep[];
  tag?: string;
}

export interface PTBadge { id: string; title: string; description: string; icon: any; }
export interface PTProgressEntry { status: 'completed'; score: number; completedAt: string; }
export interface PTStreak { current: number; longest: number; lastDate: string; }
export interface PTJournalEntry {
  id: string;
  lessonId: string;
  lessonTitle: string;
  context: string;
  prompt: string;
  text: string;
  savedAt: string;
}
export interface PTUserState {
  xp: number;
  streak: PTStreak;
  progress: Record<string, PTProgressEntry>;
  badges: string[];
  journal: PTJournalEntry[];
  onboarded?: boolean;
  preferredStart?: string;     // levelId chosen at onboarding
  preferredTradition?: string; // traditionId chosen at onboarding (optional)
  dailyGoalMinutes?: number;   // 3 default
  lastWeeklyReportSeen?: string; // Monday-anchored week key user has acknowledged
  favorites: string[];         // lesson ids the user has bookmarked
  lastGospelExpression?: { text: string; savedAt: string; score: number; total: number };
}

// Optional deep-dive content for select lessons (历史背景 / 神学家 / 宗派比较)
export interface PTDeepDive { title: string; content: string; sources?: string[] }

// Route shape used by the shell + every view (preserved verbatim)
export type PTRoute =
  | { name: 'home' }
  | { name: 'map' }
  | { name: 'levelDetail'; levelId: string }
  | { name: 'traditions' }
  | { name: 'traditionDetail'; traditionId: string }
  | { name: 'topics' }
  | { name: 'topicDetail'; topicId: string }
  | { name: 'lesson'; lessonId: string }
  | { name: 'complete'; lessonId: string; gained: { xp: number; streakDelta: number; newBadges: string[] } }
  | { name: 'review' }
  | { name: 'badges' }
  | { name: 'glossary'; expandTerm?: string }
  | { name: 'journal' }
  | { name: 'weekly' };
