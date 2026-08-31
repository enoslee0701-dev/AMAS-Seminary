// AMAS Christian Profile · 会话自动保存 / 续答 / Profile 快照与历史
//
// - 每题自动保存（localStorage），退出可继续，刷新不丢数据。
// - Profile 嵌入成长档案文档（amas_ct_state_v2）以复用 /api/growth/state 跨设备同步，
//   旧的九维/恩赐数据保留并标记 legacy。
// - 历史快照只追加，不重算（题库/评分版本变化时旧结果保持原样，规范 §45/§87）。

import { scheduleGrowthPush } from '../growthSyncService';
import type { Answer, ChristianProfile } from './scoring';
import type { AssessmentLevel } from './items';
import { isValidEvidence, type ChristianProfileEvidence } from './evidence';
import type { ArchKey } from '../growthArchetypes';

const DOC_KEY = 'amas_ct_state_v2';
const SESSION_KEY = 'amas_cp_session_v1';

export interface AssessmentSession {
  level: AssessmentLevel;
  assessmentVersion: string;
  startedAt: string;
  updatedAt: string;
  answers: Answer[];
}

export interface ProfileHistoryEntry {
  completedAt: string;
  assessmentVersion: string;
  scoringVersion: string;
  top: { key: string; score: number }[];
  combinedLabel: string;
}

// ---------- 会话 ----------
export function loadSession(): AssessmentSession | null {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveSession(s: AssessmentSession): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, updatedAt: new Date().toISOString() })); } catch {}
}
export function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

// ---------- Profile（嵌入成长档案文档） ----------
interface GrowthDoc {
  v: 2;
  christianProfile?: ChristianProfile;
  profileHistory?: ProfileHistoryEntry[];
  /** 证据日志：只追加，重新评估**不清空**（规范 §31「不清空历史数据重新开始」） */
  profileEvidence?: ChristianProfileEvidence[];
  legacy?: boolean;
  [k: string]: unknown;
}

function readDoc(): GrowthDoc {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    const d = raw ? JSON.parse(raw) : null;
    if (d && d.v === 2) return d as GrowthDoc;
  } catch {}
  return { v: 2 };
}

export function readChristianProfile(): ChristianProfile | null {
  const d = readDoc();
  const p = d.christianProfile;
  if (!p || p.profileVersion !== 1) return null;
  // V2 之前保存的画像没有 conflicts / conflict / confidenceReason 字段。
  // 历史快照不重算（§45），这里只补默认值让旧结果照原样可读。
  const orientation = { ...p.ministryOrientation };
  for (const k of Object.keys(orientation) as (keyof typeof orientation)[]) {
    const s = orientation[k];
    if (!s.conflict) orientation[k] = { ...s, conflict: 'none', confidenceReason: s.confidenceReason ?? '' };
  }
  return { ...p, conflicts: p.conflicts ?? [], ministryOrientation: orientation };
}

export function readProfileHistory(): ProfileHistoryEntry[] {
  return readDoc().profileHistory ?? [];
}

export function saveChristianProfile(profile: ChristianProfile): void {
  const d = readDoc();
  const history = d.profileHistory ?? [];
  // 幂等：同一次评估（completedAt 相同）重复保存不得虚增版本号，也不重复写历史。
  const existing = history.findIndex(h => h.completedAt === profile.completedAt);
  // 用户可见的画像版本号：第 N 次生成即 VN。历史只追加，不覆盖。
  const p: ChristianProfile = { ...profile, versionNo: existing >= 0 ? existing + 1 : history.length + 1 };
  const entry: ProfileHistoryEntry = {
    completedAt: p.completedAt, assessmentVersion: p.assessmentVersion, scoringVersion: p.scoringVersion,
    top: p.topOrientations, combinedLabel: p.combinedLabel,
  };
  const nextHistory = existing >= 0
    ? history.map((h, i) => (i === existing ? entry : h))
    : [...history, entry].slice(-12);
  const next: GrowthDoc = {
    ...d,
    christianProfile: p,
    profileHistory: nextHistory,
    // 旧的九维/恩赐字段若存在，标记为 legacy（保留可读，不再驱动角色）
    legacy: Boolean((d as { gifts?: unknown }).gifts),
  };
  try { localStorage.setItem(DOC_KEY, JSON.stringify(next)); } catch {}
  scheduleGrowthPush(next);
  clearSession();
}

/** 重新评估只清当前画像；历史与证据日志一律保留。 */
export function clearChristianProfile(): void {
  const d = readDoc();
  delete d.christianProfile;
  try { localStorage.setItem(DOC_KEY, JSON.stringify(d)); } catch {}
  scheduleGrowthPush(d);
}

// ---------- 证据日志 ----------

/** 读取全部证据。无验证目标的记录被过滤掉，绝不进入任何倾向的可信度计算。 */
export function readEvidence(): ChristianProfileEvidence[] {
  return (readDoc().profileEvidence ?? []).filter(isValidEvidence);
}

/**
 * 追加一条证据。只追加、不覆盖、不删除——重新评估后旧证据依然有效，
 * 这样系统才能用「后来发生的事」去检验「当初的测评结论」。
 * 同 id 视为同一条，重复写入会被忽略。
 */
export function appendEvidence(e: ChristianProfileEvidence): void {
  if (!isValidEvidence(e)) return;               // 无目标证据直接丢弃
  const d = readDoc();
  const log = d.profileEvidence ?? [];
  if (log.some(x => x.id === e.id)) return;
  const next: GrowthDoc = { ...d, profileEvidence: [...log, e].slice(-200) };
  try { localStorage.setItem(DOC_KEY, JSON.stringify(next)); } catch {}
  scheduleGrowthPush(next);
}

/**
 * 记录一个「我愿意尝试」的验证意向。
 * 意向本身是 neutral / weak——只表示打算去验证，**不构成任何支持证据**，
 * 因此不会提高可信度；真正的证据要等实际服侍或反馈回来才产生。
 */
export function recordVerificationIntent(input: {
  orientations: ArchKey[]; ministry: string; at?: string;
}): void {
  const now = input.at ?? new Date().toISOString();
  appendEvidence({
    id: `intent_${input.ministry}_${now}`,
    type: 'verification_intent',
    targetOrientations: input.orientations,
    polarity: 'neutral',
    strength: 'weak',
    summary: `愿意尝试：${input.ministry}`,
    sourceLabel: input.ministry,
    source: 'self',
    observedAt: now,
    createdAt: now,
  });
}

/** 已登记的验证意向（供结果页回显选中状态）。 */
export function readVerificationIntents(): string[] {
  return readEvidence().filter(e => e.type === 'verification_intent').map(e => e.sourceLabel ?? '');
}
