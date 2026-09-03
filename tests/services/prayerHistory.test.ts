import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatDuration, formatSessionDate } from '../../services/prayerHistoryService';

const repoRoot = resolve(__dirname, '../..');

/**
 * Phase 5 的护栏。守的是「不做看起来很真实的假数据」这条规矩，
 * 以及未知与零必须区分开。
 */

describe('formatDuration：未知不是零', () => {
  it('null 返回 null，由调用方写「未记录」——绝不渲染成 0 分钟', () => {
    expect(formatDuration(null)).toBeNull();
    // 负数与 NaN 同样是「算不出来」，不是「0」
    expect(formatDuration(-1)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });

  it('极短时长说「不到 1 分钟」，不说 0 分钟', () => {
    expect(formatDuration(0)).toBe('不到 1 分钟');
    expect(formatDuration(20_000)).toBe('不到 1 分钟');
  });

  it('分钟与小时', () => {
    expect(formatDuration(60_000)).toBe('1 分钟');
    expect(formatDuration(38 * 60_000)).toBe('38 分钟');
    expect(formatDuration(60 * 60_000)).toBe('1 小时');
    expect(formatDuration(72 * 60_000)).toBe('1 小时 12 分钟');
  });
});

describe('formatSessionDate', () => {
  const at = (y: number, mo: number, d: number, h: number, mi: number) =>
    new Date(y, mo - 1, d, h, mi).getTime();

  it('同年不带年份，跨年带上', () => {
    const ref = at(2026, 9, 3, 12, 0);
    expect(formatSessionDate(at(2026, 9, 3, 20, 15), ref)).toBe('9月3日 晚上 8:15');
    expect(formatSessionDate(at(2025, 12, 31, 20, 15), ref)).toBe('2025年12月31日 晚上 8:15');
  });

  it('时段用中文习惯划分', () => {
    const ref = at(2026, 9, 3, 12, 0);
    expect(formatSessionDate(at(2026, 9, 3, 3, 5), ref)).toContain('凌晨 3:05');
    expect(formatSessionDate(at(2026, 9, 3, 9, 0), ref)).toContain('早上 9:00');
    expect(formatSessionDate(at(2026, 9, 3, 12, 30), ref)).toContain('中午 12:30');
    expect(formatSessionDate(at(2026, 9, 3, 15, 0), ref)).toContain('下午 3:00');
  });

  it('null 返回 null', () => {
    expect(formatSessionDate(null)).toBeNull();
  });
});

describe('Phase 5 · 不展示缺乏数据支撑的指标', () => {
  const ui = [
    'components/VoiceRoom/PrayerSessionSummary.tsx',
    'components/VoiceRoom/PrayerSessionHistory.tsx',
  ];

  /** 去掉注释——注释里写着「这里刻意不做参与人数」是说明，不是违规。 */
  const codeOf = (rel: string) =>
    readFileSync(resolve(repoRoot, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('界面上不出现参与人数 / 人次这类没有历史数据的说法', () => {
    for (const rel of ui) {
      const code = codeOf(rel);
      for (const bad of ['人参与', '人次', '参与人数', '出席', '排行']) {
        expect(code, `${rel} 不得出现「${bad}」`).not.toContain(bad);
      }
    }
  });

  it('前端不用 presence 当前人数去顶替历史参与人数', () => {
    for (const rel of ui) {
      const code = codeOf(rel);
      expect(code).not.toContain('presence');
      expect(code).not.toContain('onlineCount');
    }
  });

  it('服务层不定义任何参与人数字段', () => {
    const svc = readFileSync(resolve(repoRoot, 'services/prayerHistoryService.ts'), 'utf8');
    for (const bad of ['participantCount', 'attendeeCount', 'presenceCount', 'totalPrayers']) {
      expect(svc).not.toContain(bad);
    }
  });
});

describe('Phase 5 · 计划过 != 进行过', () => {
  it('纪要页把未进行的项目单列，不混进已祷告的列表', () => {
    const src = readFileSync(resolve(repoRoot, 'components/VoiceRoom/PrayerSessionSummary.tsx'), 'utf8');
    // journey 与 notVisited 必须分别渲染
    expect(src).toContain('data.journey.map');
    expect(src).toContain('data.notVisited.map');
    expect(src).toContain('本次未进行');
  });

  it('历史列表用实际进行过的项数，不用计划项数', () => {
    const src = readFileSync(resolve(repoRoot, 'components/VoiceRoom/PrayerSessionHistory.tsx'), 'utf8');
    expect(src).toContain('visitedItemCount');
    expect(src).not.toContain('items.length');
  });
});
