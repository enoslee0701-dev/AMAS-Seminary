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
 * 验证结论。三档，措辞刻意中性：
 * 「没有验证成立」不等于失败，也不等于这个方向不适合你——它只是说明当前证据不支持。
 */
export type ValidationOutcome = 'confirmed' | 'partial' | 'not_confirmed';
export const OUTCOME_LABEL: Record<ValidationOutcome, string> = {
  confirmed: '验证成立', partial: '部分成立', not_confirmed: '未能验证',
};
export const OUTCOME_HINT: Record<ValidationOutcome, string> = {
  confirmed: '实际做下来，这个方向的表现与画像一致。',
  partial: '有一部分成立，也有一部分与预期不同。',
  not_confirmed: '实际做下来与画像的判断不一致。这不是失败——它是一条真实证据，会让画像更准确。',
};

/** 自我复盘（R1）。属于自我报告，不算他人观察，可信度最高只能到「较高」。 */
export interface SelfReflection {
  id: string;
  experimentId: string;
  outcome: ValidationOutcome;
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

/** 复盘结论 → 证据极性。「未能验证」产出 challenge，这正是画像被现实修正的方式。 */
const POLARITY_OF: Record<ValidationOutcome, ChristianProfileEvidence['polarity']> = {
  confirmed: 'support', partial: 'neutral', not_confirmed: 'challenge',
};

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
  const out: ChristianProfileEvidence[] = [{
    id: `ev_exp_${exp.id}`,
    type: 'ministry_practice',
    targetOrientations: exp.targetOrientations,
    polarity: POLARITY_OF[reflection.outcome],
    // 完成了具体行动的实践比只写了复盘更有分量
    strength: (exp.actions?.filter(a => a.done).length ?? 0) >= 2 ? 'strong' : 'moderate',
    summary: `${OUTCOME_LABEL[reflection.outcome]}：${reflection.whatHappened}`,
    sourceId: exp.id,
    sourceLabel: exp.title,
    source: 'self',
    observedAt: at,
    createdAt: reflection.createdAt,
    note: reflection.whatLearned,
  }];

  if (observation) {
    out.push({
      id: `ev_obs_${observation.id}`,
      type: observation.observerRole === 'peer' ? 'peer_feedback' : 'mentor_feedback',
      targetOrientations: exp.targetOrientations,
      polarity: POLARITY_OF[observation.outcome],
      strength: observation.verified ? 'strong' : 'moderate',
      summary: `${OUTCOME_LABEL[observation.outcome]}：${observation.comment}`,
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
