import { describe, it, expect } from 'vitest';
import { resolveCarProfile, PERFORMANCE_TIER_ORDER } from '../performanceTier';
import { CAR_CLASSES, PERFORMANCE_TIERS } from '../constants';

describe('performanceTier.ts', () => {
  describe('resolveCarProfile', () => {
    it('should throw on unknown car class', () => {
      expect(() =>
        resolveCarProfile('unknown_class' as any, 'midfield', 90)
      ).toThrow('Unknown car class');
    });

    it('should throw on unknown performance tier', () => {
      expect(() =>
        resolveCarProfile('f1_2025', 'unknown_tier' as any, 90)
      ).toThrow('Unknown performance tier');
    });

    it('should resolve F1 2025 Top Tier at Monza (90s lap)', () => {
      const profile = resolveCarProfile('f1_2025', 'top_tier', 90);
      expect(profile.carClass).toBe('f1_2025');
      expect(profile.performanceTier).toBe('top_tier');
      // Top tier has 0% pace offset
      expect(profile.combinedPaceOffsetPct).toBe(0);
      // F1 2025 has no base pace offset
      expect(profile.combinedPaceOffsetSec).toBe(0);
    });

    it('should resolve F1 2025 Backmarker at Monza (90s lap)', () => {
      const profile = resolveCarProfile('f1_2025', 'backmarker', 90);
      expect(profile.carClass).toBe('f1_2025');
      expect(profile.performanceTier).toBe('backmarker');
      // Backmarker has 2% pace offset
      // F1 2025 has tierPaceRangeScale = 1.0
      expect(profile.combinedPaceOffsetPct).toBe(0.02);
      // Should be 0 (F1 class offset) + 90 * 0.02 = 1.8
      expect(profile.combinedPaceOffsetSec).toBeCloseTo(1.8, 2);
    });

    it('should resolve F2 with compressed tier range', () => {
      const f2Top = resolveCarProfile('f2', 'top_tier', 85); // F2 typical lap ~85s
      const f2Backmarker = resolveCarProfile('f2', 'backmarker', 85);
      // F2 has tierPaceRangeScale = 0.25 (compressed)
      // Backmarker base offset is 2%, scaled by 0.25 = 0.5%
      // Top tier is 0%
      expect(f2Backmarker.combinedPaceOffsetPct).toBeCloseTo(0.005, 3);
      expect(f2Top.combinedPaceOffsetPct).toBe(0);
      // F2 has +4.9s category offset
      expect(f2Top.combinedPaceOffsetSec).toBe(4.9);
      expect(f2Backmarker.combinedPaceOffsetSec).toBeCloseTo(4.9 + 85 * 0.005, 2);
    });

    it('should combine tyre wear multipliers multiplicatively', () => {
      const profile = resolveCarProfile('f1_2025', 'backmarker', 90);
      // F1 2025 class multiplier: 1.0
      // Backmarker tier multiplier: 1.12
      // Combined: 1.0 * 1.12 = 1.12
      expect(profile.combinedTyreWearMultiplier).toBeCloseTo(1.12, 2);
    });

    it('should combine tyre wear for F2 backmarker', () => {
      const profile = resolveCarProfile('f2', 'backmarker', 85);
      // F2 class multiplier: 1.07
      // Backmarker tier multiplier: 1.12
      // Combined: 1.07 * 1.12 = 1.1984
      expect(profile.combinedTyreWearMultiplier).toBeCloseTo(1.1984, 3);
    });

    it('should handle all performance tiers', () => {
      const tiers: Array<keyof typeof PERFORMANCE_TIERS> = [
        'backmarker',
        'midfield',
        'contender',
        'top_tier',
      ];
      tiers.forEach((tier) => {
        const profile = resolveCarProfile('f1_2025', tier, 90);
        expect(profile.performanceTier).toBe(tier);
        expect(typeof profile.combinedPaceOffsetPct).toBe('number');
        expect(typeof profile.combinedTyreWearMultiplier).toBe('number');
      });
    });

    it('should handle all car classes', () => {
      const classes: Array<keyof typeof CAR_CLASSES> = [
        'f1_2025',
        'f1_2026_season_pack',
        'f2',
        'apxgp',
        'f1_world',
      ];
      classes.forEach((carClass) => {
        const profile = resolveCarProfile(carClass, 'midfield', 90);
        expect(profile.carClass).toBe(carClass);
        expect(typeof profile.combinedTyreWearMultiplier).toBe('number');
      });
    });

    it('should return safety car value multiplier from tier', () => {
      const profile = resolveCarProfile('f1_2025', 'backmarker', 90);
      // Backmarker safetyCarValueMultiplier is 1.3
      expect(profile.safetyCarValueMultiplier).toBe(1.3);
    });

    it('should include assumption flags', () => {
      const profile = resolveCarProfile('f1_2025', 'backmarker', 90);
      expect(profile.assumptionFlags).toContain('car_class_pace_offset_placeholder');
      expect(profile.assumptionFlags).toContain('performance_tier_pace_offset_placeholder');
      expect(profile.assumptionFlags).toContain('performance_tier_wear_multiplier_placeholder');
    });

    it('should flag when tier is defaulted', () => {
      const profile = resolveCarProfile('f1_world', undefined, 90);
      expect(profile.assumptionFlags).toContain('performance_tier_defaulted');
      // Should default to midfield
      expect(profile.performanceTier).toBe('midfield');
    });

    it('should not flag when tier is explicitly provided', () => {
      const profile = resolveCarProfile('f1_world', 'top_tier', 90);
      expect(profile.assumptionFlags).not.toContain('performance_tier_defaulted');
    });

    it('should use midfield as default for unspecified tiers in other classes', () => {
      const profile = resolveCarProfile('f1_2025', undefined, 90);
      // F1 2025 doesn't have a special default, so should use midfield
      expect(profile.performanceTier).toBe('midfield');
    });

    it('should round combinedPaceOffsetPct to 3 decimals', () => {
      const profile = resolveCarProfile('f1_2025', 'backmarker', 90.123456);
      // Backmarker = 0.02, F1 2025 scale = 1.0
      expect(profile.combinedPaceOffsetPct).toBe(0.02);
    });

    it('should round combinedPaceOffsetSec to 3 decimals', () => {
      const profile = resolveCarProfile('f1_2025', 'backmarker', 90.123456);
      // 0 (class offset) + 90.123456 * 0.02 = 1.80246912
      // Should be rounded to 1.802
      expect(profile.combinedPaceOffsetSec).toBeCloseTo(1.802, 3);
    });

    it('should show increasing pace offset from backmarker to top tier', () => {
      const profiles = [
        resolveCarProfile('f1_2025', 'backmarker', 90),
        resolveCarProfile('f1_2025', 'midfield', 90),
        resolveCarProfile('f1_2025', 'contender', 90),
        resolveCarProfile('f1_2025', 'top_tier', 90),
      ];
      // combinedPaceOffsetSec should DECREASE from backmarker to top tier
      // (lower offset = faster pace)
      for (let i = 0; i < profiles.length - 1; i++) {
        expect(profiles[i].combinedPaceOffsetSec).toBeGreaterThan(
          profiles[i + 1].combinedPaceOffsetSec
        );
      }
    });

    it('should show decreasing tyre wear from backmarker to top tier', () => {
      const profiles = [
        resolveCarProfile('f1_2025', 'backmarker', 90),
        resolveCarProfile('f1_2025', 'midfield', 90),
        resolveCarProfile('f1_2025', 'contender', 90),
        resolveCarProfile('f1_2025', 'top_tier', 90),
      ];
      // Tyre wear multiplier should DECREASE (top tier has less wear)
      for (let i = 0; i < profiles.length - 1; i++) {
        expect(profiles[i].combinedTyreWearMultiplier).toBeGreaterThan(
          profiles[i + 1].combinedTyreWearMultiplier
        );
      }
    });

    it('should handle 2026 season pack with slower base pace', () => {
      const profile = resolveCarProfile('f1_2026_season_pack', 'top_tier', 92); // 2026 is slower
      // F1 2026 has +2.75s category offset
      expect(profile.combinedPaceOffsetSec).toBeCloseTo(2.75, 2);
    });

    it('should apply APXGP pace correctly', () => {
      const profile = resolveCarProfile('apxgp', 'midfield', 90);
      // APXGP has no class offset, midfield is 1.1%
      expect(profile.combinedPaceOffsetSec).toBeCloseTo(90 * 0.011, 2);
    });
  });

  describe('PERFORMANCE_TIER_ORDER', () => {
    it('should be in slider order (weakest to strongest)', () => {
      expect(PERFORMANCE_TIER_ORDER).toEqual([
        'backmarker',
        'midfield',
        'contender',
        'top_tier',
      ]);
    });

    it('should contain all performance tiers', () => {
      const allTiers = Object.keys(PERFORMANCE_TIERS) as Array<keyof typeof PERFORMANCE_TIERS>;
      allTiers.forEach((tier) => {
        expect(PERFORMANCE_TIER_ORDER).toContain(tier);
      });
    });
  });
});
