// AMAS Christian Profile · Deterministic Scoring Engine（provisional_v1）
//
// 规则（规范 §4/§15–§23/§27–§33）：
// - 四层独立管线，永远不合成一个总分。
// - 信仰基础(A)、门徒生命(B)、准备度(E) 不进入 12 维倾向评分；倾向仅由 C(Likert/频率) + D(情境) 计算。
// - 反向题先转换；0–100 为内部指数（不是百分位）。
// - AI 不参与打分；本文件输出结构化 Profile JSON，供解释层/推荐层使用。

import {
  ITEM_BANK, ORIENTATION_KEYS, ASSESSMENT_VERSIONS, SCORING_VERSION, ITEM_VERSION, LANGUAGE_VERSION,
  type Item, type OrientationKey, type FaithFacet, type PracticeKey, type ReadinessFacet, type AssessmentLevel,
} from './items';
import { ARCHETYPES_BASE, archetypeByKey } from '../growthArchetypes';

export interface Answer {
  itemId: string;
  optionIndex: number;
  responseTimeMs?: number;
  answeredAt: string;
}

export type EvidenceStrength = 'limited' | 'moderate' | 'high';

export interface DimensionScore {
  rawScore: number;
  normalizedScore: number;
  evidenceStrength: EvidenceStrength;
  itemsAnswered: number;
}

export type PracticeLevel = 'stable' | 'fairly_stable' | 'developing' | 'to_build';
export const PRACTICE_LEVEL_LABEL: Record<PracticeLevel, string> = {
  stable: '稳定', fairly_stable: '较稳定', developing: '发展中', to_build: '需要建立',
};

export type ReadinessLevel = 'early' | 'developing' | 'strong';
export const READINESS_LEVEL_LABEL: Record<ReadinessLevel, string> = {
  early: '起步阶段', developing: '发展中', strong: '较充分',
};

export type QualityFlag = 'too_fast' | 'straight_lining' | 'high_inconsistency' | 'missing_items';

export interface ChristianProfile {
  profileVersion: 1;
  assessmentVersion: string;
  scoringVersion: string;
  itemVersion: number;
  languageVersion: string;
  level: AssessmentLevel;
  completedAt: string;
  faithFoundation?: { overall: number; facets: Record<FaithFacet, DimensionScore> };
  discipleshipPractice?: { practices: Record<PracticeKey, { score: number; level: PracticeLevel }> };
  ministryOrientation: Record<OrientationKey, DimensionScore>;
  ministryReadiness?: { overall: number; level: ReadinessLevel; facets: Record<ReadinessFacet, DimensionScore> };
  topOrientations: { key: OrientationKey; score: number }[];
  /** 前三项分数极为接近 → 多元组合 */
  multiBlend: boolean;
  /** 组合标签（仅解释用，不是新类型） */
  combinedLabel: string;
  /** Orientation × Readiness 矩阵解释（标准版） */
  orientationReadiness?: { key: 'potential_needs_equipping' | 'expand_responsibility' | 'review_direction' | 'forming'; text: string };
  qualityFlags: QualityFlag[];
  evidenceStrength: EvidenceStrength;
  /** 可解释性：每个 Top 维度的主要来源（行为标签） */
  explanations: Partial<Record<OrientationKey, string[]>>;
  recommendations: Recommendations;
}

export interface Recommendations {
  ministriesToTry: string[];
  courseIds: string[];
  practices: string[];
  equippingFocus: string[];
  growthPlan: { d30: string[]; d90: string[]; d180: string[] };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const scaleToIndex = (v: number) => ((v - 1) / 4) * 100;
const mean = (a: number[]) => (a.length ? a.reduce((t, n) => t + n, 0) / a.length : 0);

/** 反向题：1↔5 */
function itemValue(item: Item, optionIndex: number): number | null {
  const v = item.options[optionIndex]?.value;
  if (v === undefined) return null;
  return item.reverse_scored ? 6 - v : v;
}

// ------------------------------------------------------------
// 主入口
// ------------------------------------------------------------
export function scoreAssessment(level: AssessmentLevel, answers: Answer[], completedAt = new Date().toISOString()): ChristianProfile {
  const byId = new Map(answers.map(a => [a.itemId, a]));
  const answered = (i: Item) => byId.get(i.id);

  // ---- C + D → Ministry Orientation（唯一进入倾向评分的模块） ----
  const likertVals: Record<OrientationKey, number[]> = {} as Record<OrientationKey, number[]>;
  const chosen: Record<OrientationKey, number> = {} as Record<OrientationKey, number>;
  const offered: Record<OrientationKey, number> = {} as Record<OrientationKey, number>;
  const sources: Record<OrientationKey, string[]> = {} as Record<OrientationKey, string[]>;
  for (const k of ORIENTATION_KEYS) { likertVals[k] = []; chosen[k] = 0; offered[k] = 0; sources[k] = []; }

  for (const item of ITEM_BANK) {
    const a = answered(item);
    if (!a) continue;
    if (item.module === 'ministry_orientation') {
      const v = itemValue(item, a.optionIndex);
      if (v === null) continue;
      const k = item.dimension as OrientationKey;
      likertVals[k].push(scaleToIndex(v));
      if (v >= 4 && item.tag) sources[k].push(item.tag);
    } else if (item.module === 'scenario') {
      for (const o of item.options) if (o.dimension) offered[o.dimension]++;
      const pick = item.options[a.optionIndex]?.dimension;
      if (pick) { chosen[pick]++; sources[pick].push('情境题中优先选择了此类行动'); }
    }
  }

  const ministryOrientation = {} as Record<OrientationKey, DimensionScore>;
  for (const k of ORIENTATION_KEYS) {
    const lk = likertVals[k];
    const likertIdx = lk.length ? mean(lk) : 50;
    const scenIdx = offered[k] > 0 ? (chosen[k] / offered[k]) * 100 : null;
    const normalized = scenIdx === null ? likertIdx : 0.8 * likertIdx + 0.2 * scenIdx;
    const evidenceStrength: EvidenceStrength =
      lk.length >= 3 && offered[k] >= 2 ? 'high' : lk.length >= 2 ? 'moderate' : 'limited';
    ministryOrientation[k] = {
      rawScore: Math.round(lk.reduce((t, n) => t + n / 25 + 1, 0) + chosen[k]),
      normalizedScore: Math.round(clamp(normalized)),
      evidenceStrength,
      itemsAnswered: lk.length + chosen[k],
    };
  }

  // ---- A → Faith Foundation（独立管线，允许正误） ----
  let faithFoundation: ChristianProfile['faithFoundation'];
  if (level === 'standard') {
    const facets = {} as Record<FaithFacet, DimensionScore>;
    const facetKeys: FaithFacet[] = ['bible', 'gospel', 'doctrine', 'church_life'];
    for (const f of facetKeys) {
      const items = ITEM_BANK.filter(i => i.module === 'faith_foundation' && i.dimension === f);
      let correct = 0, n = 0;
      for (const it of items) { const a = answered(it); if (!a) continue; n++; if (it.options[a.optionIndex]?.correct) correct++; }
      facets[f] = { rawScore: correct, normalizedScore: n ? Math.round((correct / n) * 100) : 0, itemsAnswered: n, evidenceStrength: n >= 3 ? 'high' : n >= 2 ? 'moderate' : 'limited' };
    }
    faithFoundation = { overall: Math.round(mean(facetKeys.map(f => facets[f].normalizedScore))), facets };
  }

  // ---- B → Discipleship Practice（状态，不是价值评价） ----
  let discipleshipPractice: ChristianProfile['discipleshipPractice'];
  if (level === 'standard') {
    const practices = {} as Record<PracticeKey, { score: number; level: PracticeLevel }>;
    const keys: PracticeKey[] = ['scripture', 'prayer', 'worship', 'community', 'obedience', 'service', 'generosity', 'witness'];
    for (const p of keys) {
      const items = ITEM_BANK.filter(i => i.module === 'discipleship' && i.dimension === p);
      const vals: number[] = [];
      for (const it of items) { const a = answered(it); const v = a ? itemValue(it, a.optionIndex) : null; if (v !== null) vals.push(scaleToIndex(v)); }
      const score = Math.round(mean(vals));
      practices[p] = { score, level: score >= 75 ? 'stable' : score >= 55 ? 'fairly_stable' : score >= 35 ? 'developing' : 'to_build' };
    }
    discipleshipPractice = { practices };
  }

  // ---- E → Ministry Readiness（与倾向严格分离） ----
  let ministryReadiness: ChristianProfile['ministryReadiness'];
  if (level === 'standard') {
    const facets = {} as Record<ReadinessFacet, DimensionScore>;
    const keys: ReadinessFacet[] = ['experience', 'consistency', 'responsibility', 'training', 'mentoring', 'teamwork', 'leadership_exposure', 'evidence'];
    for (const f of keys) {
      const items = ITEM_BANK.filter(i => i.module === 'readiness' && i.dimension === f);
      const vals: number[] = [];
      for (const it of items) { const a = answered(it); const v = a ? itemValue(it, a.optionIndex) : null; if (v !== null) vals.push(scaleToIndex(v)); }
      facets[f] = { rawScore: vals.length, normalizedScore: Math.round(mean(vals)), itemsAnswered: vals.length, evidenceStrength: vals.length >= 2 ? 'high' : vals.length === 1 ? 'moderate' : 'limited' };
    }
    const overall = Math.round(mean(keys.map(f => facets[f].normalizedScore)));
    ministryReadiness = { overall, level: overall >= 70 ? 'strong' : overall >= 45 ? 'developing' : 'early', facets };
  }

  // ---- Top 3 / 多元组合 / 组合标签 ----
  const ranked = ORIENTATION_KEYS.map(k => ({ key: k, score: ministryOrientation[k].normalizedScore })).sort((a, b) => b.score - a.score);
  const topOrientations = ranked.slice(0, 3);
  const multiBlend = topOrientations[0].score - topOrientations[2].score <= 3;
  const combinedLabel = archetypeByKey(topOrientations[1].key).mod + archetypeByKey(topOrientations[0].key).label;

  // ---- Orientation × Readiness 矩阵 ----
  let orientationReadiness: ChristianProfile['orientationReadiness'];
  if (ministryReadiness) {
    const o = topOrientations[0].score, r = ministryReadiness.overall;
    if (o >= 70 && r < 50) orientationReadiness = { key: 'potential_needs_equipping', text: '你的事奉倾向已经比较明显，但系统训练与实践证据仍在建立中——建议进入装备阶段，而不是立即承担更大的责任。' };
    else if (o >= 70 && r >= 70) orientationReadiness = { key: 'expand_responsibility', text: '倾向明显、准备度也较充分，可以与牧者或导师讨论扩大事奉责任的可能。' };
    else if (o < 50 && r >= 70) orientationReadiness = { key: 'review_direction', text: '你有相当的服事经验，但当前承担的工作未必是你最自然的事奉方向——这是一个值得与导师深入讨论的发现。' };
    else orientationReadiness = { key: 'forming', text: '方向正在形成中，建议在实践与群体反馈里继续观察，不必急于定型。' };
  }

  // ---- Response Quality Flags（只降低解释强度，不屏蔽） ----
  const qualityFlags: QualityFlag[] = [];
  const totalItems = level === 'quick' ? ITEM_BANK.filter(i => (i.module === 'ministry_orientation' || i.module === 'scenario') && i.quick).length : ITEM_BANK.length;
  if (answers.length < totalItems) qualityFlags.push('missing_items');
  const times = answers.map(a => a.responseTimeMs ?? 0).filter(t => t > 0).sort((a, b) => a - b);
  if (times.length >= 10 && times[Math.floor(times.length / 2)] < 1200) qualityFlags.push('too_fast');
  const likertAnswers = answers.filter(a => { const it = ITEM_BANK.find(i => i.id === a.itemId); return it && (it.type === 'likert' || it.type === 'frequency'); });
  if (likertAnswers.length >= 12) {
    const counts = new Map<number, number>();
    for (const a of likertAnswers) counts.set(a.optionIndex, (counts.get(a.optionIndex) ?? 0) + 1);
    if (Math.max(...counts.values()) / likertAnswers.length >= 0.9) qualityFlags.push('straight_lining');
  }
  let inconsistent = 0;
  for (const k of ORIENTATION_KEYS) {
    const rev = ITEM_BANK.find(i => i.module === 'ministry_orientation' && i.dimension === k && i.reverse_scored);
    if (!rev) continue;
    const ra = answered(rev); if (!ra) continue;
    const rv = itemValue(rev, ra.optionIndex); if (rv === null) continue;
    const others = ITEM_BANK.filter(i => i.module === 'ministry_orientation' && i.dimension === k && !i.reverse_scored)
      .map(i => { const a = answered(i); return a ? itemValue(i, a.optionIndex) : null; }).filter((v): v is number => v !== null);
    if (others.length && Math.abs(scaleToIndex(rv) - mean(others.map(scaleToIndex))) > 50) inconsistent++;
  }
  if (inconsistent >= 3) qualityFlags.push('high_inconsistency');

  const evidenceStrength: EvidenceStrength =
    qualityFlags.length >= 2 ? 'limited' : level === 'quick' || qualityFlags.length === 1 ? 'moderate' : 'high';

  // ---- 可解释性（只给来源，不给权重） ----
  const explanations: Partial<Record<OrientationKey, string[]>> = {};
  for (const t of topOrientations) explanations[t.key] = Array.from(new Set(sources[t.key])).slice(0, 4);

  const recommendations = buildRecommendations(topOrientations, faithFoundation, ministryReadiness);

  return {
    profileVersion: 1,
    assessmentVersion: ASSESSMENT_VERSIONS[level],
    scoringVersion: SCORING_VERSION,
    itemVersion: ITEM_VERSION,
    languageVersion: LANGUAGE_VERSION,
    level, completedAt,
    faithFoundation, discipleshipPractice, ministryOrientation, ministryReadiness,
    topOrientations, multiBlend, combinedLabel, orientationReadiness,
    qualityFlags, evidenceStrength, explanations, recommendations,
  };
}

// ------------------------------------------------------------
// 推荐引擎（规则式，deterministic；措辞为“建议尝试”）
// ------------------------------------------------------------
const COURSES_BY_ORIENTATION: Record<OrientationKey, string[]> = {
  teacher: ['c_dr_marking', 'c_lay_systematic', 'c_bible_intro'],
  explorer: ['c_dr_marking', 'c_greek', 'c_lay_systematic'],
  equipper: ['c_disciple', 'c_smallgroup', 'c_newbeliever'],
  shepherd: ['c_counseling', 'c_disciple', 'c_smallgroup'],
  encourager: ['c_counseling', 'c_assurance', 'c_disciple'],
  mercy: ['c_counseling', 'c_healing', 'c_basics'],
  intercessor: ['c_prayer', 'c_warfare', 'c_worship_order'],
  evangelist: ['c_evangelism', 'c_romans', 'c_newbeliever'],
  missionary: ['c_contextual', 'c_evangelism', 'c_church_ops'],
  leader: ['c_church_ops', 'c_smallgroup', 'c_lay_systematic'],
  builder: ['c_church_ops', 'c_worship_order', 'c_smallgroup'],
  servant: ['c_church_ops', 'c_basics', 'c_worship_order'],
};

const PRACTICE_BY_ORIENTATION: Record<OrientationKey, string[]> = {
  teacher: ['在小组中尝试一次 10 分钟的经文分享', '观察一位教师如何预备并做笔记'],
  explorer: ['独立完成一卷短书信的背景研究并整理成一页', '与一位神学老师约谈一次研究问题'],
  equipper: ['把一项你会的服事写成步骤，带一位同工完成一次', '陪伴一位初信者建立读经习惯 4 周'],
  shepherd: ['固定跟进 1–2 位肢体，每两周一次', '参与一次探访并写下观察'],
  encourager: ['每周主动鼓励一位灰心的人，并帮他定下一步', '记录三次鼓励后对方的实际改变'],
  mercy: ['参与一次慈惠或医院探访', '为一位有实际需要的人提供具体帮助并设定界限'],
  intercessor: ['建立一份代祷名单并持续 30 天', '参加一次教会祷告会并承担一个代祷项目'],
  evangelist: ['列出 3 位未信朋友并制定接触计划', '尝试一次自然的福音性交谈'],
  missionary: ['了解一个未得之民群体并为其祷告', '参加一次短期跨文化服事或宣教分享'],
  leader: ['带领一次小组或活动的筹备与执行', '与导师复盘一次带领经历'],
  builder: ['为一项事工设计一份可复用的流程或表格', '协助一次活动的后台运营'],
  servant: ['承担一个固定的后勤岗位 4 周', '主动补上一次没人负责的实际缺口'],
};

function buildRecommendations(
  top: { key: OrientationKey; score: number }[],
  faith: ChristianProfile['faithFoundation'],
  readiness: ChristianProfile['ministryReadiness'],
): Recommendations {
  const pri = archetypeByKey(top[0].key), sec = archetypeByKey(top[1].key);
  const ministriesToTry = Array.from(new Set([...pri.ministries.slice(0, 4), ...sec.ministries.slice(0, 2)]));
  const courseIds = Array.from(new Set([...COURSES_BY_ORIENTATION[top[0].key], ...COURSES_BY_ORIENTATION[top[1].key].slice(0, 1)]));
  const practices = [...PRACTICE_BY_ORIENTATION[top[0].key], PRACTICE_BY_ORIENTATION[top[1].key][0]];
  const equippingFocus = [...pri.equip.slice(0, 3)];

  if (faith && faith.overall < 60) {
    courseIds.unshift('c_bible_intro', 'c_basics');
    equippingFocus.unshift('信仰基础与圣经整体脉络');
  }
  if (readiness && readiness.overall < 50) {
    practices.unshift('寻找一位导师或牧者，约定每月一次服事反馈');
    equippingFocus.push('在固定小岗位中建立持续性');
  }
  if (readiness && readiness.facets.mentoring.normalizedScore < 40) {
    practices.push('主动邀请一位牧者观察你的一次服事并给予反馈');
  }

  const growthPlan = {
    d30: [`完成「${ARCHETYPES_BASE.find(a => a.key === top[0].key)!.equip[0]}」相关课程的前两课`, practices[0]],
    d90: [practices[1] ?? practices[0], `在「${ministriesToTry[0]}」中承担一个具体角色`, '记录至少 2 条服事反思'],
    d180: ['邀请导师或同工给出一次正式反馈', '重新完成 Christian Profile，对比倾向与准备度的变化'],
  };

  return { ministriesToTry, courseIds: Array.from(new Set(courseIds)).slice(0, 5), practices: practices.slice(0, 4), equippingFocus: equippingFocus.slice(0, 4), growthPlan };
}

/** 单一维度的平衡解释：优势 / 典型贡献 / 盲点 / 成长方向（规范 §37） */
export function balancedInterpretation(key: OrientationKey) {
  const a = archetypeByKey(key);
  return {
    strength: a.strengths,
    contribution: a.ministries.slice(0, 3),
    blindSpot: a.risks,
    growth: a.equip.slice(0, 3),
  };
}
