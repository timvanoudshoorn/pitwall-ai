import { describe, it, expect } from 'vitest';
import { undercutOvercutDelta } from '../undercutOvercut';

describe('undercutOvercut.ts', () => {
  describe('undercutOvercutDelta', () => {
    it('should throw if lateStopLap <= earlyStopLap', () => {
      expect(() =>
        undercutOvercutDelta({
          earlyStopLap: 10,
          lateStopLap: 10,
          compoundAfterEarly: 'soft',
          compoundBeforeLate: 'soft',
          lapsOnTyreAtWindowStart: 5,
          pitLossSecEarly: 20,
        })
      ).toThrow('lateStopLap must be greater than earlyStopLap');

      expect(() =>
        undercutOvercutDelta({
          earlyStopLap: 10,
          lateStopLap: 9,
          compoundAfterEarly: 'soft',
          compoundBeforeLate: 'soft',
          lapsOnTyreAtWindowStart: 5,
          pitLossSecEarly: 20,
        })
      ).toThrow('lateStopLap must be greater than earlyStopLap');
    });

    it('should calculate window laps correctly', () => {
      const result = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 15,
        compoundAfterEarly: 'soft',
        compoundBeforeLate: 'soft',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
      });
      expect(result.windowLaps).toBe(5);
    });

    it('should show undercut advantage when fresh tyre is much better', () => {
      // Early car: pits and gets fresh soft
      // Late car: aging soft tyre
      // Soft tire has cliff at lap 14, so by lap 15+ it gets much worse
      const result = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 20,
        compoundAfterEarly: 'soft',
        compoundBeforeLate: 'soft',
        lapsOnTyreAtWindowStart: 10, // Late car is on lap 10 tire at start, so lap 15-20 on tyre
        pitLossSecEarly: 20,
      });
      // Early car gets fresh soft (laps 1-10)
      // Late car continues on old soft (laps 11-20, so lapsOnTyre 21-30 which crosses cliff)
      // Undercut should win because of cliff
      expect(result.verdict).toBe('undercut_wins');
      expect(result.netDeltaSec).toBeGreaterThan(0);
    });

    it('should handle 1-lap window correctly', () => {
      // Short window (1 lap) where pit loss dominates
      const result = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 11,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
      });
      // Only 1 lap window
      expect(result.windowLaps).toBe(1);
      // Result is valid (positive or negative, but defined)
      expect(typeof result.netDeltaSec).toBe('number');
    });

    it('should apply pit loss correctly', () => {
      const result1 = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
      });

      const result2 = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 25, // Higher pit loss
      });

      // Higher pit loss should worsen the early car's position (larger negative delta)
      // or reduce undercut advantage
      expect(result2.earlyCarWindowTimeSec).toBeGreaterThan(result1.earlyCarWindowTimeSec);
    });

    it('should respect asymmetric pit losses', () => {
      const result = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
        pitLossSecLate: 19, // Different pit loss (e.g., different track section)
      });
      // Late car should benefit from lower pit loss
      expect(result.lateCarWindowTimeSec).toBeLessThan(
        // Rough estimate if both had same pit loss
        result.earlyCarWindowTimeSec + 20 - 19
      );
    });

    it('should apply out-lap penalty', () => {
      const resultDefault = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
      });

      const resultHighPenalty = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
        outLapPenaltySec: 1.0, // Higher out-lap penalty
      });

      // Higher out-lap penalty should worsen early car's time
      expect(resultHighPenalty.earlyCarWindowTimeSec).toBeGreaterThan(
        resultDefault.earlyCarWindowTimeSec
      );
    });

    it('should apply in-lap penalty to late car', () => {
      const resultDefault = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
      });

      const resultHighPenalty = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
        inLapPenaltySec: 1.0, // Higher in-lap penalty
      });

      // Higher in-lap penalty should worsen late car's time
      expect(resultHighPenalty.lateCarWindowTimeSec).toBeGreaterThan(
        resultDefault.lateCarWindowTimeSec
      );
    });

    it('should mark even when delta is within threshold', () => {
      // Create a scenario with very small delta (hard to achieve exactly)
      // Use symmetric conditions
      const result = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 11,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 50, // Old tyre, minimal pace loss on next lap
        pitLossSecEarly: 20,
      });
      // With just 1 lap and old tyre, should be close
      if (Math.abs(result.netDeltaSec) < 0.15) {
        expect(result.verdict).toBe('even');
      }
    });

    it('should include placeholder flags', () => {
      const result = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
      });
      expect(result.assumptionFlags).toContain('undercut_out_lap_penalty_placeholder');
      expect(result.assumptionFlags).toContain('undercut_in_lap_penalty_placeholder');
    });

    it('should not flag penalties when explicitly provided', () => {
      const result = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
        outLapPenaltySec: 0.3,
        inLapPenaltySec: 0.2,
      });
      expect(result.assumptionFlags).not.toContain('undercut_out_lap_penalty_placeholder');
      expect(result.assumptionFlags).not.toContain('undercut_in_lap_penalty_placeholder');
    });

    it('should round results to 3 decimal places', () => {
      const result = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'hard',
        compoundBeforeLate: 'hard',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20.12345,
      });
      // All numeric results should be rounded to 3 decimals
      expect(result.earlyCarWindowTimeSec.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(3);
      expect(result.lateCarWindowTimeSec.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(3);
      expect(result.netDeltaSec.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(3);
    });

    it('should respect degradation options', () => {
      const resultDefault = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 15,
        compoundAfterEarly: 'soft',
        compoundBeforeLate: 'soft',
        lapsOnTyreAtWindowStart: 10,
        pitLossSecEarly: 20,
      });

      const resultWithTier = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 15,
        compoundAfterEarly: 'soft',
        compoundBeforeLate: 'soft',
        lapsOnTyreAtWindowStart: 10,
        pitLossSecEarly: 20,
        degradationOptions: { performanceTier: 'backmarker' },
      });

      // Both cars should degrade faster with backmarker tier
      // The effect should be visible in the window times
      expect(resultWithTier.earlyCarWindowTimeSec).toBeGreaterThan(resultDefault.earlyCarWindowTimeSec);
      expect(resultWithTier.lateCarWindowTimeSec).toBeGreaterThan(resultDefault.lateCarWindowTimeSec);
    });

    it('should handle compound changes between early and late pit', () => {
      // Early car pits onto medium, late car is on soft
      const result = undercutOvercutDelta({
        earlyStopLap: 10,
        lateStopLap: 12,
        compoundAfterEarly: 'medium', // Different compound
        compoundBeforeLate: 'soft',
        lapsOnTyreAtWindowStart: 5,
        pitLossSecEarly: 20,
      });
      // Result should still be valid
      expect(result.windowLaps).toBe(2);
      expect(typeof result.netDeltaSec).toBe('number');
    });
  });
});
