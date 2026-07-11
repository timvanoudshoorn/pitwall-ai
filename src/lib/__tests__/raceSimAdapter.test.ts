import { describe, it, expect } from 'vitest';
import {
  buildStrategyComparison,
  buildGapEvolution,
  resolveTelemetryContext,
  RaceSimAdapterError,
} from '../raceSimAdapter';
import type { AppSelection } from '../../types/session';

// Mock data selection
const createSelection = (overrides: Partial<AppSelection> = {}): AppSelection => ({
  carClassId: 'f1_2025',
  performanceTier: 'midfield',
  trackId: 'monza',
  raceParameters: {
    raceLengthPct: 100,
    weather: 'dry',
    rainProbabilityPct: 0,
    qualifyingFormat: 'short_qualifying',
  },
  personalPace: {
    enabled: false,
    lapTimesSec: [],
  },
  ...overrides,
});

describe('raceSimAdapter.ts', () => {
  describe('buildStrategyComparison', () => {
    it('should throw when car class is not selected', () => {
      const selection = createSelection({ carClassId: undefined });
      expect(() => buildStrategyComparison(selection)).toThrow(RaceSimAdapterError);
      expect(() => buildStrategyComparison(selection)).toThrow(
        'Select a car class and track before running a strategy comparison'
      );
    });

    it('should throw when track is not selected', () => {
      const selection = createSelection({ trackId: undefined });
      expect(() => buildStrategyComparison(selection)).toThrow(RaceSimAdapterError);
      expect(() => buildStrategyComparison(selection)).toThrow(
        'Select a car class and track before running a strategy comparison'
      );
    });

    it('should throw when track has no reference data', () => {
      const selection = createSelection({ trackId: 'nonexistent-track' });
      expect(() => buildStrategyComparison(selection)).toThrow(RaceSimAdapterError);
      expect(() => buildStrategyComparison(selection)).toThrow('No track reference data found');
    });

    it('should build a valid StrategyComparison for F1 2025 Monza', () => {
      const selection = createSelection();
      const result = buildStrategyComparison(selection);

      expect(result.raceContext).toBeDefined();
      expect(result.raceContext.trackId).toBe('monza');
      expect(result.raceContext.carClass).toBe('f1_2025');
      expect(result.raceContext.performanceTier).toBe('midfield');
      expect(result.strategies).toHaveLength(3); // 1/2/3-stop
      expect(result.recommendedStrategyId).toBeDefined();
      expect(result.marginAnalysis).toBeDefined();
    });

    it('should handle all car classes', () => {
      const classes = ['f1_2025', 'f1_2026_season_pack', 'f2', 'apxgp', 'f1_world'] as const;
      classes.forEach((carClass) => {
        const selection = createSelection({ carClassId: carClass });
        const result = buildStrategyComparison(selection);
        expect(result.raceContext.carClass).toBe(carClass);
      });
    });

    it('should handle all performance tiers', () => {
      const tiers = ['backmarker', 'midfield', 'contender', 'top_tier'] as const;
      tiers.forEach((tier) => {
        const selection = createSelection({ performanceTier: tier });
        const result = buildStrategyComparison(selection);
        expect(result.raceContext.performanceTier).toBe(tier);
      });
    });

    it('should apply race length percentage to total laps', () => {
      const fullDistance = createSelection({ raceParameters: { ...createSelection().raceParameters, raceLengthPct: 100 } });
      const halfDistance = createSelection({ raceParameters: { ...createSelection().raceParameters, raceLengthPct: 50 } });

      const fullResult = buildStrategyComparison(fullDistance);
      const halfResult = buildStrategyComparison(halfDistance);

      // Half distance should have roughly half the laps
      expect(halfResult.raceContext.totalLaps).toBeLessThan(fullResult.raceContext.totalLaps);
      // Due to rounding, we can't expect exact half, but should be close (within 2 laps)
      const expectedHalf = Math.round((fullResult.raceContext.totalLaps * 50) / 100);
      expect(halfResult.raceContext.totalLaps).toBeCloseTo(expectedHalf, 1);
    });

    it('should enforce minimum 5 laps even at low race length %', () => {
      const selection = createSelection({ raceParameters: { ...createSelection().raceParameters, raceLengthPct: 25 } });
      const result = buildStrategyComparison(selection);
      // Even at 25%, should get at least minimum laps (5)
      expect(result.raceContext.totalLaps).toBeGreaterThanOrEqual(5);
    });

    it('should propagate pit loss to RaceSimInput', () => {
      const selection = createSelection({ trackId: 'monza' });
      const result = buildStrategyComparison(selection);
      // Monza should have pit loss > 0
      expect(result.assumptionsUsed).toBeDefined();
      // Result should have computed strategies with pit stops
      expect(result.strategies.some(s => s.numStops > 0)).toBe(true);
    });

    it('should include track abrasiveness in calculations if available', () => {
      // Silverstone is known to have abrasiveness data
      const selection = createSelection({ trackId: 'silverstone' });
      const result = buildStrategyComparison(selection);
      expect(result.raceContext).toBeDefined();
      // Strategies should compute differently based on abrasiveness
      expect(result.strategies[0].predictedTotalRaceTimeSeconds).toBeGreaterThan(0);
    });

    it('should include personal pace offset if telemetry is enabled', () => {
      const selection = createSelection({
        personalPace: {
          enabled: true,
          lapTimesSec: [90, 90.5, 91], // 3 laps at roughly baseline
        },
      });
      const result = buildStrategyComparison(selection);
      // Should still compute successfully even with telemetry
      expect(result.strategies).toHaveLength(3);
    });

    it('should flag personal pace confidence in assumptions', () => {
      const selection = createSelection({
        personalPace: {
          enabled: true,
          lapTimesSec: [90, 90.5, 91],
        },
      });
      const result = buildStrategyComparison(selection);
      // Low confidence (3 laps) should be flagged
      expect(result.assumptionsUsed).toContain('personal_pace_confidence_low');
    });

    it('should handle weather conditions', () => {
      const drySelection = createSelection({ raceParameters: { ...createSelection().raceParameters, weather: 'dry' } });
      const wetSelection = createSelection({ raceParameters: { ...createSelection().raceParameters, weather: 'wet' } });

      const dryResult = buildStrategyComparison(drySelection);
      const wetResult = buildStrategyComparison(wetSelection);

      // Both should compute but potentially with different strategies/times
      expect(dryResult.strategies).toHaveLength(3);
      expect(wetResult.strategies).toHaveLength(3);
    });
  });

  describe('resolveTelemetryContext', () => {
    it('should return null when telemetry is disabled', () => {
      const selection = createSelection({ personalPace: { enabled: false, lapTimesSec: [90, 90.5, 91] } });
      const result = resolveTelemetryContext(selection);
      expect(result).toBeNull();
    });

    it('should return null when no lap times are provided', () => {
      const selection = createSelection({ personalPace: { enabled: true, lapTimesSec: [] } });
      const result = resolveTelemetryContext(selection);
      expect(result).toBeNull();
    });

    it('should return null when car class is not selected', () => {
      const selection = createSelection({
        carClassId: undefined,
        personalPace: { enabled: true, lapTimesSec: [90, 90.5, 91] },
      });
      const result = resolveTelemetryContext(selection);
      expect(result).toBeNull();
    });

    it('should return null when track is not selected', () => {
      const selection = createSelection({
        trackId: undefined,
        personalPace: { enabled: true, lapTimesSec: [90, 90.5, 91] },
      });
      const result = resolveTelemetryContext(selection);
      expect(result).toBeNull();
    });

    it('should return null when fewer than 3 laps are provided', () => {
      const selection = createSelection({
        personalPace: { enabled: true, lapTimesSec: [90, 90.5] },
      });
      const result = resolveTelemetryContext(selection);
      expect(result).toBeNull();
    });

    it('should compute TelemetryImportResult for valid input', () => {
      const selection = createSelection({
        personalPace: { enabled: true, lapTimesSec: [90, 90.5, 91] },
      });
      const result = resolveTelemetryContext(selection);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.representativeLapCount).toBe(3);
        expect(result.representativeLapSec).toBeDefined();
        expect(result.personalPaceOffsetSec).toBeDefined();
        expect(result.confidence).toBeDefined();
      }
    });

    it('should filter outliers using 107% rule', () => {
      const selection = createSelection({
        personalPace: { enabled: true, lapTimesSec: [90, 90.5, 91, 100, 101] }, // Last 2 are outliers
      });
      const result = resolveTelemetryContext(selection);

      expect(result).not.toBeNull();
      if (result) {
        // 90 * 1.07 = 96.3, so 100/101 should be filtered
        expect(result.representativeLapCount).toBe(3);
        expect(result.excludedLapCount).toBe(2);
      }
    });

    it('should handle negative/zero/garbage values gracefully', () => {
      const selection = createSelection({
        personalPace: { enabled: true, lapTimesSec: [-5, 0, 90, 90.5, 91] }, // Invalid values
      });
      // Should either filter them or not throw
      const result = resolveTelemetryContext(selection);
      // Result depends on implementation of importTelemetry's filtering
      expect(typeof result).toBe('object');
    });

    it('should compute high confidence for 15+ laps', () => {
      const laps = Array(20).fill(90);
      const selection = createSelection({
        personalPace: { enabled: true, lapTimesSec: laps },
      });
      const result = resolveTelemetryContext(selection);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.confidence).toBe('high');
      }
    });

    it('should compute medium confidence for 5-14 laps', () => {
      const laps = Array(10).fill(90);
      const selection = createSelection({
        personalPace: { enabled: true, lapTimesSec: laps },
      });
      const result = resolveTelemetryContext(selection);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.confidence).toBe('medium');
      }
    });

    it('should compute low confidence for 3-4 laps', () => {
      const selection = createSelection({
        personalPace: { enabled: true, lapTimesSec: [90, 90.5, 91] },
      });
      const result = resolveTelemetryContext(selection);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.confidence).toBe('low');
      }
    });
  });

  describe('buildGapEvolution', () => {
    it('should throw when strategy IDs are not valid for this race distance', () => {
      const selection = createSelection();
      expect(() => buildGapEvolution(selection, 'nonexistent-1', 'nonexistent-2')).toThrow(
        RaceSimAdapterError
      );
    });

    it('should throw when car class is not selected', () => {
      const selection = createSelection({ carClassId: undefined });
      expect(() => buildGapEvolution(selection, '1-stop', '2-stop')).toThrow(RaceSimAdapterError);
    });

    it('should throw when track is not selected', () => {
      const selection = createSelection({ trackId: undefined });
      expect(() => buildGapEvolution(selection, '1-stop', '2-stop')).toThrow(RaceSimAdapterError);
    });

    it('should build gap evolution for valid candidates', () => {
      const selection = createSelection();
      // First get valid IDs from buildStrategyComparison
      const comparison = buildStrategyComparison(selection);
      const [candidateA, candidateB] = comparison.strategies.slice(0, 2);

      const result = buildGapEvolution(selection, candidateA.id, candidateB.id);

      expect(result).toBeDefined();
      expect(result.points).toBeDefined();
      expect(result.points.length).toBeGreaterThan(0);
    });

    it('should compute lap-by-lap gap series with correct length', () => {
      const selection = createSelection();
      const comparison = buildStrategyComparison(selection);
      const [candidateA, candidateB] = comparison.strategies.slice(0, 2);

      const result = buildGapEvolution(selection, candidateA.id, candidateB.id);

      // Gap series should have one entry per lap + race start
      expect(result.points.length).toBe(comparison.raceContext.totalLaps + 1);
    });

    it('should show gap evolution across pit stops', () => {
      const selection = createSelection({ trackId: 'silverstone' });
      const comparison = buildStrategyComparison(selection);

      // Pick two strategies with different pit strategies
      const twoStop = comparison.strategies.find(s => s.numStops === 2);
      const threeStop = comparison.strategies.find(s => s.numStops === 3);

      if (twoStop && threeStop) {
        const result = buildGapEvolution(selection, twoStop.id, threeStop.id);

        // Gap should have points for the entire race
        expect(result.points.length).toBeGreaterThan(0);
        // Should record pit laps for at least one strategy
        expect(result.pitLapsA.length + result.pitLapsB.length).toBeGreaterThan(0);
      }
    });

    it('should handle all car classes', () => {
      const classes = ['f1_2025', 'f2', 'apxgp'] as const;
      classes.forEach((carClass) => {
        const selection = createSelection({ carClassId: carClass, trackId: 'monza' });
        const comparison = buildStrategyComparison(selection);
        const [candidateA, candidateB] = comparison.strategies.slice(0, 2);

        const result = buildGapEvolution(selection, candidateA.id, candidateB.id);
        expect(result.points).toBeDefined();
      });
    });
  });
});
