/**
 * mockFixtures.ts
 * -----------------------------------------------------------------------
 * Hand-built StrategyComparison fixtures matching the DRAFT shape in
 * types.ts, used to develop and test prompts before sim's real strategy
 * engine is wired in. DELETE OR REPLACE once sim's actual output shape
 * is confirmed and integration is live — these are not real sim numbers.
 * -----------------------------------------------------------------------
 */

import type { ReferenceFact, StrategyComparison } from './types.ts';

/** A clear-cut case: 2-stop wins comfortably over a 1-stop. */
export const MOCK_CLEAR_WINNER: StrategyComparison = {
  raceContext: {
    trackId: 'silverstone',
    trackName: 'Silverstone',
    totalLaps: 52,
    carClass: 'f1_2025',
    performanceTier: 'contender',
    weather: { condition: 'dry', rainProbabilityPct: 10 },
    safetyCarProbabilityPct: 22,
  },
  strategies: [
    {
      id: '2-stop-med-hard-med',
      numStops: 2,
      stints: [
        { compound: 'medium', startLap: 1, endLap: 18, lapsOnTyre: 18, estimatedTyreLifeLaps: 22 },
        { compound: 'hard', startLap: 19, endLap: 38, lapsOnTyre: 20, estimatedTyreLifeLaps: 30 },
        { compound: 'medium', startLap: 39, endLap: 52, lapsOnTyre: 14, estimatedTyreLifeLaps: 22 },
      ],
      pitStops: [
        { lap: 18, pitLossSeconds: 21.4 },
        { lap: 38, pitLossSeconds: 21.4 },
      ],
      predictedTotalRaceTimeSeconds: 5423.7,
      deltaToBestSeconds: 0,
      confidence: 'high',
    },
    {
      id: '1-stop-med-hard',
      numStops: 1,
      stints: [
        { compound: 'medium', startLap: 1, endLap: 24, lapsOnTyre: 24, estimatedTyreLifeLaps: 22 },
        { compound: 'hard', startLap: 25, endLap: 52, lapsOnTyre: 28, estimatedTyreLifeLaps: 30 },
      ],
      pitStops: [{ lap: 24, pitLossSeconds: 21.4 }],
      predictedTotalRaceTimeSeconds: 5441.2,
      deltaToBestSeconds: 17.5,
      confidence: 'high',
    },
  ],
  recommendedStrategyId: '2-stop-med-hard-med',
  marginAnalysis: {
    closestPairIds: ['2-stop-med-hard-med', '1-stop-med-hard'],
    deltaSeconds: 17.5,
    isCloseCall: false,
  },
  assumptionsUsed: ['tyre_deg_curve_v1_placeholder', 'pit_loss_silverstone_estimated'],
};

/** A genuinely close call: two candidates within a couple tenths. */
export const MOCK_CLOSE_CALL: StrategyComparison = {
  raceContext: {
    trackId: 'monaco',
    trackName: 'Monaco',
    totalLaps: 78,
    carClass: 'f1_2026_season_pack',
    performanceTier: 'top_tier',
    weather: { condition: 'dry', rainProbabilityPct: 5 },
    safetyCarProbabilityPct: 61,
  },
  strategies: [
    {
      id: '1-stop-med-hard',
      numStops: 1,
      stints: [
        { compound: 'medium', startLap: 1, endLap: 35, lapsOnTyre: 35, estimatedTyreLifeLaps: 32 },
        { compound: 'hard', startLap: 36, endLap: 78, lapsOnTyre: 43, estimatedTyreLifeLaps: 45 },
      ],
      pitStops: [{ lap: 35, pitLossSeconds: 19.8 }],
      predictedTotalRaceTimeSeconds: 6127.9,
      deltaToBestSeconds: 0,
      confidence: 'medium',
    },
    {
      id: '1-stop-med-hard-late',
      numStops: 1,
      stints: [
        { compound: 'medium', startLap: 1, endLap: 40, lapsOnTyre: 40, estimatedTyreLifeLaps: 32 },
        { compound: 'hard', startLap: 41, endLap: 78, lapsOnTyre: 38, estimatedTyreLifeLaps: 45 },
      ],
      pitStops: [{ lap: 40, pitLossSeconds: 19.8 }],
      predictedTotalRaceTimeSeconds: 6128.2,
      deltaToBestSeconds: 0.3,
      confidence: 'medium',
    },
  ],
  recommendedStrategyId: '1-stop-med-hard',
  marginAnalysis: {
    closestPairIds: ['1-stop-med-hard', '1-stop-med-hard-late'],
    deltaSeconds: 0.3,
    isCloseCall: true,
  },
  assumptionsUsed: [
    'tyre_deg_curve_v1_placeholder',
    'pit_loss_monaco_estimated',
    'safety_car_model_default_placeholder',
  ],
};

export const MOCK_REFERENCE_FACTS: ReferenceFact[] = [
  {
    topic: 'monaco_overtaking',
    fact: 'Monaco is historically very difficult to overtake on, making track position after the pit stop unusually valuable.',
    confidence: 'confirmed',
    source: 'data teammate — track reference file (pending)',
  },
  {
    topic: 'safety_car_model',
    fact: "Monaco's high safety-car probability figure is currently a default placeholder, not derived from historical per-track data yet.",
    confidence: 'placeholder',
    source: 'sim teammate — SIMLOG.md (pending)',
  },
];
