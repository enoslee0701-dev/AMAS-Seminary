import { describe, it, expect } from 'vitest';
import { ACADEMIC_PROGRAMS, TIER_META, type ProgramTier } from '../../components/College/programData';

const TIERS: ProgramTier[] = ['证书', '学士', '硕士', '博士'];

describe('programData catalog', () => {
  it('has 8 programs, each tagged with a valid tier', () => {
    expect(ACADEMIC_PROGRAMS).toHaveLength(8);
    for (const p of ACADEMIC_PROGRAMS) {
      expect(TIERS).toContain(p.tier);
      expect(p.title.length).toBeGreaterThan(0);
      expect(Array.isArray(p.badges)).toBe(true);
      // each program carries either a credits breakdown or a details list
      expect(Boolean(p.credits) || Boolean(p.details)).toBe(true);
    }
  });

  it('program ids are unique', () => {
    const ids = ACADEMIC_PROGRAMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('TIER_META covers exactly the four tiers, each with ≥1 program', () => {
    expect(TIER_META.map((t) => t.tier)).toEqual(TIERS);
    for (const t of TIER_META) {
      const count = ACADEMIC_PROGRAMS.filter((p) => p.tier === t.tier).length;
      expect(count).toBeGreaterThan(0);
      expect(t.label).toContain('课程');
      expect(t.duration.length).toBeGreaterThan(0);
    }
  });

  it('every program belongs to a tier that exists in TIER_META', () => {
    const metaTiers = new Set(TIER_META.map((t) => t.tier));
    for (const p of ACADEMIC_PROGRAMS) {
      expect(metaTiers.has(p.tier)).toBe(true);
    }
  });

  it("master's tier card duration agrees with its programs (3-year)", () => {
    // Resolves the former home-card "1-2 年" vs program-badge "3年制" conflict.
    const master = TIER_META.find((t) => t.tier === '硕士')!;
    expect(master.duration).toContain('3');
    for (const p of ACADEMIC_PROGRAMS.filter((x) => x.tier === '硕士')) {
      expect(p.badges.some((b) => b.includes('3年'))).toBe(true);
    }
  });
});
