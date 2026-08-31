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
import {
  isValidExperiment, canTransition, canReview, experimentToEvidence,
  type ValidationExperiment, type ExperimentStatus, type ExperimentSource,
  type SelfReflection, type MentorObservation, type ValidationOutcome,
} from './experiments';
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
  /** 验证实验与其复盘 / 观察。实验是 workflow state，不是证据。 */
  experiments?: ValidationExperiment[];
  reflections?: SelfReflection[];
  observations?: MentorObservation[];
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

// ---------- 验证实验（P2-A） ----------
//
// 「我愿意尝试」从 P2-A 起写入 ValidationExperiment，**不再写入 Evidence**——
// 打算做的事不是证据。旧的 verification_intent 记录仍然可读（见 readExperiments 的迁移），
// 只是不再新增。

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 读取全部验证实验。
 * 兼容：V2.1 写入的 verification_intent 证据会被就地转换成 not_started 的实验展示，
 * 原证据保留不删（append-only），但因为是 neutral/weak，本来也不影响任何可信度。
 */
export function readExperiments(): ValidationExperiment[] {
  const d = readDoc();
  const list = (d.experiments ?? []).filter(isValidExperiment);
  const known = new Set(list.map(e => e.title));
  const migrated: ValidationExperiment[] = (d.profileEvidence ?? [])
    .filter(e => e.type === 'verification_intent' && !known.has(e.sourceLabel ?? ''))
    .map(e => ({
      id: `mig_${e.id}`,
      targetOrientations: e.targetOrientations,
      title: e.sourceLabel ?? e.summary,
      source: 'profile_recommendation' as const,
      status: 'not_started' as const,
      createdAt: e.createdAt,
      updatedAt: e.createdAt,
    }));
  return [...list, ...migrated];
}

function writeExperiments(next: ValidationExperiment[]): void {
  const d = readDoc();
  const doc: GrowthDoc = { ...d, experiments: next.filter(e => !e.id.startsWith('mig_')).slice(-100) };
  try { localStorage.setItem(DOC_KEY, JSON.stringify(doc)); } catch {}
  scheduleGrowthPush(doc);
}

/** 登记一个验证实验（「我愿意尝试」）。同标题不重复登记。 */
export function createExperiment(input: {
  targetOrientations: ArchKey[]; title: string; source?: ExperimentSource; growthGoal?: string; at?: string;
}): ValidationExperiment | null {
  if (!input.targetOrientations.length || !input.title) return null;
  const list = readExperiments();
  const dup = list.find(e => e.title === input.title && e.status !== 'cancelled');
  if (dup) return dup;
  const now = input.at ?? new Date().toISOString();
  const exp: ValidationExperiment = {
    id: uid('exp'),
    targetOrientations: input.targetOrientations,
    title: input.title,
    source: input.source ?? 'profile_recommendation',
    status: 'not_started',
    growthGoal: input.growthGoal,
    createdAt: now, updatedAt: now,
  };
  writeExperiments([...list.filter(e => !e.id.startsWith('mig_')), exp]);
  return exp;
}

/** 推进实验状态。非法迁移直接拒绝，返回 false。 */
export function advanceExperiment(id: string, to: ExperimentStatus, at?: string): boolean {
  const list = readExperiments();
  const exp = list.find(e => e.id === id);
  if (!exp || !canTransition(exp.status, to)) return false;
  if (to === 'reviewed' && !canReview(exp)) return false;   // 没有复盘就不能复核
  const now = at ?? new Date().toISOString();
  const next: ValidationExperiment = {
    ...exp, status: to, updatedAt: now,
    ...(to === 'active' ? { startedAt: exp.startedAt ?? now } : {}),
    ...(to === 'completed' ? { completedAt: now } : {}),
    ...(to === 'reviewed' ? { reviewedAt: now } : {}),
  };
  writeExperiments(materialize(list).map(e => (e.id === id ? next : e)));
  return true;
}

/** 取消实验：不产出任何证据，但记录保留。 */
export const cancelExperiment = (id: string) => advanceExperiment(id, 'cancelled');

/** 写入自我复盘，并把实验推进到「待复核」。 */
export function saveReflection(experimentId: string, input: {
  outcome: ValidationOutcome; whatHappened: string; whatLearned?: string; at?: string;
}): SelfReflection | null {
  const list = materialize(readExperiments());
  const exp = list.find(e => e.id === experimentId);
  if (!exp || (exp.status !== 'completed' && exp.status !== 'active')) return null;
  const now = input.at ?? new Date().toISOString();
  const r: SelfReflection = {
    id: uid('ref'), experimentId, outcome: input.outcome,
    whatHappened: input.whatHappened, whatLearned: input.whatLearned, createdAt: now,
  };
  const d = readDoc();
  const doc: GrowthDoc = { ...d, reflections: [...(d.reflections ?? []), r].slice(-200) };
  try { localStorage.setItem(DOC_KEY, JSON.stringify(doc)); } catch {}
  writeExperiments(list.map(e => (e.id === experimentId
    ? { ...e, status: 'completed' as const, completedAt: e.completedAt ?? now, selfReflectionId: r.id, updatedAt: now }
    : e)));
  return r;
}

/**
 * 记录导师 / 同工观察。
 * `verified` 默认 false——由用户本人转述的反馈不当作他人观察，
 * 因此不会把该倾向的可信度推到最高档。只有导师端确认过的观察才 verified。
 */
export function saveMentorObservation(experimentId: string, input: {
  observerName: string; observerRole?: 'mentor' | 'peer'; outcome: ValidationOutcome;
  comment: string; verified?: boolean; at?: string;
}): MentorObservation | null {
  const list = materialize(readExperiments());
  const exp = list.find(e => e.id === experimentId);
  if (!exp) return null;
  const now = input.at ?? new Date().toISOString();
  const o: MentorObservation = {
    id: uid('obs'), experimentId, observerName: input.observerName,
    observerRole: input.observerRole ?? 'mentor', outcome: input.outcome,
    comment: input.comment, verified: input.verified ?? false, createdAt: now,
  };
  const d = readDoc();
  const doc: GrowthDoc = { ...d, observations: [...(d.observations ?? []), o].slice(-200) };
  try { localStorage.setItem(DOC_KEY, JSON.stringify(doc)); } catch {}
  writeExperiments(list.map(e => (e.id === experimentId ? { ...e, mentorObservationId: o.id, updatedAt: now } : e)));
  return o;
}

export const readReflections = (): SelfReflection[] => readDoc().reflections ?? [];
export const readObservations = (): MentorObservation[] => readDoc().observations ?? [];

/** 迁移出来的实验第一次被写入时需要落成真实记录，否则更新会丢失。 */
function materialize(list: ValidationExperiment[]): ValidationExperiment[] {
  return list.map(e => (e.id.startsWith('mig_') ? { ...e, id: e.id.replace('mig_', 'exp_') } : e));
}

/**
 * 完成一轮验证：把实验 + 复盘 + 观察转成证据写入证据日志，实验进入终态 reviewed。
 * 这是 P2-A 闭环的最后一环——现实世界的结果在这里第一次回到画像。
 */
export function reviewExperiment(id: string, at?: string): ChristianProfileEvidence[] {
  const list = materialize(readExperiments());
  const exp = list.find(e => e.id === id);
  if (!exp || !canReview(exp)) return [];
  const reflection = readReflections().find(r => r.id === exp.selfReflectionId);
  const observation = readObservations().find(o => o.id === exp.mentorObservationId);
  const evidence = experimentToEvidence(exp, reflection, observation);
  for (const e of evidence) appendEvidence(e);
  const now = at ?? new Date().toISOString();
  writeExperiments(readExperiments().map(e => (e.id === id
    ? { ...e, status: 'reviewed' as const, reviewedAt: now, generatedEvidenceIds: evidence.map(x => x.id), updatedAt: now }
    : e)));
  return evidence;
}
