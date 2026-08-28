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
    for (const t of ['Top 3 Orientations', '12 项事奉倾向', '你的信仰基础', '门徒生命', '事奉准备度', '建议尝试的侍奉', '成长计划']) expect(html).toContain(t);
  });
});
