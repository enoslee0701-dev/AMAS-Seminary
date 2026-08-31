// AMAS Christian Profile · 统一证据模型（Evidence Model）
//
// Christian Profile 是一份**持续更新的成长画像**，不是一次性测评报告。
// 画像的每一个结论都必须能追溯到证据；证据分多种来源，权重与可信度各不相同。
//
// 铁律（承接总规范 V1.0 §2.3）：
//  - 完成课程只增加「学习证据」，不直接抬高任何倾向指数；
//  - 实际服事只增加「实践证据」，是否影响画像由重新评估决定；
//  - 导师反馈独立保存，不覆盖用户的原始作答；
//  - 倾向指数只有**重新评估**才更新。
//
// 本文件定义结构与可信度算法，不含 UI。Timeline 与自动更新算法属于 P2，
// 此处先把数据形状固定下来，避免将来又要迁移。

import type { ArchKey } from '../growthArchetypes';

/** 证据来源类型。前 6 种当前已可产生，后 4 种为未来扩展预留。 */
export type EvidenceType =
  | 'assessment'            // 测评作答（Likert / 频率题）
  | 'scenario_task'         // 情境题选择
  | 'course_completion'     // 课程完成
  | 'learning_performance'  // 学习表现（作业、产出、评分）
  | 'ministry_practice'     // 真实服事记录
  | 'mentor_feedback'       // 导师 / 牧者反馈
  | 'peer_feedback'         // 同伴反馈
  | 'self_reflection'       // 自我复盘（R1，不计为外部反馈）
  // ---- 未来扩展 ----
  | 'devotional_record'     // 灵修记录
  | 'pastoral_followup'     // 牧养跟进
  | 'life_stage'            // 生命阶段变化
  | 'spiritual_growth_evidence';

/** 一条证据。所有字段可序列化，直接进 growth 文档同步。 */
export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  /** 这条证据支持（或质疑）哪些事奉倾向；空数组表示与倾向无关的通用证据 */
  orientations: ArchKey[];
  /** 人类可读的一句话，用于「判断依据」与 Timeline 展示 */
  summary: string;
  /** 发生时间（ISO） */
  at: string;
  /** 提供者：self = 用户本人；其余为外部来源 */
  source: 'self' | 'peer' | 'mentor' | 'system';
  /** 可选的结构化载荷（课程 id、服事记录 id、评分等） */
  payload?: Record<string, unknown>;
}

/** 外部证据 = 不是用户自己说的。只有外部证据能显著提升可信度。 */
export const EXTERNAL_TYPES: EvidenceType[] = [
  'course_completion', 'learning_performance', 'ministry_practice',
  'mentor_feedback', 'peer_feedback', 'pastoral_followup',
];

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  assessment: '测评回答',
  scenario_task: '情境题',
  course_completion: '课程完成',
  learning_performance: '学习表现',
  ministry_practice: '实际服侍',
  mentor_feedback: '导师反馈',
  peer_feedback: '同伴反馈',
  self_reflection: '自我复盘',
  devotional_record: '灵修记录',
  pastoral_followup: '牧养跟进',
  life_stage: '生命阶段',
  spiritual_growth_evidence: '成长果效',
};

// ------------------------------------------------------------
// 证据可信度：与「倾向指数」完全独立的第二个维度
// ------------------------------------------------------------

/**
 * 倾向指数回答「这个方向表现得有多明显」；
 * 证据可信度回答「系统凭什么这样判断」。两者不可互相换算，也不可合并展示为一个数字。
 */
export type ConfidenceLevel = 'low' | 'moderate' | 'high' | 'very_high';

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: '较低', moderate: '中等', high: '较高', very_high: '高',
};

export const CONFIDENCE_HINT: Record<ConfidenceLevel, string> = {
  low: '目前只有少量作答支持，结论仅供探索参考。',
  moderate: '有测评与情境题支持，但尚无真实学习或服侍证据。',
  high: '除测评外，已有学习或实际服侍证据支持。',
  very_high: '已有多类证据支持，包括来自他人的观察与反馈。',
};

/** 判断依据面板上每一类证据的状态。 */
export type SourceStatus = 'strong' | 'present' | 'none';
export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  strong: '较强', present: '已有', none: '暂无',
};

export interface SourceRow {
  type: EvidenceType;
  status: SourceStatus;
  /** 该来源的具体说明；none 时说明缺什么 */
  detail: string;
}

/**
 * 由「测评内部信号 + 外部证据」计算某一倾向的证据可信度。
 * 纯函数、确定性；同样输入永远同样输出。
 *
 * - 只有测评 + 情境 → 最高只能到 moderate（中等），无论指数多高；
 * - 出现任一外部证据 → high；
 * - 出现来自他人的观察（导师 / 同伴） → very_high。
 */
export function computeConfidence(input: {
  /** 该维度回答的题目数 */
  itemsAnswered: number;
  /** 该维度在情境题中被提供的次数 */
  scenarioOffered: number;
  /** 与该维度相关的外部证据 */
  externalEvidence: EvidenceItem[];
  /** 整份作答的质量标记数量（越多越降级） */
  qualityFlagCount: number;
}): ConfidenceLevel {
  const { itemsAnswered, scenarioOffered, externalEvidence, qualityFlagCount } = input;
  const hasOthers = externalEvidence.some(e => e.source === 'mentor' || e.source === 'peer');
  const hasExternal = externalEvidence.length > 0;

  let level: ConfidenceLevel;
  if (hasOthers) level = 'very_high';
  else if (hasExternal) level = 'high';
  else if (itemsAnswered >= 3 && scenarioOffered >= 2) level = 'moderate';
  else if (itemsAnswered >= 2) level = 'moderate';
  else level = 'low';

  // 作答质量存疑时降一档（但外部证据充分时不降到 low 以下）
  if (qualityFlagCount >= 2) {
    const order: ConfidenceLevel[] = ['low', 'moderate', 'high', 'very_high'];
    level = order[Math.max(0, order.indexOf(level) - 1)];
  }
  return level;
}

/** 生成「为什么这样判断」面板的来源清单（当前版本：外部证据尚未接入时全部为 none）。 */
export function buildSourceRows(input: {
  assessmentTags: string[];
  scenarioPicked: number;
  scenarioOffered: number;
  externalEvidence: EvidenceItem[];
}): SourceRow[] {
  const { assessmentTags, scenarioPicked, scenarioOffered, externalEvidence } = input;
  const of = (t: EvidenceType) => externalEvidence.filter(e => e.type === t);
  const rowFor = (t: EvidenceType, noneText: string): SourceRow => {
    const items = of(t);
    return items.length
      ? { type: t, status: items.length >= 2 ? 'strong' : 'present', detail: items.map(e => e.summary).join('；') }
      : { type: t, status: 'none', detail: noneText };
  };
  return [
    {
      type: 'assessment',
      status: assessmentTags.length >= 2 ? 'strong' : assessmentTags.length === 1 ? 'present' : 'none',
      detail: assessmentTags.length ? `你在以下方面持续表现出该倾向：${assessmentTags.join('、')}` : '本次作答中该方向的表现不明显。',
    },
    {
      type: 'scenario_task',
      status: scenarioPicked >= 2 ? 'strong' : scenarioPicked === 1 ? 'present' : 'none',
      detail: scenarioOffered === 0
        ? '本次未出现与该倾向相关的情境题。'
        : scenarioPicked > 0
          ? `在 ${scenarioOffered} 个相关情境中，你有 ${scenarioPicked} 次优先选择了这一类行动。`
          : `出现过 ${scenarioOffered} 个相关情境，你都选择了其他方向的行动。`,
    },
    rowFor('course_completion', '还没有相关课程的完成记录。'),
    rowFor('ministry_practice', '还没有真实服侍记录支持或修正这项判断。'),
    rowFor('mentor_feedback', '还没有导师或牧者的观察反馈。'),
    rowFor('peer_feedback', '还没有同伴反馈。'),
  ];
}
