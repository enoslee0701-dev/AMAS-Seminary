import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChristianProfileView, { ResultPage } from '../../components/ChristianProfileView';
import { buildStages, ITEM_BANK } from '../../services/christianProfile/items';
import { scoreAssessment, type Answer } from '../../services/christianProfile/scoring';
import {
  computeConfidence, overallConfidence, buildSourceRows, isValidEvidence,
  type ChristianProfileEvidence, type EvidenceType, type EvidencePolarity, type EvidenceStrengthLevel,
} from '../../services/christianProfile/evidence';
import {
  experimentToEvidence, canTransition, canReview, normalizeOutcome,
  type ValidationExperiment, type ValidationOutcome, type SelfReflection,
} from '../../services/christianProfile/experiments';

/** 构造一条指向「教导者」的证据 */
const ev = (
  id: string, type: EvidenceType, polarity: EvidencePolarity,
  strength: EvidenceStrengthLevel = 'moderate',
  source: ChristianProfileEvidence['source'] = 'system',
): ChristianProfileEvidence => ({
  id, type, targetOrientations: ['teacher'], polarity, strength,
  summary: `${type}/${polarity}`, source, observedAt: 'T', createdAt: 'T',
});

const answersFor = (level: 'quick' | 'standard', pick = (i: number) => i % 4): Answer[] =>
  buildStages(level).flatMap(s => s.items).map((it, i) => ({
    itemId: it.id, optionIndex: Math.min(pick(i), it.options.length - 1), responseTimeMs: 3000, answeredAt: '2026-08-27T00:00:00Z',
  }));

describe('Christian Profile item bank', () => {
  it('standard = 84 items (12/12/36/12/12), quick = 30', () => {
    expect(ITEM_BANK.length).toBe(84);
    const count = (m: string) => ITEM_BANK.filter(i => i.module === m).length;
    expect([count('faith_foundation'), count('discipleship'), count('ministry_orientation'), count('scenario'), count('readiness')]).toEqual([12, 12, 36, 12, 12]);
    expect(buildStages('quick').flatMap(s => s.items).length).toBe(30);
    expect(buildStages('standard').flatMap(s => s.items).length).toBe(84);
    expect(new Set(ITEM_BANK.map(i => i.id)).size).toBe(84);
  });
});

describe('deterministic scoring', () => {
  it('quick profile has 12 orientation scores, Top 3, no faith/readiness', () => {
    const p = scoreAssessment('quick', answersFor('quick'));
    expect(Object.keys(p.ministryOrientation).length).toBe(12);
    expect(p.topOrientations.length).toBe(3);
    expect(p.faithFoundation).toBeUndefined();
    expect(p.ministryReadiness).toBeUndefined();
    expect(p.combinedLabel).toBeTruthy();
    // 倾向指数与证据可信度必须是两个独立字段
    for (const k of Object.keys(p.ministryOrientation)) {
      const d = p.ministryOrientation[k as keyof typeof p.ministryOrientation];
      expect(typeof d.normalizedScore).toBe('number');
      expect(['low', 'moderate', 'high', 'very_high']).toContain(d.confidence);
      expect(d.sources.length).toBeGreaterThan(0);
    }
    // 精简版没有外部证据 → 可信度最高只能到 moderate
    expect(['low', 'moderate']).toContain(p.confidence);
  });
  it('standard profile keeps faith foundation out of orientation scores', () => {
    const base = answersFor('standard', () => 2);
    const p1 = scoreAssessment('standard', base);
    // change only faith-foundation answers → orientation must not move
    const alt = base.map(a => a.itemId.startsWith('FF_') ? { ...a, optionIndex: 0 } : a);
    const p2 = scoreAssessment('standard', alt);
    expect(p2.ministryOrientation).toEqual(p1.ministryOrientation);
    expect(p2.faithFoundation!.overall).not.toBe(p1.faithFoundation!.overall);
    expect(p1.ministryReadiness).toBeDefined();
    expect(p1.discipleshipPractice).toBeDefined();
  });
  it('course completion does not change orientation index (V2 §16)', () => {
    const a = answersFor('standard');
    const base = scoreAssessment('standard', a, 'T');
    // 传入课程完成证据后，倾向指数必须完全不变，只影响可信度
    const withCourse = scoreAssessment('standard', a, 'T', [ev('e1', 'course_completion', 'support')]);
    for (const k of Object.keys(base.ministryOrientation)) {
      const key = k as keyof typeof base.ministryOrientation;
      expect(withCourse.ministryOrientation[key].normalizedScore)
        .toBe(base.ministryOrientation[key].normalizedScore);
    }
    expect(withCourse.ministryOrientation.teacher.confidence).not.toBe(base.ministryOrientation.teacher.confidence);
  });

  it('same answers → same profile (deterministic)', () => {
    const a = answersFor('standard');
    const x = scoreAssessment('standard', a, 'T'), y = scoreAssessment('standard', a, 'T');
    expect(x).toEqual(y);
  });
});

describe('evidence model V2.1', () => {
  const base = { itemsAnswered: 3, scenarioOffered: 2, qualityFlagCount: 0 };

  it('assessment alone can never exceed 中等, no matter the index', () => {
    expect(computeConfidence({ ...base, externalEvidence: [] }).level).toBe('moderate');
  });

  it('external evidence raises confidence; others-observed raises it further', () => {
    expect(computeConfidence({ ...base, externalEvidence: [ev('a', 'course_completion', 'support')] }).level).toBe('high');
    expect(computeConfidence({ ...base, externalEvidence: [ev('b', 'mentor_feedback', 'support', 'moderate', 'mentor')] }).level).toBe('very_high');
  });

  it('challenge evidence CORRECTS the judgement instead of only adding confidence', () => {
    // 反证权重 >= 支持权重 → 直接压到 low 并标记 contradicted
    const contradicted = computeConfidence({
      ...base,
      externalEvidence: [ev('c', 'ministry_practice', 'challenge', 'strong', 'mentor')],
    });
    expect(contradicted.level).toBe('low');
    expect(contradicted.conflict).toBe('contradicted');

    // 支持更多但存在反证 → mixed，且必须降一档，不允许停在 very_high
    const mixed = computeConfidence({
      ...base,
      externalEvidence: [
        ev('d', 'mentor_feedback', 'support', 'strong', 'mentor'),
        ev('e', 'ministry_practice', 'challenge', 'weak'),
      ],
    });
    expect(mixed.conflict).toBe('mixed');
    expect(mixed.level).toBe('high');
  });

  it('evidence without a target is discarded (no global evidence pool)', () => {
    const orphan = { ...ev('f', 'course_completion', 'support'), targetOrientations: [] };
    expect(isValidEvidence(orphan)).toBe(false);
    expect(computeConfidence({ ...base, externalEvidence: [orphan] }).level).toBe('moderate');
  });

  it('a verification intent is neutral and does not raise confidence', () => {
    expect(computeConfidence({ ...base, externalEvidence: [ev('g', 'verification_intent', 'neutral', 'weak', 'self')] }).level).toBe('moderate');
  });

  it('overall confidence uses the median of Top 3, not the minimum', () => {
    const r = (level: 'low' | 'moderate' | 'high' | 'very_high') => ({ level, conflict: 'none' as const, reason: '' });
    expect(overallConfidence([r('very_high'), r('high'), r('low')])).toBe('high');
    // 任一 Top 倾向被反证 → 整体再降一档
    expect(overallConfidence([r('high'), r('high'), { level: 'low' as const, conflict: 'contradicted' as const, reason: '' }])).toBe('moderate');
  });

  it('source rows distinguish 支持 / 中性 / 反证 / 暂无', () => {
    const rows = buildSourceRows({
      assessmentTags: ['乐于讲解圣经'], scenarioPicked: 0, scenarioOffered: 2,
      externalEvidence: [ev('h', 'ministry_practice', 'challenge')],
    });
    const by = (t: EvidenceType) => rows.find(r => r.type === t)!;
    expect(by('assessment').status).toBe('support');
    expect(by('scenario_task').status).toBe('neutral');
    expect(by('ministry_practice').status).toBe('challenge');
    expect(by('mentor_feedback').status).toBe('none');
  });

  it('conflicting evidence surfaces on the profile and lowers overall confidence', () => {
    const a = answersFor('standard');
    const clean = scoreAssessment('standard', a, 'T');
    const conflicted = scoreAssessment('standard', a, 'T', [ev('i', 'ministry_practice', 'challenge', 'strong', 'mentor')]);
    expect(clean.conflicts).toEqual([]);
    expect(conflicted.conflicts.map(c => c.key)).toContain('teacher');
    // 指数仍然不变——修正的是可信度，不是分数
    expect(conflicted.ministryOrientation.teacher.normalizedScore).toBe(clean.ministryOrientation.teacher.normalizedScore);
    expect(conflicted.ministryOrientation.teacher.confidence).toBe('low');
  });
});

describe('validation experiment loop (P2-A)', () => {
  const exp = (over: Partial<ValidationExperiment> = {}): ValidationExperiment => ({
    id: 'x1', targetOrientations: ['teacher'], title: '主日学助教',
    source: 'profile_recommendation', status: 'completed',
    completedAt: 'T2', createdAt: 'T1', updatedAt: 'T2', ...over,
  });
  const ref = (outcome: ValidationOutcome): SelfReflection =>
    ({ id: 'r1', experimentId: 'x1', outcome, whatHappened: '带了两次查经', createdAt: 'T3' });

  it('an intent is a workflow state, not evidence — it produces none until reflected', () => {
    expect(experimentToEvidence(exp({ status: 'not_started', completedAt: undefined }))).toEqual([]);
    expect(experimentToEvidence(exp({ status: 'active' }))).toEqual([]);
    expect(experimentToEvidence(exp(), undefined)).toEqual([]);          // 没有复盘 → 没有证据
    expect(experimentToEvidence(exp({ status: 'cancelled' }), ref('confirmed'))).toEqual([]);
  });

  it('未能验证 ≠ 反证 — inconclusive is NEUTRAL and must not lower confidence (P2-A.1)', () => {
    expect(experimentToEvidence(exp(), ref('confirmed'))[0].polarity).toBe('support');
    expect(experimentToEvidence(exp(), ref('partial'))[0].polarity).toBe('support');
    // 「这次没能判断」只是中性事实：记录尝试过，不下调任何判断
    const inc = experimentToEvidence(exp(), ref('inconclusive'));
    expect(inc[0].polarity).toBe('neutral');
    expect(inc[0].strength).toBe('weak');
    const base = { itemsAnswered: 3, scenarioOffered: 2, qualityFlagCount: 0 };
    const r = computeConfidence({ ...base, externalEvidence: inc });
    expect(r.conflict).toBe('none');
    expect(r.level).toBe('moderate');       // 未被下调
    // 只有「明显不合适」才是反证
    expect(experimentToEvidence(exp(), ref('disconfirmed'))[0].polarity).toBe('challenge');
  });

  it('one self-reported disconfirmation weakens but never overturns (P2-A.1)', () => {
    const once = experimentToEvidence(exp(), ref('disconfirmed'));
    const base = { itemsAnswered: 3, scenarioOffered: 2, qualityFlagCount: 0 };
    const r = computeConfidence({ ...base, externalEvidence: once });
    // 第一次尝试不顺多半是学习曲线，不足以推翻结论
    expect(r.conflict).toBe('mixed');
    expect(r.level).toBe('low');            // moderate 降一档，但不是 contradicted
    expect(r.reason).toContain('单独一次还不足以改变判断');

    const a = answersFor('standard');
    const after = scoreAssessment('standard', a, 'T', once);
    expect(after.ministryOrientation.teacher.conflict).toBe('mixed');
    expect(after.conflicts.map(c => c.key)).toContain('teacher');
  });

  it('repeated or mentor-observed disconfirmation DOES overturn (P2-A.1)', () => {
    const base = { itemsAnswered: 3, scenarioOffered: 2, qualityFlagCount: 0 };
    // 重复出现 → contradicted
    const twice = [
      ...experimentToEvidence(exp(), ref('disconfirmed')),
      ...experimentToEvidence(exp({ id: 'x2' }), { ...ref('disconfirmed'), id: 'r2', experimentId: 'x2' }),
    ];
    expect(computeConfidence({ ...base, externalEvidence: twice }).conflict).toBe('contradicted');
    // 他人观察 → 一条就够
    const observed = experimentToEvidence(exp(), ref('disconfirmed'),
      { id: 'o9', experimentId: 'x1', observerName: '陈牧师', observerRole: 'mentor', outcome: 'disconfirmed', comment: '这次明显吃力', verified: true, createdAt: 'T4' });
    const rObs = computeConfidence({ ...base, externalEvidence: observed });
    expect(rObs.conflict).toBe('contradicted');
    expect(rObs.level).toBe('low');

    // 指数在任何情况下都不变
    const a = answersFor('standard');
    const before = scoreAssessment('standard', a, 'T');
    const after = scoreAssessment('standard', a, 'T', observed);
    expect(after.ministryOrientation.teacher.normalizedScore).toBe(before.ministryOrientation.teacher.normalizedScore);
  });

  it('legacy not_confirmed records are read as inconclusive, never re-labelled as counter-evidence', () => {
    expect(normalizeOutcome('not_confirmed')).toBe('inconclusive');
    const legacy = experimentToEvidence(exp(), { ...ref('confirmed'), outcome: 'not_confirmed' as ValidationOutcome });
    expect(legacy[0].polarity).toBe('neutral');
  });

  it('a user-transcribed mentor comment is not treated as an outside observation', () => {
    const unverified = experimentToEvidence(exp(), ref('confirmed'),
      { id: 'o1', experimentId: 'x1', observerName: '陈牧师', observerRole: 'mentor', outcome: 'confirmed', comment: '讲解清楚', verified: false, createdAt: 'T4' });
    const verified = experimentToEvidence(exp(), ref('confirmed'),
      { id: 'o2', experimentId: 'x1', observerName: '陈牧师', observerRole: 'mentor', outcome: 'confirmed', comment: '讲解清楚', verified: true, createdAt: 'T4' });
    expect(unverified[1].source).toBe('self');      // 转述 → 不算他人观察
    expect(verified[1].source).toBe('mentor');
    const base = { itemsAnswered: 3, scenarioOffered: 2, qualityFlagCount: 0 };
    expect(computeConfidence({ ...base, externalEvidence: unverified }).level).toBe('high');
    expect(computeConfidence({ ...base, externalEvidence: verified }).level).toBe('very_high');
  });

  it('state machine rejects skipping practice or reviewing without a reflection', () => {
    expect(canTransition('not_started', 'active')).toBe(true);
    expect(canTransition('not_started', 'reviewed')).toBe(false);   // 不能没做就复核
    expect(canTransition('reviewed', 'active')).toBe(false);        // 终态不可回退
    expect(canReview(exp({ selfReflectionId: undefined }))).toBe(false);
    expect(canReview(exp({ selfReflectionId: 'r1' }))).toBe(true);
    expect(canReview(exp({ status: 'active', selfReflectionId: 'r1' }))).toBe(false);
  });

  it('experiment evidence is bound to the experiment targets only', () => {
    const e = experimentToEvidence(exp({ targetOrientations: ['teacher', 'equipper'] }), ref('confirmed'))[0];
    expect(e.targetOrientations).toEqual(['teacher', 'equipper']);
    expect(isValidEvidence(e)).toBe(true);
    expect(e.sourceId).toBe('x1');
  });
});

describe('ChristianProfileView renders', () => {
  it('intro (quick) renders without throwing', () => {
    const html = renderToStaticMarkup(<ChristianProfileView level="quick" courses={[]} onCourseClick={() => {}} onExit={() => {}} />);
    expect(html).toContain('事奉倾向画像 · 精简版');
  });
  it('result page renders all sections', () => {
    const p = scoreAssessment('standard', answersFor('standard'));
    const html = renderToStaticMarkup(<ResultPage p={p} courses={[]} onCourseClick={() => {}} onExit={() => {}} onRestart={() => {}} />);
    for (const t of [
      '你当前最明显的成长倾向', '三项主要事奉倾向', '倾向指数', '当前画像可信度',
      '系统为什么这样判断', '值得留意', '12 项事奉倾向', '推荐验证场景',
      '当前装备重点', '下一阶段成长实验', '我的成长历史', '我的验证实验',
      '你的信仰基础', '门徒生命', '事奉准备度',
    ]) expect(html).toContain(t);
    // 禁止项：不得出现「你就是」式的固定身份表述
    expect(html).not.toContain('你就是');
  });
});
