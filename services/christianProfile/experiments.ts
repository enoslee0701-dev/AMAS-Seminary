// AMAS Christian Profile · 验证实验（Validation Experiment）P2-A
//
// 为什么要把它从 Evidence 里拆出来：
//   Evidence 描述**已经发生并被观察到的事实**；
//   「我愿意尝试」只是一个打算，属于 Intent / Task / Workflow State。
//   V2.1 用 neutral+weak 让它不影响可信度，行为上安全，但概念上仍然错位。
//   从 P2-A 起，意向进入 ValidationExperiment，**不再写入 Evidence**。
//   旧的 verification_intent 记录仍可读取（见 store.migrateLegacyIntents），只是不再新增。
//
// 完整闭环：
//   实验(experiment) → 实践(actions) → 自我复盘(reflection) → 导师观察(observation)
//     → 生成证据(evidence) → 回到画像复核(review)
//
// 铁律：实验产出的证据仍然**只影响证据可信度，不改动倾向指数**（总规范 §2.3 / §31）。
// 关键的是：复盘与观察的结论可以是「没有验证成立」——此时产出的是 challenge 证据，
// 由 V2.1 的冲突逻辑把该倾向的可信度下调。这是系统能够修正自己的唯一入口。

import type { ArchKey } from '../growthArchetypes';
import type { ChristianProfileEvidence } from './evidence';

export type ExperimentStatus =
  | 'not_started'   // 已登记，还没开始
  | 'active'        // 进行中
  | 'completed'     // 实践完成，待复盘
  | 'reviewed'      // 已复盘（并可能已有导师观察），已产出证据
  | 'cancelled';    // 主动取消，不产生证据

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  not_started: '待开始', active: '进行中', completed: '待复盘', reviewed: '已复核', cancelled: '已取消',
};

export type ExperimentSource = 'profile_recommendation' | 'mentor_assigned' | 'self_selected';
export const EXPERIMENT_SOURCE_LABEL: Record<ExperimentSource, string> = {
  profile_recommendation: '来自画像推荐', mentor_assigned: '导师指派', self_selected: '自己选择',
};

export interface ValidationAction {
  id: string;
  text: string;
  done: boolean;
  doneAt?: string;
}

/**
 * 验证结论（P2-A.1 修正）。
 *
 * 关键修正：**「未能验证」不等于「反证」**。旧的三档把这两件事压在一起，
 * 会用「第一次做得很吃力」去推翻一个人的倾向——这与「用高分推断人格缺点」是同一类错误。
 *
 *   inconclusive  这次没能判断（机会太少、场合不合、准备不足、临时状况）→ 中性，**不下调可信度**
 *   disconfirmed  确实做了，而且明显不合——才是真正的反证
 *
 * 措辞铁律：两者都不是「失败」；disconfirmed 说的是「这个场合这段时间」，不是这个人。
 */
export type ValidationOutcome = 'confirmed' | 'partial' | 'inconclusive' | 'disconfirmed';

export const OUTCOME_LABEL: Record<ValidationOutcome, string> = {
  confirmed: '验证成立', partial: '部分成立', inconclusive: '这次没能判断', disconfirmed: '明显不合适',
};
export const OUTCOME_HINT: Record<ValidationOutcome, string> = {
  confirmed: '实际做下来，这个方向的表现与画像一致。',
  partial: '有一部分成立，也有一部分与预期不同。第一次尝试通常都是这样。',
  inconclusive: '这次的条件不足以判断——机会太少、场合不合适，或者临时有状况。系统只会记录你尝试过，不会因此下调任何判断。',
  disconfirmed: '确实做了，而且明显感觉不合。这说的是这个场合、这个阶段，不是说这个方向永远不适合你；它会让画像更贴近真实。',
};

/** 无法判断的原因。逼着系统区分「没机会验证」和「验证了但不成立」。 */
export type InconclusiveReason = 'limited_opportunity' | 'context_mismatch' | 'too_early' | 'interrupted' | 'other';
export const INCONCLUSIVE_REASON_LABEL: Record<InconclusiveReason, string> = {
  limited_opportunity: '机会太少，只做了一两次',
  context_mismatch: '场合与这个方向不太对应',
  too_early: '刚开始，还看不出来',
  interrupted: '中途有状况，没能完整进行',
  other: '其他原因',
};

/** 旧数据里的 `not_confirmed` 语义含混。保守地读作「这次没能判断」，绝不追认成反证。 */
export function normalizeOutcome(raw: string): ValidationOutcome {
  if (raw === 'not_confirmed') return 'inconclusive';
  return (['confirmed', 'partial', 'inconclusive', 'disconfirmed'] as const).includes(raw as ValidationOutcome)
    ? (raw as ValidationOutcome)
    : 'inconclusive';
}

/** 自我复盘（R1）。属于自我报告，不算他人观察，可信度最高只能到「较高」。 */
export interface SelfReflection {
  id: string;
  experimentId: string;
  outcome: ValidationOutcome;
  /** outcome 为 inconclusive 时的原因，用于把「没机会验证」与「验证了但不成立」分开 */
  inconclusiveReason?: InconclusiveReason;
  whatHappened: string;
  whatLearned?: string;
  createdAt: string;
}

/**
 * 导师 / 同工观察（F1 / F2）。
 * `verified` 为 false 表示由用户本人转述——诚实起见，转述的反馈**不当作他人观察**，
 * 生成证据时 source 记为 'self'，因此不会把可信度推到「高（very_high）」这一档。
 * 只有通过导师端确认的观察才 verified，才能作为真正的他人证据。
 */
export interface MentorObservation {
  id: string;
  experimentId: string;
  observerName: string;
  observerRole: 'mentor' | 'peer';
  outcome: ValidationOutcome;
  comment: string;
  verified: boolean;
  createdAt: string;
}

export interface ValidationExperiment {
  id: string;
  /** 这个实验在验证哪几项事奉倾向。必须非空，与 Evidence 同样的约束。 */
  targetOrientations: ArchKey[];
  title: string;
  description?: string;
  source: ExperimentSource;
  status: ExperimentStatus;
  startedAt?: string;
  completedAt?: string;
  reviewedAt?: string;
  growthGoal?: string;
  actions?: ValidationAction[];
  selfReflectionId?: string;
  mentorObservationId?: string;
  /** 本实验产出的证据 id，便于从证据回溯到实验 */
  generatedEvidenceIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export const isValidExperiment = (e: ValidationExperiment): boolean =>
  Array.isArray(e.targetOrientations) && e.targetOrientations.length > 0 && Boolean(e.title);

// ------------------------------------------------------------
// 状态机
// ------------------------------------------------------------

/** 允许的状态迁移。未列出的迁移一律拒绝，避免出现「没做就已复核」这类不可解释的数据。 */
const TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  not_started: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: ['reviewed', 'active', 'cancelled'],
  reviewed: [],          // 终态：证据已产出，不可回退（历史只追加）
  cancelled: [],
};

export const canTransition = (from: ExperimentStatus, to: ExperimentStatus): boolean =>
  TRANSITIONS[from].includes(to);

/** 只有复盘写完才能进入 reviewed——没有复盘就没有证据。 */
export const canReview = (e: ValidationExperiment): boolean =>
  e.status === 'completed' && Boolean(e.selfReflectionId);

// ------------------------------------------------------------
// 实验 → 证据
// ------------------------------------------------------------

/**
 * 复盘结论 → 证据极性。
 * 只有 `disconfirmed`（做了而且明显不合）才产出 challenge；
 * `inconclusive`（这次没能判断）是中性事实，只记录尝试过，**不下调任何判断**。
 */
const POLARITY_OF: Record<ValidationOutcome, ChristianProfileEvidence['polarity']> = {
  confirmed: 'support', partial: 'support', inconclusive: 'neutral', disconfirmed: 'challenge',
};

/**
 * 复盘结论 → 证据强度。
 * 自我报告的 disconfirmed 一律 moderate：一个人自己觉得不合，是重要信号，
 * 但不足以单独推翻测评结论——真正的推翻需要重复出现或他人观察（见 evidence.computeConfidence）。
 */
function reflectionStrength(exp: ValidationExperiment, outcome: ValidationOutcome): ChristianProfileEvidence['strength'] {
  if (outcome === 'inconclusive') return 'weak';
  if (outcome === 'partial') return 'moderate';
  if (outcome === 'disconfirmed') return 'moderate';
  return (exp.actions?.filter(a => a.done).length ?? 0) >= 2 ? 'strong' : 'moderate';
}

/**
 * 把一个已完成并复盘的实验转成证据。纯函数，确定性，可重复调用得到同样结果。
 *
 * - 自我复盘 → ministry_practice / source:self（真实做过的事，属外部证据，但不是他人观察）
 * - 导师观察 → mentor_feedback | peer_feedback；仅 verified 时 source 记为 mentor/peer
 * - 未复盘、已取消的实验不产出任何证据
 */
export function experimentToEvidence(
  exp: ValidationExperiment,
  reflection?: SelfReflection,
  observation?: MentorObservation,
): ChristianProfileEvidence[] {
  if (!isValidExperiment(exp) || exp.status === 'cancelled' || !reflection) return [];
  const at = exp.completedAt ?? reflection.createdAt;
  const outcome = normalizeOutcome(reflection.outcome);
  const reasonNote = outcome === 'inconclusive' && reflection.inconclusiveReason
    ? `（${INCONCLUSIVE_REASON_LABEL[reflection.inconclusiveReason]}）` : '';
  const out: ChristianProfileEvidence[] = [{
    id: `ev_exp_${exp.id}`,
    type: 'ministry_practice',
    targetOrientations: exp.targetOrientations,
    polarity: POLARITY_OF[outcome],
    strength: reflectionStrength(exp, outcome),
    summary: `${OUTCOME_LABEL[outcome]}${reasonNote}：${reflection.whatHappened}`,
    sourceId: exp.id,
    sourceLabel: exp.title,
    source: 'self',
    observedAt: at,
    createdAt: reflection.createdAt,
    note: reflection.whatLearned,
  }];

  if (observation) {
    const obsOutcome = normalizeOutcome(observation.outcome);
    out.push({
      id: `ev_obs_${observation.id}`,
      type: observation.observerRole === 'peer' ? 'peer_feedback' : 'mentor_feedback',
      targetOrientations: exp.targetOrientations,
      polarity: POLARITY_OF[obsOutcome],
      strength: obsOutcome === 'inconclusive' ? 'weak' : observation.verified ? 'strong' : 'moderate',
      summary: `${OUTCOME_LABEL[obsOutcome]}：${observation.comment}`,
      sourceId: observation.id,
      sourceLabel: observation.observerName,
      // 未经导师端确认的转述不算他人观察，因此不会把可信度推到最高档
      source: observation.verified ? observation.observerRole : 'self',
      observedAt: observation.createdAt,
      createdAt: observation.createdAt,
    });
  }
  return out;
}

/** 结果页顶部的一句话进度，用于「验证闭环」区块。 */
export function experimentSummary(list: ValidationExperiment[]): string {
  const n = (s: ExperimentStatus) => list.filter(e => e.status === s).length;
  const active = n('active') + n('not_started');
  const reviewed = n('reviewed');
  if (!list.length) return '还没有进行中的验证实验。画像目前只有测评作为依据。';
  if (!reviewed) return `${active} 个验证实验进行中。完成并复盘后，会成为检验这份画像的真实证据。`;
  return `已完成 ${reviewed} 轮验证${active ? `，另有 ${active} 个进行中` : ''}。这些结果已计入画像的证据可信度。`;
}
