// AMAS Christian Profile · 统一证据模型（Evidence Model V2.1）
//
// V2.1 的核心修正：证据不再是一个「只会让结论更可信」的全局池。
// 每条证据必须回答三个问题：
//   1. 它在验证**哪一项**事奉倾向？（targetOrientations，不允许为空）
//   2. 它是支持、中性、还是**反驳**当前判断？（polarity）
//   3. 它有多强？（strength）
//
// 由此，系统第一次具备了「修正自己」的能力：当现实证据与测评结论冲突时，
// 可信度不升反降，并显式标记冲突，提示用户重新评估——而不是继续给一个
// 高分配上一个高可信度。
//
// 铁律（承接总规范 V1.0 §2.3）：
//  - 任何证据都**不会**直接改动倾向指数；指数只有重新评估才更新；
//  - 证据只影响「证据可信度」与「冲突提示」；
//  - 导师反馈独立保存，不覆盖用户原始作答。

import type { ArchKey } from '../growthArchetypes';

/** 证据来源类型。前 8 种当前已可产生，后 4 种为未来扩展预留。 */
export type EvidenceType =
  | 'assessment'            // 测评作答（Likert / 频率题）
  | 'scenario_task'         // 情境题选择
  | 'course_completion'     // 课程完成
  | 'learning_performance'  // 学习表现（作业、产出、评分）
  | 'ministry_practice'     // 真实服事记录
  | 'mentor_feedback'       // 导师 / 牧者反馈
  | 'peer_feedback'         // 同伴反馈
  | 'self_reflection'       // 自我复盘（R1，不计为外部反馈）
  | 'verification_intent'   // 「我愿意尝试」的验证意向（尚未产生结果）
  // ---- 未来扩展 ----
  | 'devotional_record'
  | 'pastoral_followup'
  | 'life_stage'
  | 'spiritual_growth_evidence';

/** 证据指向：支持 / 中性 / 反证。反证是 V2.1 最重要的新增。 */
export type EvidencePolarity = 'support' | 'neutral' | 'challenge';

/** 证据强度。弱证据不足以单独改变可信度档位。 */
export type EvidenceStrengthLevel = 'weak' | 'moderate' | 'strong';

/**
 * 一条证据。所有字段可序列化，直接进 growth 文档同步。
 * `targetOrientations` **必须非空**——证据必须有验证目标，不能进全局池。
 */
export interface ChristianProfileEvidence {
  id: string;
  type: EvidenceType;
  /** 这条证据在验证哪些事奉倾向。必须至少一项，否则视为无效证据被丢弃。 */
  targetOrientations: ArchKey[];
  polarity: EvidencePolarity;
  strength: EvidenceStrengthLevel;
  /** 人类可读的一句话，用于「判断依据」与成长历史展示 */
  summary: string;
  /** 来源对象（课程 id / 服事记录 id / 导师 id 等） */
  sourceId?: string;
  /** 来源的显示名（课程名、导师称呼等） */
  sourceLabel?: string;
  /** 提供者：self = 用户本人；其余为外部来源 */
  source: 'self' | 'peer' | 'mentor' | 'system';
  /** 事情实际发生的时间 */
  observedAt: string;
  /** 记录进系统的时间 */
  createdAt: string;
  note?: string;
}

/** 校验：无目标的证据一律丢弃，防止「全局证据池」污染任何倾向。 */
export function isValidEvidence(e: ChristianProfileEvidence): boolean {
  return Array.isArray(e.targetOrientations) && e.targetOrientations.length > 0;
}

/** 外部证据 = 不是用户自己说的。只有外部证据能显著提升可信度。 */
export const EXTERNAL_TYPES: EvidenceType[] = [
  'course_completion', 'learning_performance', 'ministry_practice',
  'mentor_feedback', 'peer_feedback', 'pastoral_followup',
];
export const isExternal = (e: ChristianProfileEvidence) => EXTERNAL_TYPES.includes(e.type);

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  assessment: '测评回答',
  scenario_task: '情境题',
  course_completion: '课程完成',
  learning_performance: '学习表现',
  ministry_practice: '实际服侍',
  mentor_feedback: '导师反馈',
  peer_feedback: '同伴反馈',
  self_reflection: '自我复盘',
  verification_intent: '验证意向',
  devotional_record: '灵修记录',
  pastoral_followup: '牧养跟进',
  life_stage: '生命阶段',
  spiritual_growth_evidence: '成长果效',
};

export const POLARITY_LABEL: Record<EvidencePolarity, string> = {
  support: '支持', neutral: '中性', challenge: '反证',
};

// ------------------------------------------------------------
// 证据可信度：与「倾向指数」完全独立的第二个维度
// ------------------------------------------------------------

export type ConfidenceLevel = 'low' | 'moderate' | 'high' | 'very_high';
const ORDER: ConfidenceLevel[] = ['low', 'moderate', 'high', 'very_high'];
const step = (c: ConfidenceLevel, n: number): ConfidenceLevel =>
  ORDER[Math.max(0, Math.min(ORDER.length - 1, ORDER.indexOf(c) + n))];

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: '较低', moderate: '中等', high: '较高', very_high: '高',
};

export const CONFIDENCE_HINT: Record<ConfidenceLevel, string> = {
  low: '目前只有少量作答支持，或现实证据与测评结果不一致，结论仅供探索参考。',
  moderate: '有测评与情境题支持，但尚无真实学习或服侍证据。',
  high: '除测评外，已有学习或实际服侍证据支持。',
  very_high: '已有多类证据支持，包括来自他人的观察与反馈。',
};

/** 某一倾向上的证据冲突程度。 */
export type ConflictLevel = 'none' | 'mixed' | 'contradicted';
export const CONFLICT_LABEL: Record<ConflictLevel, string> = {
  none: '无冲突', mixed: '证据不一致', contradicted: '现实证据与测评不符',
};

export interface ConfidenceResult {
  level: ConfidenceLevel;
  conflict: ConflictLevel;
  /** 一句话解释这个可信度是怎么来的，用于「判断依据」页 */
  reason: string;
}

const weightOf = (e: ChristianProfileEvidence) => (e.strength === 'strong' ? 3 : e.strength === 'moderate' ? 2 : 1);

/**
 * 计算某一倾向的证据可信度与冲突程度。纯函数、确定性。
 *
 * 规则：
 *  1. 基线由测评题量决定：题量充足 → moderate，否则 low。
 *     **只有测评与情境题时，最高只能到 moderate**，无论指数多高。
 *  2. 支持性外部证据：出现即 high；来自他人的观察（导师/同伴）→ very_high。
 *  3. **反证会修正判断**：
 *     - 反证权重 ≥ 支持权重 → contradicted：可信度直接压到 low，并提示重新评估；
 *     - 存在反证但支持更多 → mixed：可信度降一档，不允许停留在 very_high。
 *  4. 作答质量存疑（≥2 个标记）再降一档。
 */
export function computeConfidence(input: {
  itemsAnswered: number;
  scenarioOffered: number;
  externalEvidence: ChristianProfileEvidence[];
  qualityFlagCount: number;
}): ConfidenceResult {
  const { itemsAnswered, scenarioOffered, qualityFlagCount } = input;
  const evidence = input.externalEvidence.filter(isValidEvidence);

  // 1) 测评基线
  let level: ConfidenceLevel =
    itemsAnswered >= 3 && scenarioOffered >= 2 ? 'moderate'
      : itemsAnswered >= 2 ? 'moderate'
        : 'low';
  let reason = '当前只有测评与情境题作为依据。';

  // 2) 支持性证据
  const support = evidence.filter(e => e.polarity === 'support' && isExternal(e));
  const challenge = evidence.filter(e => e.polarity === 'challenge' && isExternal(e));
  const fromOthers = support.some(e => e.source === 'mentor' || e.source === 'peer');
  if (support.length) {
    level = fromOthers ? 'very_high' : 'high';
    reason = fromOthers
      ? '除测评外，已有来自导师或同伴的观察支持。'
      : '除测评外，已有学习或实际服侍证据支持。';
  }

  // 3) 反证修正——这是让系统「能修正自己」的关键。
  //
  // P2-A.1 的重要约束：**一次自我报告永远不足以推翻结论**。
  // 单次「我觉得不合适」多半是第一次尝试的学习曲线，不是这个倾向不存在。
  // 只有当反证重复出现（≥2 条），或来自他人的观察时，才允许判定为 contradicted；
  // 否则最多是 mixed（降一档），并明说「还需要再验证一两次」。
  let conflict: ConflictLevel = 'none';
  if (challenge.length) {
    const sw = support.reduce((t, e) => t + weightOf(e), 0);
    const cw = challenge.reduce((t, e) => t + weightOf(e), 0);
    const corroborated = challenge.length >= 2
      || challenge.some(e => e.source === 'mentor' || e.source === 'peer');
    if (cw >= sw && corroborated) {
      conflict = 'contradicted';
      level = 'low';
      reason = '现实中的表现多次与测评结论不一致，当前判断需要重新验证。';
    } else {
      conflict = 'mixed';
      level = step(level, -1);
      reason = challenge.length === 1 && !corroborated
        ? '有一次实践结果与测评结论不同。单独一次还不足以改变判断，值得再验证一两次。'
        : '既有支持证据，也有不一致的观察，结论仍需更多验证。';
    }
  }

  // 4) 作答质量
  if (qualityFlagCount >= 2) {
    level = step(level, -1);
    reason += '（本次作答质量存疑，已下调一档。）';
  }
  return { level, conflict, reason };
}

/**
 * 整份画像的可信度：取 Top 3 的**中位数**而非最低值。
 * 最低值会让第三位倾向单方面拖垮整体；中位数更能代表「这份排序有多可靠」。
 * 任一 Top 倾向出现 contradicted 时，整体再降一档。
 */
export function overallConfidence(top3: ConfidenceResult[]): ConfidenceLevel {
  if (!top3.length) return 'low';
  const sorted = [...top3].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  let level = sorted[Math.floor(sorted.length / 2)].level;
  if (top3.some(r => r.conflict === 'contradicted')) level = step(level, -1);
  return level;
}

// ------------------------------------------------------------
// 「为什么这样判断」面板
// ------------------------------------------------------------

/** 四态：支持 / 中性 / 反证 / 暂无。取代 V2 的 strong·present·none。 */
export type SourceStatus = 'support' | 'neutral' | 'challenge' | 'none';
export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  support: '支持', neutral: '中性', challenge: '反证', none: '暂无',
};

export interface SourceRow {
  type: EvidenceType;
  status: SourceStatus;
  /** strong 时显示「较强」的补充标记 */
  emphasis?: boolean;
  detail: string;
}

export function buildSourceRows(input: {
  assessmentTags: string[];
  scenarioPicked: number;
  scenarioOffered: number;
  externalEvidence: ChristianProfileEvidence[];
}): SourceRow[] {
  const { assessmentTags, scenarioPicked, scenarioOffered } = input;
  const evidence = input.externalEvidence.filter(isValidEvidence);
  const of = (t: EvidenceType) => evidence.filter(e => e.type === t);

  const rowFor = (t: EvidenceType, noneText: string): SourceRow => {
    const items = of(t);
    if (!items.length) return { type: t, status: 'none', detail: noneText };
    const ch = items.filter(e => e.polarity === 'challenge');
    const sp = items.filter(e => e.polarity === 'support');
    const status: SourceStatus = ch.length && ch.length >= sp.length ? 'challenge' : sp.length ? 'support' : 'neutral';
    return {
      type: t,
      status,
      emphasis: items.some(e => e.strength === 'strong'),
      detail: items.map(e => `${e.sourceLabel ? `${e.sourceLabel}：` : ''}${e.summary}`).join('；'),
    };
  };

  return [
    {
      type: 'assessment',
      status: assessmentTags.length ? 'support' : 'none',
      emphasis: assessmentTags.length >= 2,
      detail: assessmentTags.length
        ? `你在以下方面持续表现出该倾向：${assessmentTags.join('、')}`
        : '本次作答中该方向的表现不明显。',
    },
    {
      type: 'scenario_task',
      status: scenarioOffered === 0 ? 'none' : scenarioPicked > 0 ? 'support' : 'neutral',
      emphasis: scenarioPicked >= 2,
      detail: scenarioOffered === 0
        ? '本次未出现与该倾向相关的情境题。'
        : scenarioPicked > 0
          ? `在 ${scenarioOffered} 个相关情境中，你有 ${scenarioPicked} 次优先选择了这一类行动。`
          : `出现过 ${scenarioOffered} 个相关情境，你都选择了其他方向的行动。`,
    },
    rowFor('course_completion', '还没有相关课程的完成记录。'),
    rowFor('learning_performance', '还没有学习产出可供参考。'),
    rowFor('ministry_practice', '还没有真实服侍记录支持或修正这项判断。'),
    rowFor('mentor_feedback', '还没有导师或牧者的观察反馈。'),
    rowFor('peer_feedback', '还没有同伴反馈。'),
  ];
}
