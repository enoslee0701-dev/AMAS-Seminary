import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChristianProfileView, { ResultPage } from '../../components/ChristianProfileView';
import { buildStages, ITEM_BANK } from '../../services/christianProfile/items';
import { scoreAssessment, type Answer } from '../../services/christianProfile/scoring';

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
    const withCourse = scoreAssessment('standard', a, 'T', [{
      id: 'e1', type: 'course_completion', orientations: ['teacher'],
      summary: '完成《研经标记法》', at: 'T', source: 'system',
    }]);
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
