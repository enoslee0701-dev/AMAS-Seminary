// AMAS Christian Profile · 会话自动保存 / 续答 / Profile 快照与历史
//
// - 每题自动保存（localStorage），退出可继续，刷新不丢数据。
// - Profile 嵌入成长档案文档（amas_ct_state_v2）以复用 /api/growth/state 跨设备同步，
//   旧的九维/恩赐数据保留并标记 legacy。
// - 历史快照只追加，不重算（题库/评分版本变化时旧结果保持原样，规范 §45/§87）。

import { scheduleGrowthPush } from '../growthSyncService';
import type { Answer, ChristianProfile } from './scoring';
import type { AssessmentLevel } from './items';

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
  return d.christianProfile && d.christianProfile.profileVersion === 1 ? d.christianProfile : null;
}

export function readProfileHistory(): ProfileHistoryEntry[] {
  return readDoc().profileHistory ?? [];
}

export function saveChristianProfile(profile: ChristianProfile): void {
  const d = readDoc();
  // 用户可见的画像版本号：第 N 次生成即 VN。历史只追加，不覆盖。
  const p: ChristianProfile = { ...profile, versionNo: (d.profileHistory?.length ?? 0) + 1 };
  const entry: ProfileHistoryEntry = {
    completedAt: p.completedAt, assessmentVersion: p.assessmentVersion, scoringVersion: p.scoringVersion,
    top: p.topOrientations, combinedLabel: p.combinedLabel,
  };
  const next: GrowthDoc = {
    ...d,
    christianProfile: p,
    profileHistory: [...(d.profileHistory ?? []), entry].slice(-12),
    // 旧的九维/恩赐字段若存在，标记为 legacy（保留可读，不再驱动角色）
    legacy: Boolean((d as { gifts?: unknown }).gifts),
  };
  try { localStorage.setItem(DOC_KEY, JSON.stringify(next)); } catch {}
  scheduleGrowthPush(next);
  clearSession();
}

export function clearChristianProfile(): void {
  const d = readDoc();
  delete d.christianProfile;
  try { localStorage.setItem(DOC_KEY, JSON.stringify(d)); } catch {}
  scheduleGrowthPush(d);
}
