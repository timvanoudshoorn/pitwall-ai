import { describe, it, expect } from 'vitest';
import { plausibleStopCounts, plausibleStopCountNumbers } from '../stopCountPlausibility';

describe('stopCountPlausibility.ts', () => {
  describe('plausibleStopCounts', () => {
    it('should allow 1/2/3-stop at full (100%) race distance on a 60-lap baseline', () => {
      const nums = plausibleStopCountNumbers(60, {});
      expect(nums).toEqual([1, 2, 3]);
    });

    it('should restrict a 25%-distance race (15 of 60 laps) to 1-stop only', () => {
      const nums = plausibleStopCountNumbers(15, {});
      expect(nums).toEqual([1]);
    });

    it('should restrict a 35%-distance race (21 of 60 laps) to 1-stop only', () => {
      const nums = plausibleStopCountNumbers(21, {});
      expect(nums).toEqual([1]);
    });

    it('should allow 1-stop and 2-stop at 75% distance (45 of 60 laps)', () => {
      const nums = plausibleStopCountNumbers(45, {});
      expect(nums).toEqual([1, 2]);
    });

    // Regression coverage (2026-07-12 coordinator-requested hardening pass): scanning every
    // race-length percentage boundary found totalLaps as low as 1-9 laps (reachable via a
    // short track combined with a low race-length percentage, or any caller passing a small
    // totalLaps directly) returned an EMPTY plausible set for every stop count -- a race,
    // however short, still needs at least one recommendable strategy. See SIMLOG.md #15.
    describe('extremely short race fallback (2026-07-12)', () => {
      it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
        'should never return an empty plausible set at totalLaps=%i',
        (totalLaps) => {
          const nums = plausibleStopCountNumbers(totalLaps, {});
          expect(nums.length).toBeGreaterThan(0);
        },
      );

      it('should mark the forced fallback with a distinct, honest reason rather than pretending it is a comfortable choice', () => {
        const results = plausibleStopCounts(3, {});
        const oneStop = results.find((r) => r.stopCount === 1)!;
        expect(oneStop.plausible).toBe(true);
        expect(oneStop.reason).toBe('forced_minimum_fallback_extremely_short_race');
      });

      it('should NOT apply the forced-fallback reason once a real distance clears the floor normally', () => {
        const results = plausibleStopCounts(60, {});
        const oneStop = results.find((r) => r.stopCount === 1)!;
        expect(oneStop.plausible).toBe(true);
        expect(oneStop.reason).toBeUndefined();
      });
    });

    it('should widen plausibility on a high-wear car/track combination (emergent from estimateTyreLife adjustment)', () => {
      // A harder-wearing combination (Backmarker tyre-wear multiplier + max track abrasiveness)
      // pushes the cliff lap down, so relatively MORE stops should clear the economic floor at
      // the same total lap count than a gentle/low-wear combination would.
      const gentle = plausibleStopCountNumbers(45, { performanceTier: 'top_tier', trackAbrasivenessRating: 1 });
      const harsh = plausibleStopCountNumbers(45, { performanceTier: 'backmarker', trackAbrasivenessRating: 5 });
      expect(harsh.length).toBeGreaterThanOrEqual(gentle.length);
    });
  });
});
