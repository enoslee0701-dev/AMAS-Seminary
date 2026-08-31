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
      '当前装备重点', '下一阶段成长实验', '我的成长历史',
      '你的信仰基础', '门徒生命', '事奉准备度',
    ]) expect(html).toContain(t);
    // 禁止项：不得出现「你就是」式的固定身份表述
    expect(html).not.toContain('你就是');
  });
});
