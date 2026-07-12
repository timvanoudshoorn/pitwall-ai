import { describe, it, expect } from 'vitest';
import {
  compareStrategies,
  evaluateSingleStrategy,
  perLapStrategyTrace,
  type RaceSimInput,
  type StrategyPlan,
} from '../strategyCompare';

describe('strategyCompare.ts', () => {
  const baseInput: RaceSimInput = {
    trackId: 'monza',
    trackName: 'Monza',
    totalLaps: 53,
    carClass: 'f1_2025',
    performanceTier: 'midfield',
    weather: { condition: 'dry', rainProbabilityPct: 0 },
    safetyCarProbabilityPct: 0.35,
    pitLossSec: 20,
    baseLapTimeSec: 90,
    strategies: [
      {
        id: 'one-stop',
        stints: [
          { compound: 'soft', plannedLaps: 30 },
          { compound: 'hard', plannedLaps: 23 },
        ],
      },
    ],
  };

  describe('compareStrategies', () => {
    it('should handle single strategy', () => {
      // With a single strategy, it's both best and recommended
      const result = compareStrategies(baseInput);
      expect(result.strategies).toHaveLength(1);
      expect(result.recommendedStrategyId).toBe(result.strategies[0].id);
      expect(result.strategies[0].deltaToBestSeconds).toBe(0);
    });

    it('should return a StrategyComparison with correct structure', () => {
      const result = compareStrategies(baseInput);
      expect(result.raceContext).toBeDefined();
      expect(result.strategies).toBeDefined();
      expect(result.recommendedStrategyId).toBeDefined();
      expect(result.marginAnalysis).toBeDefined();
      expect(result.assumptionsUsed).toBeDefined();
    });

    it('should populate race context correctly', () => {
      const result = compareStrategies(baseInput);
      expect(result.raceContext.trackId).toBe('monza');
      expect(result.raceContext.trackName).toBe('Monza');
      expect(result.raceContext.totalLaps).toBe(53);
      expect(result.raceContext.carClass).toBe('f1_2025');
      expect(result.raceContext.performanceTier).toBe('midfield');
    });

    it('should rank strategies by predicted time (best first)', () => {
      const result = compareStrategies({
        ...baseInput,
        strategies: [
          {
            id: 'strategy-a',
            stints: [
              { compound: 'soft', plannedLaps: 30 },
              { compound: 'hard', plannedLaps: 23 },
            ],
          },
          {
            id: 'strategy-b',
            stints: [
              { compound: 'soft', plannedLaps: 35 },
              { compound: 'hard', plannedLaps: 18 },
            ],
          },
        ],
      });
      // First should have lower time than second
      expect(result.strategies[0].predictedTotalRaceTimeSeconds).toBeLessThanOrEqual(
        result.strategies[1].predictedTotalRaceTimeSeconds
      );
      // They should be ordered
      expect(result.strategies[0].deltaToBestSeconds).toBe(0);
    });

    it('should set recommended strategy to best', () => {
      const result = compareStrategies(baseInput);
      expect(result.recommendedStrategyId).toBe(result.strategies[0].id);
    });

    it('should compute deltaToBestSeconds correctly', () => {
      const result = compareStrategies({
        ...baseInput,
        strategies: [
          {
            id: 'strategy-a',
            stints: [
              { compound: 'soft', plannedLaps: 30 },
              { compound: 'hard', plannedLaps: 23 },
            ],
          },
          {
            id: 'strategy-b',
            stints: [
              { compound: 'medium', plannedLaps: 35 },
              { compound: 'hard', plannedLaps: 18 },
            ],
          },
        ],
      });
      // Best strategy should have 0 delta
      expect(result.strategies[0].deltaToBestSeconds).toBe(0);
      // Second should have positive delta
      expect(result.strategies[1].deltaToBestSeconds).toBeGreaterThan(0);
    });

    it('should flag base lap time as placeholder if not supplied', () => {
      const result = compareStrategies({
        ...baseInput,
        baseLapTimeSec: undefined,
      });
      expect(result.assumptionsUsed).toContain('base_lap_time_generic_placeholder');
    });

    it('should not flag base lap time if supplied and confirmed', () => {
      const result = compareStrategies({
        ...baseInput,
        baseLapTimeSec: 90,
        baseLapTimeSourceConfidence: 'confirmed',
      });
      expect(result.assumptionsUsed).not.toContain('base_lap_time_source_confidence_confirmed');
    });

    it('should flag base lap time source confidence if not confirmed', () => {
      const result = compareStrategies({
        ...baseInput,
        baseLapTimeSourceConfidence: 'reasonable_estimate',
      });
      expect(result.assumptionsUsed).toContain('base_lap_time_source_confidence_reasonable_estimate');
    });

    it('should apply personal pace offset if supplied', () => {
      const baseResult = compareStrategies(baseInput);
      const personalPaceResult = compareStrategies({
        ...baseInput,
        personalPaceOffsetSec: 0.5, // Slower by 0.5s per lap
      });
      // Personal pace result should be slower (higher time)
      expect(personalPaceResult.strategies[0].predictedTotalRaceTimeSeconds).toBeGreaterThan(
        baseResult.strategies[0].predictedTotalRaceTimeSeconds
      );
      // Should flag telemetry applied
      expect(personalPaceResult.assumptionsUsed).toContain('personal_pace_telemetry_applied');
    });

    it('should flag personal pace confidence if not high', () => {
      const result = compareStrategies({
        ...baseInput,
        personalPaceOffsetSec: 0.5,
        personalPaceConfidence: 'low',
      });
      expect(result.assumptionsUsed).toContain('personal_pace_confidence_low');
    });

    it('should handle track abrasiveness rating', () => {
      const baselineResult = compareStrategies(baseInput);
      const abraisveResult = compareStrategies({
        ...baseInput,
        trackAbrasivenessRating: 5, // Punishing track
      });
      // Higher abrasiveness should result in worse times (more wear)
      expect(abraisveResult.strategies[0].predictedTotalRaceTimeSeconds).toBeGreaterThan(
        baselineResult.strategies[0].predictedTotalRaceTimeSeconds
      );
    });

    it('should compute margin analysis', () => {
      const result = compareStrategies({
        ...baseInput,
        strategies: [
          {
            id: 'strategy-a',
            stints: [
              { compound: 'soft', plannedLaps: 30 },
              { compound: 'hard', plannedLaps: 23 },
            ],
          },
          {
            id: 'strategy-b',
            stints: [
              { compound: 'medium', plannedLaps: 35 },
              { compound: 'hard', plannedLaps: 18 },
            ],
          },
        ],
      });
      expect(result.marginAnalysis.closestPairIds).toContain('strategy-a');
      expect(result.marginAnalysis.closestPairIds).toContain('strategy-b');
      expect(result.marginAnalysis.deltaSeconds).toBeGreaterThan(0);
    });

    it('should flag stint lap mismatches', () => {
      const result = compareStrategies({
        ...baseInput,
        totalLaps: 53,
        strategies: [
          {
            id: 'wrong-sum',
            stints: [
              { compound: 'soft', plannedLaps: 30 },
              { compound: 'hard', plannedLaps: 20 }, // Only 50, should be 53
            ],
          },
        ],
      });
      expect(result.assumptionsUsed).toContain('strategy_wrong-sum_stint_laps_do_not_sum_to_race_distance');
    });

    it('should handle multiple stops', () => {
      const result = compareStrategies({
        ...baseInput,
        strategies: [
          {
            id: 'three-stop',
            stints: [
              { compound: 'soft', plannedLaps: 20 },
              { compound: 'soft', plannedLaps: 15 },
              { compound: 'hard', plannedLaps: 10 },
              { compound: 'hard', plannedLaps: 8 },
            ],
          },
        ],
      });
      expect(result.strategies[0].numStops).toBe(3);
      expect(result.strategies[0].stints).toHaveLength(4);
    });

    // Regression coverage for a 2026-07-12 coordinator-requested edge-case hardening pass
    // (found via an ad hoc stress script across all class x tier x track x race-length
    // combinations, not by inspection) -- see SIMLOG.md #15.
    describe('edge-case hardening (2026-07-12)', () => {
      it('should throw a clear, descriptive error on an empty strategies array, not a native array crash', () => {
        expect(() => compareStrategies({ ...baseInput, strategies: [] })).toThrow(
          'compareStrategies() requires at least one strategy candidate',
        );
      });

      it('evaluateSingleStrategy should never produce a non-positive predicted laptime, however extreme personalPaceOffsetSec is', () => {
        const { strategies: _ignored, ...contextOnly } = baseInput;
        void _ignored;
        const single = evaluateSingleStrategy(baseInput.strategies[0], {
          ...contextOnly,
          personalPaceOffsetSec: -200, // absurd direct override -- should never happen via telemetry.ts's own clamp, but a caller could pass this directly
        });
        expect(single.predictedTotalRaceTimeSeconds).toBeGreaterThan(0);
        const avgLap = single.predictedTotalRaceTimeSeconds / baseInput.totalLaps;
        // MIN_PHYSICAL_LAPTIME_FRACTION floor is 40% of baseLapTimeSec (90s here) = 36s/lap
        expect(avgLap).toBeGreaterThanOrEqual(36);
        expect(single.assumptionFlags).toContain('non_physical_laptime_clamped');
      });

      it('should NOT clamp/flag a normal-range personalPaceOffsetSec', () => {
        const { strategies: _ignored, ...contextOnly } = baseInput;
        void _ignored;
        const single = evaluateSingleStrategy(baseInput.strategies[0], {
          ...contextOnly,
          personalPaceOffsetSec: -3, // a genuinely fast but plausible driver
        });
        expect(single.assumptionFlags).not.toContain('non_physical_laptime_clamped');
      });
    });
  });

  describe('perLapStrategyTrace', () => {
    const plan: StrategyPlan = {
      id: 'trace-test',
      stints: [
        { compound: 'hard', plannedLaps: 10 },
        { compound: 'hard', plannedLaps: 10 },
      ],
    };

    it('should return cumulative times starting at zero', () => {
      const result = perLapStrategyTrace(plan, {
        totalLaps: 20,
        baseLapTimeSec: 90,
        perLapOffsetSec: 0,
        pitLossSec: 20,
        degOptions: { carClass: 'f1_2025', performanceTier: 'midfield' },
        fuelOptions: {},
      });
      expect(result.cumulativeTimeSec[0]).toBe(0);
    });

    it('should have cumulativeTimeSec.length = totalLaps + 1', () => {
      const result = perLapStrategyTrace(plan, {
        totalLaps: 20,
        baseLapTimeSec: 90,
        perLapOffsetSec: 0,
        pitLossSec: 20,
        degOptions: { carClass: 'f1_2025', performanceTier: 'midfield' },
        fuelOptions: {},
      });
      expect(result.cumulativeTimeSec).toHaveLength(21); // 0..20
    });

    it('should show increasing cumulative time', () => {
      const result = perLapStrategyTrace(plan, {
        totalLaps: 20,
        baseLapTimeSec: 90,
        perLapOffsetSec: 0,
        pitLossSec: 20,
        degOptions: { carClass: 'f1_2025', performanceTier: 'midfield' },
        fuelOptions: {},
      });
      for (let i = 1; i < result.cumulativeTimeSec.length; i++) {
        expect(result.cumulativeTimeSec[i]).toBeGreaterThan(result.cumulativeTimeSec[i - 1]);
      }
    });

    it('should include pit stop after each stint except last', () => {
      const result = perLapStrategyTrace(plan, {
        totalLaps: 20,
        baseLapTimeSec: 90,
        perLapOffsetSec: 0,
        pitLossSec: 20,
        degOptions: { carClass: 'f1_2025', performanceTier: 'midfield' },
        fuelOptions: {},
      });
      expect(result.pitStops).toHaveLength(1); // One pit stop between two stints
      expect(result.pitStops[0].lap).toBe(10);
      expect(result.pitStops[0].pitLossSeconds).toBe(20);
    });

    it('should show pit loss jump in cumulative time', () => {
      const result = perLapStrategyTrace(plan, {
        totalLaps: 20,
        baseLapTimeSec: 90,
        perLapOffsetSec: 0,
        pitLossSec: 20,
        degOptions: { carClass: 'f1_2025', performanceTier: 'midfield' },
        fuelOptions: {},
      });
      // The cumulative time at lap 10 should include the pit loss
      const lap10Time = result.cumulativeTimeSec[10];
      const lap9Time = result.cumulativeTimeSec[9];
      const delta = lap10Time - lap9Time;
      // Delta should be ~90 (lap time) + pit loss adjustment
      expect(delta).toBeGreaterThan(20); // At least the pit loss
    });

    it('should compute stint metadata correctly', () => {
      const result = perLapStrategyTrace(plan, {
        totalLaps: 20,
        baseLapTimeSec: 90,
        perLapOffsetSec: 0,
        pitLossSec: 20,
        degOptions: { carClass: 'f1_2025', performanceTier: 'midfield' },
        fuelOptions: {},
      });
      expect(result.stints).toHaveLength(2);
      expect(result.stints[0].startLap).toBe(1);
      expect(result.stints[0].endLap).toBe(10);
      expect(result.stints[1].startLap).toBe(11);
      expect(result.stints[1].endLap).toBe(20);
    });

    it('should apply per-lap offset consistently', () => {
      const offset = 1.0; // 1 second per lap
      const result = perLapStrategyTrace(plan, {
        totalLaps: 20,
        baseLapTimeSec: 90,
        perLapOffsetSec: offset,
        pitLossSec: 0, // No pit loss for clarity
        degOptions: { carClass: 'f1_2025', performanceTier: 'midfield' },
        fuelOptions: {},
      });
      // Each lap should include the offset in its contribution
      // So roughly 20 laps * 1.0 = 20 seconds added to total time
      const totalWithoutOffset = 90 * 20; // Baseline
      const totalWithOffset = result.cumulativeTimeSec[20];
      // With 20-lap offset, should be roughly 90*20 + 1*20 = 1820
      expect(totalWithOffset).toBeGreaterThan(totalWithoutOffset);
    });

    it('should accumulate pit losses correctly', () => {
      const multiStopPlan: StrategyPlan = {
        id: 'three-stop-test',
        stints: [
          { compound: 'soft', plannedLaps: 5 },
          { compound: 'soft', plannedLaps: 5 },
          { compound: 'hard', plannedLaps: 5 },
          { compound: 'hard', plannedLaps: 5 },
        ],
      };
      const result = perLapStrategyTrace(multiStopPlan, {
        totalLaps: 20,
        baseLapTimeSec: 90,
        perLapOffsetSec: 0,
        pitLossSec: 20,
        degOptions: { carClass: 'f1_2025', performanceTier: 'midfield' },
        fuelOptions: {},
      });
      // Should have 3 pit stops (between 4 stints)
      expect(result.pitStops).toHaveLength(3);
    });

    it('should compute plannedLapsSum correctly', () => {
      const result = perLapStrategyTrace(plan, {
        totalLaps: 20,
        baseLapTimeSec: 90,
        perLapOffsetSec: 0,
        pitLossSec: 20,
        degOptions: { carClass: 'f1_2025', performanceTier: 'midfield' },
        fuelOptions: {},
      });
      expect(result.plannedLapsSum).toBe(20);
    });
  });
});
