import { describe, it, expect } from 'vitest';
import {
  tyreLapTimeDelta,
  tyreStintCurve,
  estimateTyreLife,
  trackAbrasivenessMultiplier,
} from '../degradation';
import { TYRE_COMPOUNDS } from '../constants';

describe('degradation.ts', () => {
  describe('tyreLapTimeDelta', () => {
    it('should throw on invalid lap numbers', () => {
      expect(() => tyreLapTimeDelta('soft', 0)).toThrow('lapsOnTyre must be >= 1');
      expect(() => tyreLapTimeDelta('soft', -1)).toThrow('lapsOnTyre must be >= 1');
    });

    it('should throw on unknown tyre compound', () => {
      expect(() => tyreLapTimeDelta('unknown' as any, 1)).toThrow('Unknown tyre compound');
    });

    it('should return warmup phase on lap 1 for soft compound', () => {
      const result = tyreLapTimeDelta('soft', 1);
      expect(result.phase).toBe('warmup');
      expect(result.lapsOnTyre).toBe(1);
      // Soft warmup penalty on lap 1: -0.9 (offset) + ~0.6 (full warmup penalty) = ~-0.3
      // The actual calculation uses warmupFraction = (1 - 0/1) = 1, so penalty = 1.0 * 0.6 = 0.6
      // So: -0.9 + 0.6 = -0.3
      expect(result.lapTimeDeltaSec).toBeCloseTo(-0.3, 2);
    });

    it('should return warmup phase on lap 1 for hard compound', () => {
      const result = tyreLapTimeDelta('hard', 1);
      expect(result.phase).toBe('warmup');
      // Hard has 3 warmup laps, so lap 1 warmupFraction = 1 - (1-1)/3 = 1.0
      // penalty = 1.0 * 0.6 = 0.6
      // paceOffsetVsHard = 0, so: 0 + 0.6 = 0.6
      expect(result.lapTimeDeltaSec).toBeCloseTo(0.6, 2);
    });

    it('should exit warmup phase before cliff on soft', () => {
      // Soft has warmupLaps=1, cliffLap=14
      // Lap 2 should be in linear phase
      const lap2 = tyreLapTimeDelta('soft', 2);
      expect(lap2.phase).toBe('linear');
      // Soft on lap 2: -0.9 (offset) + 0.085 * (2-1) * 1.0 = -0.9 + 0.085 = -0.815
      expect(lap2.lapTimeDeltaSec).toBeCloseTo(-0.815, 2);
    });

    it('should handle cliff phase correctly', () => {
      // Soft cliffLap = 14, so lap 15 is first cliff lap
      const cliff = tyreLapTimeDelta('soft', 15);
      expect(cliff.phase).toBe('cliff');
      // Linear portion: 0.085 * (14-1) = 1.105
      // Cliff portion: 0.35 * (15-14) = 0.35
      // Total wear: 1.105 + 0.35 = 1.455
      // Delta: -0.9 + 1.455 = 0.555
      expect(cliff.lapTimeDeltaSec).toBeCloseTo(0.555, 2);
    });

    it('should apply performance tier wear multiplier', () => {
      const baselineLap20 = tyreLapTimeDelta('soft', 20);
      const backmarkerLap20 = tyreLapTimeDelta('soft', 20, { performanceTier: 'backmarker' });
      // Backmarker has tyreWearMultiplier = 1.12
      // So backmarker should have more wear (higher delta) at same lap
      expect(backmarkerLap20.lapTimeDeltaSec).toBeGreaterThan(baselineLap20.lapTimeDeltaSec);
    });

    it('should apply car class wear multiplier', () => {
      const baselineLap20 = tyreLapTimeDelta('soft', 20);
      const f2Lap20 = tyreLapTimeDelta('soft', 20, { carClass: 'f2' });
      // F2 has tyreWearMultiplier = 1.07
      // So F2 should have more wear at same lap
      expect(f2Lap20.lapTimeDeltaSec).toBeGreaterThan(baselineLap20.lapTimeDeltaSec);
    });

    it('should apply track abrasiveness multiplier', () => {
      const neutral = tyreLapTimeDelta('soft', 20, { trackAbrasivenessRating: 3 });
      const abrasive = tyreLapTimeDelta('soft', 20, { trackAbrasivenessRating: 5 });
      // Rating 5 (punishing) should have higher wear multiplier than rating 3 (neutral)
      expect(abrasive.lapTimeDeltaSec).toBeGreaterThan(neutral.lapTimeDeltaSec);
    });

    it('should combine multipliers multiplicatively', () => {
      const combined = tyreLapTimeDelta('soft', 20, {
        performanceTier: 'backmarker',
        carClass: 'f2',
        trackAbrasivenessRating: 5,
      });
      // All three should apply multiplicatively
      // baseline (no multipliers): lap 20 linear + cliff start
      // with backmarker (1.12) * f2 (1.07) * track-5 (1.1) ≈ 1.353
      // combined should be significantly higher
      const baseline = tyreLapTimeDelta('soft', 20);
      expect(combined.lapTimeDeltaSec).toBeGreaterThan(baseline.lapTimeDeltaSec);
    });
  });

  describe('trackAbrasivenessMultiplier', () => {
    it('should map rating 3 to neutral 1.0', () => {
      expect(trackAbrasivenessMultiplier(3)).toBeCloseTo(1.0, 3);
    });

    it('should map rating 1 to -20% wear (0.8)', () => {
      // Rating 1: 1 + (1 - 3) * 0.1 = 1 - 0.2 = 0.8
      expect(trackAbrasivenessMultiplier(1)).toBeCloseTo(0.8, 3);
    });

    it('should map rating 5 to +20% wear (1.2)', () => {
      // Rating 5: 1 + (5 - 3) * 0.1 = 1 + 0.2 = 1.2
      // But due to rounding, should be close
      expect(trackAbrasivenessMultiplier(5)).toBeCloseTo(1.2, 2);
    });

    it('should be monotonically increasing', () => {
      const m1 = trackAbrasivenessMultiplier(1);
      const m2 = trackAbrasivenessMultiplier(2);
      const m3 = trackAbrasivenessMultiplier(3);
      const m4 = trackAbrasivenessMultiplier(4);
      const m5 = trackAbrasivenessMultiplier(5);
      expect(m1).toBeLessThan(m2);
      expect(m2).toBeLessThan(m3);
      expect(m3).toBeLessThan(m4);
      expect(m4).toBeLessThan(m5);
    });
  });

  describe('tyreStintCurve', () => {
    it('should return an array of points for each lap', () => {
      const curve = tyreStintCurve('soft', 20);
      expect(curve).toHaveLength(20);
      expect(curve[0].lap).toBe(1);
      expect(curve[19].lap).toBe(20);
    });

    it('should show increasing degradation over stint', () => {
      const curve = tyreStintCurve('soft', 20);
      // Each lap should have more time loss than previous (degradation increases)
      for (let i = 2; i < curve.length; i++) {
        expect(curve[i].lapTimeDeltaSec).toBeGreaterThanOrEqual(curve[i - 1].lapTimeDeltaSec);
      }
    });

    it('should mark phase transitions correctly', () => {
      const curve = tyreStintCurve('soft', 20);
      // Soft: warmupLaps=1, cliffLap=14
      expect(curve[0].phase).toBe('warmup');
      expect(curve[1].phase).toBe('linear');
      expect(curve[13].phase).toBe('linear'); // lap 14 is last linear
      expect(curve[14].phase).toBe('cliff'); // lap 15 is first cliff
    });

    it('should show cliff acceleration', () => {
      const curve = tyreStintCurve('soft', 20);
      const preCliffDelta = curve[13].lapTimeDeltaSec - curve[12].lapTimeDeltaSec;
      const postCliffDelta = curve[15].lapTimeDeltaSec - curve[14].lapTimeDeltaSec;
      // Post-cliff wear rate should be significantly higher
      expect(postCliffDelta).toBeGreaterThan(preCliffDelta);
    });
  });

  describe('estimateTyreLife', () => {
    it('should estimate nominal life for soft compound', () => {
      const estimate = estimateTyreLife('soft');
      // Soft nominalLife = 12, no multipliers, so estimate should be 12
      expect(estimate.nominalLifeLaps).toBe(12);
    });

    it('should estimate cliff lap for soft compound', () => {
      const estimate = estimateTyreLife('soft');
      // Soft cliffLap = 14, no multipliers
      expect(estimate.cliffLapEstimate).toBe(14);
    });

    it('should reduce nominal life with wear multiplier', () => {
      const baseline = estimateTyreLife('soft');
      const backmarker = estimateTyreLife('soft', { performanceTier: 'backmarker' });
      // Backmarker multiplier = 1.12, so nominal life should be reduced
      // 12 / 1.12 ≈ 10.7 → rounds to 11
      expect(backmarker.nominalLifeLaps).toBeLessThan(baseline.nominalLifeLaps);
    });

    it('should handle multiple multipliers', () => {
      const baseline = estimateTyreLife('soft');
      const combined = estimateTyreLife('soft', {
        performanceTier: 'backmarker',
        carClass: 'f2',
        trackAbrasivenessRating: 5,
      });
      // Combined multiplier ≈ 1.12 * 1.07 * 1.2 ≈ 1.436
      // So nominal life should be significantly reduced
      expect(combined.nominalLifeLaps).toBeLessThan(baseline.nominalLifeLaps);
    });

    it('should include assumption flags', () => {
      const estimate = estimateTyreLife('soft', { performanceTier: 'backmarker' });
      expect(estimate.assumptionFlags).toContain('tyre_compound_params_placeholder');
      expect(estimate.assumptionFlags).toContain('performance_tier_wear_multiplier_placeholder');
    });
  });

  describe('all tyre compounds', () => {
    it('should handle all defined compounds without throwing', () => {
      const compounds = Object.keys(TYRE_COMPOUNDS) as Array<keyof typeof TYRE_COMPOUNDS>;
      compounds.forEach((compound) => {
        expect(() => tyreLapTimeDelta(compound, 1)).not.toThrow();
        expect(() => tyreLapTimeDelta(compound, 20)).not.toThrow();
        expect(() => tyreStintCurve(compound, 30)).not.toThrow();
        expect(() => estimateTyreLife(compound)).not.toThrow();
      });
    });

    it('should show hard compound lasting longer than soft', () => {
      const softLife = estimateTyreLife('soft');
      const hardLife = estimateTyreLife('hard');
      expect(hardLife.nominalLifeLaps).toBeGreaterThan(softLife.nominalLifeLaps);
    });
  });
});
