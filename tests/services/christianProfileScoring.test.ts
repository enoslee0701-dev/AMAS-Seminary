/**
 * Christian Profile · 正式算法回归护栏（RELEASE READINESS 任务 E2）
 *
 * 背景：CP 是产品核心，但 `services/christianProfile/scoring.ts`（474 行）
 * 此前**零测试覆盖**。上线阶段任何改动都可能在无人察觉的情况下让倾向分数漂移。
 *
 * 本文件的目的**不是**验证算法「对不对」——那属于心理测量学，
 * 需要真实样本，当前版本明确标注 Development Edition。
 * 它保护的是：**算法不因无关改动而发生未经解释的变化。**
 *
 * ★ 铁律边界（规范 §1，D-5 / D-6 / D-7）：
 *     信仰知识、灵修实践、事奉经验、外部证据
 *     **永远不得**进入 12 项事奉倾向的计算。
 *   下方 "边界" 分组用「加进去 → 断言倾向分数一字不变」来钉死这一条。
 *
 * ★ 本文件**不得**通过修改算法来变绿。fixture 是从当前实现固化下来的，
 *   若某次改动让它变红，正确做法是解释这次变化并显式更新 fixture，
 *   而不是把断言删掉或放宽。
 */
import { describe, it, expect } from 'vitest';
import {
  ITEM_BANK,
  ORIENTATION_KEYS,
  SCORING_VERSION,
  ITEM_VERSION,
  LANGUAGE_VERSION,
  ASSESSMENT_VERSIONS,
  type Item,
} from '../../services/christianProfile/items';
import {
  scoreAssessment,
  type Answer,
  type ChristianProfile,
} from '../../services/christianProfile/scoring';

const FIXED_TIME = '2026-01-01T00:00:00.000Z';

/**
 * 确定性作答：选项下标由该题在 **ITEM_BANK 中的固定位置** 决定。
 *
 * ★ 必须用全库位置，不能用「过滤后数组的下标」。否则同一道题在
 *   allAnswers 与 orientationOnlyAnswers 两个集合里会选到不同选项，
 *   比较时得到的差异来自测试构造而非算法 —— 首版就踩了这个坑。
 */
const BANK_INDEX = new Map(ITEM_BANK.map((item, i) => [item.id, i]));

function answerFor(item: Item): Answer {
  const i = BANK_INDEX.get(item.id)!;
  return {
    itemId: item.id,
    optionIndex: i % item.options.length,
    answeredAt: FIXED_TIME,
  };
}

const allAnswers: Answer[] = ITEM_BANK.map(item => answerFor(item));
const quickAnswers: Answer[] = ITEM_BANK.filter(i => i.quick).map(item => answerFor(item));

/** 只取 C/D（唯一允许进入倾向计算的两个 module）。 */
const orientationOnlyAnswers: Answer[] = ITEM_BANK
  .filter(i => i.module === 'ministry_orientation' || i.module === 'scenario')
  .map(item => answerFor(item));

function orientationVector(p: ChristianProfile): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of ORIENTATION_KEYS) out[k] = p.ministryOrientation[k].normalizedScore;
  return out;
}

// ────────────────────────────────────────────────────────────────
describe('CP · 结构常量（改动即视为正式口径变更）', () => {
  it('题库总数为 84，模块分布固定', () => {
    expect(ITEM_BANK.length).toBe(84);
    const byModule: Record<string, number> = {};
    for (const i of ITEM_BANK) byModule[i.module] = (byModule[i.module] ?? 0) + 1;
    expect(byModule).toEqual({
      faith_foundation: 12,
      discipleship: 12,
      ministry_orientation: 36,
      scenario: 12,
      readiness: 12,
    });
  });

  it('精简版恰好 30 题，且全部属于 C/D', () => {
    const quick = ITEM_BANK.filter(i => i.quick);
    expect(quick.length).toBe(30);
    const cd = quick.filter(
      i => i.module === 'ministry_orientation' || i.module === 'scenario',
    );
    expect(cd.length).toBe(30);
  });

  it('12 项事奉倾向的名称与顺序固定', () => {
    expect(ORIENTATION_KEYS).toEqual([
      'teacher', 'explorer', 'equipper', 'shepherd', 'encourager', 'mercy',
      'intercessor', 'evangelist', 'missionary', 'leader', 'builder', 'servant',
    ]);
    expect(ORIENTATION_KEYS.length).toBe(12);
  });

  it('版本标识固定', () => {
    expect(SCORING_VERSION).toBe('provisional_v1');
    expect(ITEM_VERSION).toBe(1);
    expect(LANGUAGE_VERSION).toBe('zh-CN');
    expect(ASSESSMENT_VERSIONS).toEqual({
      standard: 'CP_STANDARD_V1.0',
      quick: 'CP_QUICK_V1.0',
    });
  });
});

// ────────────────────────────────────────────────────────────────
describe('CP · 确定性', () => {
  it('同样输入两次评分，结果逐字节一致', () => {
    const a = scoreAssessment('standard', allAnswers, FIXED_TIME);
    const b = scoreAssessment('standard', allAnswers, FIXED_TIME);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('作答顺序打乱不改变结果（按 itemId 匹配，非按数组下标）', () => {
    const straight = scoreAssessment('standard', allAnswers, FIXED_TIME);
    const shuffled = scoreAssessment('standard', [...allAnswers].reverse(), FIXED_TIME);
    expect(orientationVector(shuffled)).toEqual(orientationVector(straight));
  });
});

// ────────────────────────────────────────────────────────────────
describe('CP · 铁律边界：只有 C/D 能影响倾向', () => {
  const baseline = orientationVector(
    scoreAssessment('standard', orientationOnlyAnswers, FIXED_TIME),
  );

  it('加入信仰基础（A）作答，12 项倾向分数一字不变', () => {
    const withA = ITEM_BANK.filter(i => i.module === 'faith_foundation').map(item => answerFor(item));
    const p = scoreAssessment('standard', [...orientationOnlyAnswers, ...withA], FIXED_TIME);
    expect(orientationVector(p)).toEqual(baseline);
  });

  it('加入门徒生命 / 灵修实践（B）作答，12 项倾向分数一字不变', () => {
    const withB = ITEM_BANK.filter(i => i.module === 'discipleship').map(item => answerFor(item));
    const p = scoreAssessment('standard', [...orientationOnlyAnswers, ...withB], FIXED_TIME);
    expect(orientationVector(p)).toEqual(baseline);
  });

  it('加入事奉准备度 / 经验（E）作答，12 项倾向分数一字不变', () => {
    const withE = ITEM_BANK.filter(i => i.module === 'readiness').map(item => answerFor(item));
    const p = scoreAssessment('standard', [...orientationOnlyAnswers, ...withE], FIXED_TIME);
    expect(orientationVector(p)).toEqual(baseline);
  });

  it('A+B+E 全加上，倾向分数仍然一字不变', () => {
    const p = scoreAssessment('standard', allAnswers, FIXED_TIME);
    expect(orientationVector(p)).toEqual(baseline);
  });

  it('外部证据（课程完成 / 实践 / 导师反馈）不改变倾向分数', () => {
    // 课程进度不得污染倾向；实践证据与导师反馈各自独立。
    const evidence = [
      { type: 'course', orientation: 'teacher', strength: 'strong' },
      { type: 'practice', orientation: 'shepherd', strength: 'strong' },
      { type: 'mentor', orientation: 'leader', strength: 'strong' },
    ] as unknown as Parameters<typeof scoreAssessment>[3];
    const p = scoreAssessment('standard', allAnswers, FIXED_TIME, evidence);
    expect(orientationVector(p)).toEqual(baseline);
  });
});

// ────────────────────────────────────────────────────────────────
describe('CP · 分层呈现（永不合成总分）', () => {
  const full = scoreAssessment('standard', allAnswers, FIXED_TIME);

  it('档案中不存在任何「总分 / 综合分」字段', () => {
    const keys = Object.keys(full);
    for (const forbidden of ['totalScore', 'overallScore', 'compositeScore', 'spiritualScore']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('四层各自独立呈现，且倾向层始终存在', () => {
    expect(full.ministryOrientation).toBeTruthy();
    expect(Object.keys(full.ministryOrientation).sort()).toEqual([...ORIENTATION_KEYS].sort());
  });

  it('topOrientations 恰好 3 项，且按分数降序', () => {
    expect(full.topOrientations.length).toBe(3);
    const s = full.topOrientations.map(t => t.score);
    expect([...s].sort((a, b) => b - a)).toEqual(s);
  });

  it('倾向指数落在 0–100', () => {
    for (const k of ORIENTATION_KEYS) {
      const v = full.ministryOrientation[k].normalizedScore;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

// ────────────────────────────────────────────────────────────────
describe('CP · 精简版（quick）', () => {
  const quick = scoreAssessment('quick', quickAnswers, FIXED_TIME);

  it('标记为精简版，12 项倾向仍全部输出', () => {
    expect(quick.level).toBe('quick');
    expect(quick.assessmentVersion).toBe('CP_QUICK_V1.0');
    expect(Object.keys(quick.ministryOrientation).sort()).toEqual([...ORIENTATION_KEYS].sort());
  });

  it('精简版不产出信仰基础 / 门徒生命 / 准备度三层', () => {
    expect(quick.faithFoundation).toBeUndefined();
    expect(quick.discipleshipPractice).toBeUndefined();
    expect(quick.ministryReadiness).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────
describe('CP · GOLDEN FIXTURE（漂移哨兵）', () => {
  /**
   * 下面这组数值是 2026-09-07 从当前实现固化下来的。
   *
   * ⚠ 它变红**不代表算法坏了**，代表算法输出变了。
   *   正确处理：先解释这次变化是有意的还是意外的，
   *   确认是有意的正式口径调整后，再显式更新本 fixture 并记入 DECISION_LOG。
   *   **不得**为了让测试变绿而删断言或改算法。
   */
  it('固定作答 → 固定的 12 项倾向向量', () => {
    const p = scoreAssessment('standard', allAnswers, FIXED_TIME);
    expect(orientationVector(p)).toMatchSnapshot('orientation-vector-standard');
  });

  it('固定作答 → 固定的 Top 3', () => {
    const p = scoreAssessment('standard', allAnswers, FIXED_TIME);
    expect(p.topOrientations).toMatchSnapshot('top3-standard');
  });

  it('精简版固定作答 → 固定的 12 项倾向向量', () => {
    const p = scoreAssessment('quick', quickAnswers, FIXED_TIME);
    expect(orientationVector(p)).toMatchSnapshot('orientation-vector-quick');
  });
});
