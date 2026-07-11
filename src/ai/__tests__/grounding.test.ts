import { describe, it, expect } from 'vitest';
import { checkGrounding, buildAllowedNumbers } from '../grounding';
import type { StrategyComparison, ReferenceFact } from '../types';

// Create a minimal valid StrategyComparison for testing
const createMockComparison = (): StrategyComparison => ({
  raceContext: {
    trackId: 'monza',
    trackName: 'Monza',
    totalLaps: 53,
    carClass: 'f1_2025',
    performanceTier: 'midfield',
    weather: { condition: 'dry', rainProbabilityPct: 0 },
    safetyCarProbabilityPct: 35,
  },
  strategies: [
    {
      id: 'one-stop',
      numStops: 1,
      stints: [
        {
          compound: 'soft',
          startLap: 1,
          endLap: 30,
          lapsOnTyre: 30,
          estimatedTyreLifeLaps: 12,
        },
        {
          compound: 'hard',
          startLap: 31,
          endLap: 53,
          lapsOnTyre: 23,
          estimatedTyreLifeLaps: 30,
        },
      ],
      pitStops: [{ lap: 30, pitLossSeconds: 20 }],
      predictedTotalRaceTimeSeconds: 4800,
      deltaToBestSeconds: 0,
    },
    {
      id: 'two-stop',
      numStops: 2,
      stints: [
        {
          compound: 'soft',
          startLap: 1,
          endLap: 20,
          lapsOnTyre: 20,
          estimatedTyreLifeLaps: 12,
        },
        {
          compound: 'medium',
          startLap: 21,
          endLap: 40,
          lapsOnTyre: 20,
          estimatedTyreLifeLaps: 20,
        },
        {
          compound: 'hard',
          startLap: 41,
          endLap: 53,
          lapsOnTyre: 13,
          estimatedTyreLifeLaps: 30,
        },
      ],
      pitStops: [
        { lap: 20, pitLossSeconds: 20 },
        { lap: 40, pitLossSeconds: 20 },
      ],
      predictedTotalRaceTimeSeconds: 4850,
      deltaToBestSeconds: 50,
    },
  ],
  recommendedStrategyId: 'one-stop',
  marginAnalysis: {
    closestPairIds: ['one-stop', 'two-stop'],
    deltaSeconds: 50,
    isCloseCall: false,
  },
  assumptionsUsed: ['tyre_compound_params_placeholder'],
});

describe('grounding.ts', () => {
  describe('buildAllowedNumbers', () => {
    it('should extract all numbers from StrategyComparison object', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      // Should include lap numbers
      expect(allowed.has(1)).toBe(true);
      expect(allowed.has(30)).toBe(true);
      expect(allowed.has(53)).toBe(true);

      // Should include pit loss
      expect(allowed.has(20)).toBe(true);

      // Should include race times
      expect(allowed.has(4800)).toBe(true);
      expect(allowed.has(4850)).toBe(true);
    });

    it('should include numbers from reference facts', () => {
      const comparison = createMockComparison();
      const facts: ReferenceFact[] = [
        {
          topic: 'ERS',
          fact: '2026 pack adds 15% more ERS deployment',
          confidence: 'confirmed',
        },
        {
          topic: 'Tyre Life',
          fact: 'Soft compound lasts approximately 12 laps',
          confidence: 'reasonable_estimate',
        },
      ];

      const allowed = buildAllowedNumbers(comparison, facts);

      expect(allowed.has(15)).toBe(true);
      expect(allowed.has(12)).toBe(true);
      expect(allowed.has(2026)).toBe(true);
    });

    it('should include numbers from extra grounded objects', () => {
      const comparison = createMockComparison();
      const extra = [
        { gapAtLap20: 1.5, windowDeltaSec: 3.2 },
        { undercutGain: 0.75 },
      ];

      const allowed = buildAllowedNumbers(comparison, [], extra);

      expect(allowed.has(1.5)).toBe(true);
      expect(allowed.has(3.2)).toBe(true);
      expect(allowed.has(0.75)).toBe(true);
      expect(allowed.has(20)).toBe(true);
    });

    it('should handle nested objects and arrays', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      // Should extract from nested stints array
      expect(allowed.has(30)).toBe(true); // stint endLap
      expect(allowed.has(23)).toBe(true); // stint lapsOnTyre
    });

    it('should filter out non-finite numbers', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      // Should not include NaN or Infinity
      expect(allowed.has(NaN)).toBe(false);
      expect(allowed.has(Infinity)).toBe(false);
    });
  });

  describe('checkGrounding', () => {
    it('should pass when all numbers are grounded', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      const text = 'The one-stop strategy is 30 laps on soft, then 23 laps on hard for 4800 seconds.';
      const warnings = checkGrounding(text, allowed);

      expect(warnings).toHaveLength(0);
    });

    it('should flag ungrounded numbers', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      // 999 is clearly not grounded (no strategy lasts that long, no time delta that large)
      const text = 'The strategy gains 999 seconds in an impossible scenario.';
      const warnings = checkGrounding(text, allowed);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.token === '999')).toBe(true);
    });

    it('should ignore years (2000-2100)', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      const text = 'In 2025 and 2026, the F1 regulations changed significantly.';
      const warnings = checkGrounding(text, allowed);

      // 2025 and 2026 should not trigger warnings despite not being grounded
      expect(warnings.filter(w => w.token.startsWith('202'))).toHaveLength(0);
    });

    it('should ignore common speech numbers (0, 1, 2, 3, 100)', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      const text = 'Three strategies are included: P1, P2, and P3. 100% of pit stops add 20 seconds each.';
      const warnings = checkGrounding(text, allowed);

      // 0, 1, 2, 3, 100 should be ignored
      expect(warnings.filter(w => /^[0-3]$|^100$/.test(w.token))).toHaveLength(0);
    });

    it('should handle lap ranges (e.g., "laps 1-35") without false positives', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      const text = 'The first stint runs laps 1-30, with soft compound grip advantage.';
      const warnings = checkGrounding(text, allowed);

      // Both 1 and 30 are grounded, should not flag
      expect(warnings.filter(w => w.token === '1' || w.token === '30')).toHaveLength(0);
    });

    it('should handle negative numbers correctly (not confuse minus with range separator)', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      const text = 'This strategy is -5 seconds slower than the optimal choice.';
      const warnings = checkGrounding(text, allowed);

      // -5 is not grounded, should flag
      expect(warnings.some(w => w.token === '-5')).toBe(true);
    });

    it('should allow rounding tolerance (0.6s or 3% tolerance)', () => {
      const allowed = new Set([20.0, 50.0, 100.0]);

      // Within 0.6s absolute tolerance
      expect(checkGrounding('The pit stop is 20.3 seconds.', allowed)).toHaveLength(0);
      expect(checkGrounding('The pit stop is 19.8 seconds.', allowed)).toHaveLength(0);

      // Within 3% relative tolerance
      expect(checkGrounding('Race time is 103 seconds (3% of 100).', allowed)).toHaveLength(0);

      // Outside tolerance
      expect(checkGrounding('The pit stop is 18 seconds.', allowed)).toHaveLength(1);
    });

    it('should provide context around ungrounded numbers', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      const text = 'The mystery strategy gains 999 seconds of advantage.';
      const warnings = checkGrounding(text, allowed);

      if (warnings.length > 0) {
        expect(warnings[0].context).toContain('999');
        expect(warnings[0].context.length).toBeLessThanOrEqual(100); // ±30 chars
      }
    });

    it('should handle decimal numbers', () => {
      const allowed = new Set([1.5, 3.2, 0.75, 20]);

      const text = 'Gap at lap 20: 1.5 seconds. Window delta: 3.2 seconds. Undercut: 0.75 seconds.';
      const warnings = checkGrounding(text, allowed);

      expect(warnings).toHaveLength(0);
    });

    it('should catch hallucinated lap numbers', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      const text = 'The strategy pits at lap 99, which is beyond the 53-lap race.';
      const warnings = checkGrounding(text, allowed);

      expect(warnings.some(w => w.token === '99')).toBe(true);
    });

    it('should catch hallucinated tyre life numbers', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      const text = 'The soft compound lasts 45 laps, which is exceptional.';
      const warnings = checkGrounding(text, allowed);

      // 45 is not grounded (soft nominalLife is 12)
      expect(warnings.some(w => w.token === '45')).toBe(true);
    });

    it('should catch hallucinated time deltas', () => {
      const comparison = createMockComparison();
      const allowed = buildAllowedNumbers(comparison);

      const text = 'This strategy wins by exactly 75.3 seconds due to pit strategy.';
      const warnings = checkGrounding(text, allowed);

      // 75.3 is not in allowed set
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should handle reference facts with numeric ranges', () => {
      const comparison = createMockComparison();
      const facts: ReferenceFact[] = [
        {
          topic: 'Weather',
          fact: 'Rain probability forecast: 25-35% throughout the race',
          confidence: 'reasonable_estimate',
        },
      ];
      const allowed = buildAllowedNumbers(comparison, facts);

      const text = 'Rain is expected at 25 to 35% probability.';
      const warnings = checkGrounding(text, allowed);

      // 25 and 35 should be grounded from the range
      expect(warnings.filter(w => w.token === '25' || w.token === '35')).toHaveLength(0);
    });

    it('should not flag numbers in compound names (soft/medium/hard)', () => {
      const allowed = new Set<number>();

      const text = 'Soft, Medium, and Hard compounds are used across the race.';
      const warnings = checkGrounding(text, allowed);

      // No numbers to check
      expect(warnings).toHaveLength(0);
    });
  });
});
