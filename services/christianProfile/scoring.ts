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
import {
  computeConfidence, buildSourceRows, overallConfidence, isValidEvidence,
  type ConfidenceLevel, type ConflictLevel, type ChristianProfileEvidence, type SourceRow,
} from './evidence';

export interface Answer {
  itemId: string;
  optionIndex: number;
  responseTimeMs?: number;
  answeredAt: string;
}

export type EvidenceStrength = 'limited' | 'moderate' | 'high';

export interface DimensionScore {
  rawScore: number;
  /** 倾向指数 0–100：当前证据中这一事奉方向表现得有多明显。
   *  **不是**百分比、百分位、能力分数或属灵成熟度。 */
  normalizedScore: number;
  /** @deprecated 用 confidence 代替；保留仅为兼容历史档案 */
  evidenceStrength: EvidenceStrength;
  /** 证据可信度：系统凭什么这样判断。与 normalizedScore 完全独立。 */
  confidence: ConfidenceLevel;
  /** 「为什么这样判断」面板的证据来源清单 */
  sources: SourceRow[];
  /** 现实证据与本次测评结论是否冲突。contradicted 时应提示重新评估。 */
  conflict: ConflictLevel;
  /** 这一档可信度是怎么来的（一句话，用于判断依据页） */
  confidenceReason: string;
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
  /** 第一与第二并列（四舍五入后同分）→ 呈现为“并列最高”，不强行分主次 */
  topTie: boolean;
  /** 组合标签（仅解释用，不是新类型） */
  combinedLabel: string;
  /** Orientation × Readiness 矩阵解释（标准版） */
  orientationReadiness?: { key: 'potential_needs_equipping' | 'expand_responsibility' | 'review_direction' | 'forming'; text: string };
  qualityFlags: QualityFlag[];
  /** @deprecated 用 confidence 代替 */
  evidenceStrength: EvidenceStrength;
  /** 整份画像的可信度（Top 3 的中位档；任一项被现实证据反证时再降一档） */
  confidence: ConfidenceLevel;
  /** 现实证据与测评结论不一致的倾向。非空时结果页必须显式提示并建议重新评估。 */
  conflicts: { key: OrientationKey; level: ConflictLevel }[];
  /** 用户可见的画像版本号：V1、V2 …（由已保存的历史条数决定，保存时回填） */
  versionNo: number;
  /** 可解释性：每个 Top 维度的主要来源（行为标签） */
  explanations: Partial<Record<OrientationKey, string[]>>;
  recommendations: Recommendations;
}

/** 成长实验：不是待办清单，而是「目标 → 行动 → 验证 → 新证据」的一轮验证。 */
export interface GrowthStage {
  span: '30天' | '90天' | '6个月';
  objective: string;
  actions: string[];
  verification: string[];
  newEvidence: string[];
}

export interface Recommendations {
  /** 推荐验证场景（原「建议尝试的事奉」）——不是职位安排 */
  ministriesToTry: string[];
  /** 分三档，避免一次给太多课程 */
  coursesPriority: string[];
  coursesRecommended: string[];
  coursesLater: string[];
  /** @deprecated 兼容旧调用；等于三档之和 */
  courseIds: string[];
  practices: string[];
  equippingFocus: string[];
  /** 为什么建议这些装备重点 */
  equippingReason: string;
  growthPlan: GrowthStage[];
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
export function scoreAssessment(
  level: AssessmentLevel,
  answers: Answer[],
  completedAt = new Date().toISOString(),
  /** 已有的外部证据（课程 / 服事 / 导师 / 同伴）。当前版本调用方尚未接入，默认空。 */
  externalEvidence: ChristianProfileEvidence[] = [],
): ChristianProfile {
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
  // 精细分（未四舍五入）+ 辅助信号，用于确定性地打破并列：
  // 同分时依次比较 未取整分 → 情境题被选次数 → 高选项(“比较符合/经常”以上)数量 → 固定维度顺序。
  const fine = {} as Record<OrientationKey, number>;
  const topBox = {} as Record<OrientationKey, number>;
  for (const k of ORIENTATION_KEYS) topBox[k] = likertVals[k].filter(v => v >= 75).length;
  for (const k of ORIENTATION_KEYS) {
    const lk = likertVals[k];
    const likertIdx = lk.length ? mean(lk) : 50;
    const scenIdx = offered[k] > 0 ? (chosen[k] / offered[k]) * 100 : null;
    const normalized = scenIdx === null ? likertIdx : 0.8 * likertIdx + 0.2 * scenIdx;
    fine[k] = normalized;
    const evidenceStrength: EvidenceStrength =
      lk.length >= 3 && offered[k] >= 2 ? 'high' : lk.length >= 2 ? 'moderate' : 'limited';
    // 证据必须声明验证目标；无目标的证据被丢弃，不进入任何倾向（V2.1）
    const related = externalEvidence.filter(e => isValidEvidence(e) && e.targetOrientations.includes(k));
    const conf = computeConfidence({
      itemsAnswered: lk.length,
      scenarioOffered: offered[k],
      externalEvidence: related,
      qualityFlagCount: 0,   // 质量标记在下方统一评估后再降档
    });
    ministryOrientation[k] = {
      rawScore: Math.round(lk.reduce((t, n) => t + n / 25 + 1, 0) + chosen[k]),
      normalizedScore: Math.round(clamp(normalized)),
      evidenceStrength,
      confidence: conf.level,
      conflict: conf.conflict,
      confidenceReason: conf.reason,
      sources: buildSourceRows({
        assessmentTags: Array.from(new Set(sources[k].filter(t => t !== '情境题中优先选择了此类行动'))),
        scenarioPicked: chosen[k],
        scenarioOffered: offered[k],
        externalEvidence: related,
      }),
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
      facets[f] = { rawScore: correct, normalizedScore: n ? Math.round((correct / n) * 100) : 0, itemsAnswered: n, evidenceStrength: n >= 3 ? 'high' : n >= 2 ? 'moderate' : 'limited', confidence: n >= 3 ? 'high' : n >= 2 ? 'moderate' : 'low', sources: [], conflict: 'none', confidenceReason: '' };
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
      facets[f] = { rawScore: vals.length, normalizedScore: Math.round(mean(vals)), itemsAnswered: vals.length, evidenceStrength: vals.length >= 2 ? 'high' : vals.length === 1 ? 'moderate' : 'limited', confidence: vals.length >= 2 ? 'high' : vals.length === 1 ? 'moderate' : 'low', sources: [], conflict: 'none', confidenceReason: '' };
    }
    const overall = Math.round(mean(keys.map(f => facets[f].normalizedScore)));
    ministryReadiness = { overall, level: overall >= 70 ? 'strong' : overall >= 45 ? 'developing' : 'early', facets };
  }

  // ---- Top 3 / 多元组合 / 组合标签 ----
  const ranked = ORIENTATION_KEYS
    .map((k, i) => ({ key: k, score: ministryOrientation[k].normalizedScore, fine: fine[k], scen: chosen[k], top: topBox[k], order: i }))
    .sort((a, b) => (b.fine - a.fine) || (b.scen - a.scen) || (b.top - a.top) || (a.order - b.order))
    .map(({ key, score }) => ({ key, score }));
  const topOrientations = ranked.slice(0, 3);
  const multiBlend = topOrientations[0].score - topOrientations[2].score <= 3;
  const topTie = topOrientations[0].score === topOrientations[1].score;
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

  // 质量标记统一降档（每维 + 整体），保证「作答存疑 → 结论强度下降」
  if (qualityFlags.length >= 2) {
    const order: ConfidenceLevel[] = ['low', 'moderate', 'high', 'very_high'];
    for (const k of ORIENTATION_KEYS) {
      const cur = ministryOrientation[k].confidence;
      ministryOrientation[k].confidence = order[Math.max(0, order.indexOf(cur) - 1)];
    }
  }
  // 整体可信度取 Top 3 的中位数（取最低值会被第三位单方面拖垮），任一项被反证再降一档
  const confidence = overallConfidence(topOrientations.map(t => ({
    level: ministryOrientation[t.key].confidence,
    conflict: ministryOrientation[t.key].conflict,
    reason: ministryOrientation[t.key].confidenceReason,
  })));
  // 现实证据与测评结论冲突的倾向：结果页需显式提示，而不是把冲突藏起来
  const conflicts = ORIENTATION_KEYS
    .filter(k => ministryOrientation[k].conflict !== 'none')
    .map(k => ({ key: k, level: ministryOrientation[k].conflict }));

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
    topOrientations, multiBlend, topTie, combinedLabel, orientationReadiness,
    qualityFlags, evidenceStrength, confidence, conflicts, versionNo: 1, explanations, recommendations,
  };
}

// ------------------------------------------------------------
// 推荐引擎（规则式，deterministic；措辞为“建议尝试”）
// ------------------------------------------------------------
const COURSES_BY_ORIENTATION: Record<OrientationKey, string[]> = {
  teacher: ['c_dr_marking', 'c_homiletics', 'c_lay_systematic'],
  explorer: ['c_dr_marking', 'c_greek', 'c_bible_geography'],
  equipper: ['c_disciple', 'c_sunday_school', 'c_newbeliever'],
  shepherd: ['c_counseling', 'c_disciple', 'c_smallgroup'],
  encourager: ['c_counseling', 'c_assurance', 'c_disciple'],
  mercy: ['c_counseling', 'c_healing_inner', 'c_basics'],
  intercessor: ['c_prayer', 'c_warfare', 'c_worship_studies'],
  evangelist: ['c_evangelism', 'c_romans', 'c_newbeliever'],
  missionary: ['c_contextual', 'c_islam', 'c_comparative_religion'],
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
  const comboLabel = `${pri.label} × ${sec.label}`;

  // 推荐验证场景：不是职位安排，是可以去验证倾向的真实环境
  const ministriesToTry = Array.from(new Set([...pri.ministries.slice(0, 4), ...sec.ministries.slice(0, 2)]));

  // 装备重点先于课程：先说明为什么，再给课
  const equippingFocus = Array.from(new Set([...pri.equip.slice(0, 3), sec.equip[0]]));
  let equippingReason = `为进一步验证和发展你目前较明显的「${comboLabel}」倾向，现阶段建议优先加强以下能力。`;

  // 课程分三档，避免一次给太多
  const priCourses = COURSES_BY_ORIENTATION[top[0].key];
  const secCourses = COURSES_BY_ORIENTATION[top[1].key];
  const thirdCourses = top[2] ? COURSES_BY_ORIENTATION[top[2].key] : [];
  let coursesPriority = priCourses.slice(0, 2);
  const coursesRecommended = Array.from(new Set([...priCourses.slice(2), ...secCourses.slice(0, 2)])).filter(c => !coursesPriority.includes(c)).slice(0, 2);
  const coursesLater = Array.from(new Set([...secCourses.slice(2), ...thirdCourses])).filter(c => !coursesPriority.includes(c) && !coursesRecommended.includes(c)).slice(0, 3);

  if (faith && faith.overall < 60) {
    coursesPriority = Array.from(new Set(['c_bible_intro', 'c_basics', ...coursesPriority])).slice(0, 2);
    equippingFocus.unshift('信仰基础与圣经整体脉络');
    equippingReason = `你的信仰基础目前还在建立中，因此在发展「${comboLabel}」倾向之前，建议先补齐根基。`;
  }

  const practices = [...PRACTICE_BY_ORIENTATION[top[0].key], PRACTICE_BY_ORIENTATION[top[1].key][0]];
  if (readiness && readiness.overall < 50) practices.unshift('寻找一位导师或牧者，约定每月一次服事反馈');
  if (readiness && readiness.facets.mentoring.normalizedScore < 40) practices.push('主动邀请一位牧者观察你的一次服事并给予反馈');

  const firstCourse = coursesPriority[0];
  const firstScene = ministriesToTry[0];

  // 成长实验：目标 → 行动 → 验证指标 → 新证据
  const growthPlan: GrowthStage[] = [
    {
      span: '30天',
      objective: `验证你的「${pri.label}」倾向能否转化为实际能力。`,
      actions: [
        `完成「${equippingFocus[0]}」相关课程的前两课`,
        practices[0],
        '把过程写成一页笔记或记录',
      ],
      verification: [
        '你能否用自己的话说清楚学到的核心内容？',
        '这件事做起来是消耗你，还是让你更有活力？',
        '有没有出现你没预料到的困难？',
      ],
      newEvidence: ['学习完成记录', '一份可以给别人看的产出', '自我复盘（R1）'],
    },
    {
      span: '90天',
      objective: `把个人学习转化为真实服侍，让「${comboLabel}」的判断接受实际检验。`,
      actions: [
        practices[1] ?? practices[0],
        `在「${firstScene}」这类场景中承担一个具体的小角色`,
        '邀请一位同工或负责人给你一次口头反馈并记录下来',
      ],
      verification: [
        '你能否把复杂的内容讲清楚，或把事情组织起来？',
        '别人是否真的因此得到帮助？',
        '与团队配搭时是否顺畅？',
        '几周之后，你是否仍然投入？',
      ],
      newEvidence: ['实际服侍记录', '同工反馈（F1）', '至少 2 条服侍反思'],
    },
    {
      span: '6个月',
      objective: '根据真实学习与服侍证据，重新验证并更新你的信仰成长档案。',
      actions: [
        '邀请导师或牧者给出一次正式反馈',
        '整理这半年的学习、服侍与反思记录',
        '重新完成信仰成长档案',
      ],
      verification: [
        '哪些倾向被真实经历印证了？',
        '哪些倾向的证据仍然不足？',
        '你的准备度是否随着实践提升？',
      ],
      newEvidence: ['导师反馈（F2）', '新一版信仰成长档案', '两版画像的对比'],
    },
  ];

  return {
    ministriesToTry,
    coursesPriority,
    coursesRecommended,
    coursesLater,
    courseIds: Array.from(new Set([...coursesPriority, ...coursesRecommended, ...coursesLater])),
    practices: practices.slice(0, 4),
    equippingFocus: equippingFocus.slice(0, 4),
    equippingReason,
    growthPlan,
  };
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
