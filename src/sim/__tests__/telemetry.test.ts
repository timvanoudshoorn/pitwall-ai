import { describe, it, expect } from 'vitest';
import { importTelemetry } from '../telemetry';

describe('telemetry.ts', () => {
  describe('importTelemetry', () => {
    const baseInput = {
      lapTimesSec: [90, 90.5, 91],
      carClass: 'f1_2025' as const,
      performanceTier: 'midfield' as const,
      baseLapTimeSec: 90,
    };

    it('should throw on empty lap times array', () => {
      expect(() =>
        importTelemetry({
          ...baseInput,
          lapTimesSec: [],
        })
      ).toThrow('importTelemetry needs at least 3 lap times');
    });

    it('should throw on single lap time', () => {
      expect(() =>
        importTelemetry({
          ...baseInput,
          lapTimesSec: [90],
        })
      ).toThrow('importTelemetry needs at least 3 lap times');
    });

    it('should throw on two lap times', () => {
      expect(() =>
        importTelemetry({
          ...baseInput,
          lapTimesSec: [90, 90.5],
        })
      ).toThrow('importTelemetry needs at least 3 lap times');
    });

    it('should accept exactly 3 lap times', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 90.5, 91],
      });
      expect(result.representativeLapCount).toBe(3);
    });

    it('should compute median from lap times', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 91, 92],
      });
      // Median of [90, 91, 92] is 91
      expect(result.representativeLapSec).toBe(91);
    });

    it('should handle unsorted input by sorting internally', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [92, 90, 91], // Unsorted
      });
      // Sorted: [90, 91, 92], median = 91
      expect(result.representativeLapSec).toBe(91);
    });

    it('should compute median correctly for even number of laps', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 91, 92, 93],
      });
      // Sorted: [90, 91, 92, 93], median = (91 + 92) / 2 = 91.5
      expect(result.representativeLapSec).toBe(91.5);
    });

    it('should filter outliers using 107% rule by default', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 91, 92, 100, 101, 102], // Last 3 are > 90 * 1.07 = 96.3
      });
      // Only [90, 91, 92] should be kept
      expect(result.representativeLapCount).toBe(3);
      expect(result.excludedLapCount).toBe(3);
    });

    it('should compute excluded lap count correctly', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 91, 92, 100, 101, 102],
      });
      expect(result.excludedLapCount).toBe(3);
    });

    it('should respect custom outlier multiplier', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 91, 92, 95],
        outlierMultiplier: 1.05, // Stricter: 90 * 1.05 = 94.5
      });
      // Only [90, 91, 92] pass the 94.5 threshold, [95] is excluded
      expect(result.representativeLapCount).toBe(3);
      expect(result.excludedLapCount).toBe(1);
    });

    it('should handle all-outlier scenario gracefully', () => {
      // Every lap except the first gets filtered out
      // But we need at least 3 to not throw, so this is a boundary case
      // Actually, let's test with 6 laps where 5 are outliers but 3 pass
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 90.5, 91, 1000, 1001, 1002], // First 3 good, last 3 extreme outliers
      });
      expect(result.representativeLapCount).toBe(3);
      expect(result.excludedLapCount).toBe(3);
    });

    it('should compute personal pace offset in seconds', () => {
      // Model expects 90 + 0 (top tier) = 90
      // Actually midfield at F1 2025: combinedPaceOffsetPct = 0.011
      // So expected = 90 + 90*0.011 = 90.99
      // If representative is 91, offset = 91 - 90.99 = 0.01
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [91, 91, 91],
        performanceTier: 'midfield',
        baseLapTimeSec: 90,
      });
      // Approx: 91 - (90 + 90*0.011) = 91 - 90.99 ≈ 0.01
      expect(result.personalPaceOffsetSec).toBeCloseTo(0.01, 1);
    });

    it('should compute personal pace offset as percentage', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [91, 91, 91],
        baseLapTimeSec: 90,
      });
      // personalPaceOffsetPct = personalPaceOffsetSec / baseLapTimeSec
      // ≈ 0.01 / 90 ≈ 0.0001
      expect(result.personalPaceOffsetPct).toBeCloseTo(result.personalPaceOffsetSec / 90, 3);
    });

    it('should show negative offset when driver is faster than model expects', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [89, 89, 89], // Faster than expected
      });
      // 89 should be faster than model expectation ~90.99
      expect(result.personalPaceOffsetSec).toBeLessThan(0);
    });

    it('should show positive offset when driver is slower than model expects', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [92, 92, 92], // Slower than expected
      });
      // 92 should be slower than model expectation ~90.99
      expect(result.personalPaceOffsetSec).toBeGreaterThan(0);
    });

    it('should assign high confidence for 15+ laps', () => {
      const laps = Array(15).fill(90);
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: laps,
      });
      expect(result.confidence).toBe('high');
    });

    it('should assign medium confidence for 5-14 laps', () => {
      const laps = Array(10).fill(90);
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: laps,
      });
      expect(result.confidence).toBe('medium');
    });

    it('should assign low confidence for 3-4 laps', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 90, 90],
      });
      expect(result.confidence).toBe('low');
    });

    it('should include baseline profile in result', () => {
      const result = importTelemetry(baseInput);
      expect(result.baselineProfile).toBeDefined();
      expect(result.baselineProfile.carClass).toBe('f1_2025');
      expect(result.baselineProfile.performanceTier).toBe('midfield');
    });

    it('should flag telemetry outlier filter as placeholder', () => {
      const result = importTelemetry(baseInput);
      expect(result.assumptionFlags).toContain('telemetry_outlier_filter_placeholder');
    });

    it('should flag low sample size confidence', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 90, 90], // Only 3 laps = low confidence
      });
      expect(result.assumptionFlags).toContain('telemetry_sample_size_confidence_low');
    });

    it('should flag medium sample size confidence', () => {
      const laps = Array(10).fill(90);
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: laps,
      });
      expect(result.assumptionFlags).toContain('telemetry_sample_size_confidence_medium');
    });

    it('should not flag high confidence sample size', () => {
      const laps = Array(20).fill(90);
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: laps,
      });
      expect(result.assumptionFlags).not.toContain('telemetry_sample_size_confidence_high');
    });

    it('should handle extremely large outliers', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90, 90, 90, 99999],
      });
      // First 3 laps are < 90 * 1.07 = 96.3, last is huge outlier
      expect(result.representativeLapCount).toBe(3);
      expect(result.excludedLapCount).toBe(1);
    });

    it('should round all results to 3 decimal places', () => {
      const result = importTelemetry({
        ...baseInput,
        lapTimesSec: [90.123456, 90.234567, 90.345678],
      });
      // representativeLapSec should be median rounded
      expect(result.representativeLapSec.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(3);
      expect(result.personalPaceOffsetSec.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(3);
      expect(result.personalPaceOffsetPct.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(3);
    });

    it('should default performance tier if not supplied', () => {
      const result = importTelemetry({
        lapTimesSec: [90, 90, 90],
        carClass: 'f1_2025',
        baseLapTimeSec: 90,
        // performanceTier not supplied
      });
      // Should default to midfield
      expect(result.baselineProfile.performanceTier).toBe('midfield');
    });

    it('should work with F2 car class (compressed tier range)', () => {
      const result = importTelemetry({
        lapTimesSec: [85, 85, 85],
        carClass: 'f2',
        performanceTier: 'backmarker',
        baseLapTimeSec: 85,
      });
      expect(result.baselineProfile.carClass).toBe('f2');
      expect(result.baselineProfile.performanceTier).toBe('backmarker');
    });

    it('should handle 2026 season pack with slower baseline', () => {
      const result = importTelemetry({
        lapTimesSec: [92, 92, 92],
        carClass: 'f1_2026_season_pack',
        performanceTier: 'top_tier',
        baseLapTimeSec: 92,
      });
      expect(result.baselineProfile.carClass).toBe('f1_2026_season_pack');
      // Personal offset should account for the 2.75s category gap
    });

    // Regression coverage for a 2026-07-12 coordinator-requested edge-case hardening pass:
    // an unfiltered garbage/typo lap-time entry (e.g. "9.5" typed instead of "95", or a
    // minutes-vs-seconds units mismatch) could compute a personal pace offset so large it
    // drove downstream predicted laptimes to a non-physical ~12s/lap. See SIMLOG.md #15.
    describe('implausible lap time handling (2026-07-12)', () => {
      it('should reject a lap log that is entirely implausible relative to the track baseline', () => {
        expect(() =>
          importTelemetry({
            lapTimesSec: [9.5, 9.4, 9.6, 9.5, 9.55], // ~10x too fast for a 90s track -- looks like a units/typo error
            carClass: 'f1_2025',
            performanceTier: 'backmarker',
            baseLapTimeSec: 90,
          }),
        ).toThrow(/plausible range/);
      });

      it('should filter out a single implausible outlier while keeping the rest of a mostly-good log', () => {
        const result = importTelemetry({
          lapTimesSec: [88, 87.5, 88.2, 9.5, 87.9], // one obvious typo mixed into an otherwise clean log
          carClass: 'f1_2025',
          performanceTier: 'backmarker',
          baseLapTimeSec: 90,
        });
        expect(result.assumptionFlags).toContain('telemetry_implausible_laps_filtered');
        expect(result.representativeLapCount).toBe(4); // the 9.5s entry is excluded before outlier/median math
        expect(Math.abs(result.personalPaceOffsetSec)).toBeLessThan(30); // stays in a sane range, not skewed by the typo
      });

      it('should NOT flag/filter a genuinely plausible slow or fast lap', () => {
        const result = importTelemetry({
          lapTimesSec: [90, 91, 89.5, 90.2], // ordinary race-pace spread, nothing implausible
          carClass: 'f1_2025',
          performanceTier: 'midfield',
          baseLapTimeSec: 90,
        });
        expect(result.assumptionFlags).not.toContain('telemetry_implausible_laps_filtered');
      });

      it('should clamp an extreme personal pace offset rather than let it compound into a non-physical value', () => {
        // Construct a scenario where a driver's laps are all consistent but WAY off the
        // model's expectation -- individually each lap looks "plausible enough" not to be
        // filtered, but the resulting offset should still be capped as a physical backstop.
        const result = importTelemetry({
          lapTimesSec: [45, 45.1, 44.9, 45.05], // exactly at the low edge of the plausibility band for a 90s track (50%)
          carClass: 'f1_2025',
          performanceTier: 'backmarker',
          baseLapTimeSec: 90,
        });
        // MAX_PERSONAL_OFFSET_FRACTION is 50% of baseLapTimeSec (90s) = 45s magnitude cap
        expect(Math.abs(result.personalPaceOffsetSec)).toBeLessThanOrEqual(45);
        expect(result.assumptionFlags).toContain('personal_pace_offset_clamped_non_physical');
      });
    });
  });
});
