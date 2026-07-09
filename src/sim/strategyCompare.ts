/**
 * strategyCompare.ts
 * -----------------------------------------------------------------------
 * One/two/three-stop full-race comparison: simulates each candidate
 * strategy across the full race distance (tyre degradation + fuel effect
 * + pit-stop loss per stop) and ranks them by predicted total race time.
 *
 * Output shape matches `StrategyComparison` in src/ai/types.ts exactly —
 * that file is the agreed contract with the `ai` teammate (reconciled
 * 2026-07-09). Do not rename fields here without updating that file and
 * telling `ai`.
 *
 * See SIMLOG.md #5 for the aggregation/ranking approach and its
 * assumptions (most importantly: no inter-driver traffic/overtaking model
 * yet — this is pure "isolated car, clear track" pace, not a full race
 * order simulation).
 * -----------------------------------------------------------------------
 */

import type {
  StrategyComparison,
  StrategyCandidate,
  Stint,
  PitStop,
  RaceContext,
  MarginAnalysis,
  TyreCompound,
  ConfidenceLevel,
} from '../ai/types';
import { tyreLapTimeDelta, estimateTyreLife, type DegradationOptions } from './degradation';
import { fuelEffectForLap, type FuelOptions } from './fuel';
import { PERFORMANCE_TIERS, CAR_CLASSES, type CarClassKey, type PerformanceTierKey } from './constants';

export interface StintPlan {
  compound: TyreCompound;
  /** Number of laps planned on this tyre set. */
  plannedLaps: number;
}

export interface StrategyPlan {
  id: string;
  stints: StintPlan[];
}

export interface RaceSimInput {
  trackId: string;
  trackName: string;
  totalLaps: number;
  carClass: CarClassKey;
  performanceTier: PerformanceTierKey;
  weather: RaceContext['weather'];
  safetyCarProbabilityPct: number;
  /** Total pit-stop time loss (seconds) for this track, from pitStopLoss.ts. Applied once per stop. */
  pitLossSec: number;
  /**
   * Track's absolute baseline laptime (seconds) at zero fuel effect / peak
   * tyre grip, i.e. before tier/class offsets and tyre/fuel deltas are
   * added. PLACEHOLDER (flat 90s generic-track default) used if omitted.
   * Resolved 2026-07-10: pass data teammate's
   * data/track-lap-reference.json `referenceLapTimeSec` here — it's a
   * floor/reference value (the circuit's official GP lap record), same
   * role this field always played; real race pace naturally comes out
   * higher once this function's own tyre/fuel deltas are added on top.
   */
  baseLapTimeSec?: number;
  /** Confidence tag for `baseLapTimeSec`, propagated into assumptionsUsed per the data-teammate sourceConfidence convention. */
  baseLapTimeSourceConfidence?: ConfidenceLevel;
  /**
   * Per-circuit tyre stress rating (1 gentle - 5 punishing), from data
   * teammate's data/track-tyre-characteristics.json. Omit to leave wear
   * track-agnostic. See degradation.ts's trackAbrasivenessMultiplier().
   */
  trackAbrasivenessRating?: 1 | 2 | 3 | 4 | 5;
  fuelOptions?: FuelOptions;
  strategies: StrategyPlan[];
}

const DEFAULT_BASE_LAP_TIME_SEC = 90; // PLACEHOLDER generic track, see SIMLOG.md #5
const CLOSE_CALL_THRESHOLD_SEC = 2.0; // PLACEHOLDER — under this margin, flag as a close call, see SIMLOG.md #5

export function compareStrategies(input: RaceSimInput): StrategyComparison {
  const globalFlags = new Set<string>();
  if (input.baseLapTimeSec === undefined) {
    globalFlags.add('base_lap_time_generic_placeholder');
  } else if (input.baseLapTimeSourceConfidence && input.baseLapTimeSourceConfidence !== 'confirmed') {
    globalFlags.add(`base_lap_time_source_confidence_${input.baseLapTimeSourceConfidence}`);
  }
  const baseLapTimeSec = input.baseLapTimeSec ?? DEFAULT_BASE_LAP_TIME_SEC;

  const degOptions: DegradationOptions = {
    carClass: input.carClass,
    performanceTier: input.performanceTier,
    trackAbrasivenessRating: input.trackAbrasivenessRating,
  };
  const classParams = CAR_CLASSES[input.carClass];
  const tierParams = PERFORMANCE_TIERS[input.performanceTier];
  // Tier gap is percent-off-ultimate-pace (scales with track length), converted to seconds for
  // THIS track's baseLapTimeSec; class gap (e.g. F2 vs F1) stays flat seconds. See SIMLOG.md #9.
  const tierOffset = baseLapTimeSec * tierParams.paceOffsetPct * classParams.tierPaceRangeScale;
  const classOffset = classParams.basePaceOffsetSec;

  const evaluated = input.strategies.map((plan) =>
    evaluateStrategy(plan, {
      totalLaps: input.totalLaps,
      baseLapTimeSec,
      tierOffset,
      classOffset,
      pitLossSec: input.pitLossSec,
      degOptions,
      fuelOptions: input.fuelOptions ?? {},
      globalFlags,
    }),
  );

  const totalPlannedLaps = evaluated.map((e) => e.plannedLapsSum);
  totalPlannedLaps.forEach((sum, idx) => {
    if (sum !== input.totalLaps) {
      globalFlags.add(
        `strategy_${input.strategies[idx].id}_stint_laps_do_not_sum_to_race_distance`,
      );
    }
  });

  const best = evaluated.reduce((min, e) =>
    e.predictedTotalRaceTimeSeconds < min.predictedTotalRaceTimeSeconds ? e : min,
  );

  const strategies: StrategyCandidate[] = evaluated
    .map((e) => ({
      id: e.id,
      numStops: e.numStops,
      stints: e.stints,
      pitStops: e.pitStops,
      predictedTotalRaceTimeSeconds: e.predictedTotalRaceTimeSeconds,
      deltaToBestSeconds: round3(e.predictedTotalRaceTimeSeconds - best.predictedTotalRaceTimeSeconds),
      confidence: e.confidence,
    }))
    .sort((a, b) => a.predictedTotalRaceTimeSeconds - b.predictedTotalRaceTimeSeconds);

  const marginAnalysis = computeMarginAnalysis(strategies);

  const raceContext: RaceContext = {
    trackId: input.trackId,
    trackName: input.trackName,
    totalLaps: input.totalLaps,
    carClass: input.carClass,
    performanceTier: input.performanceTier,
    weather: input.weather,
    safetyCarProbabilityPct: input.safetyCarProbabilityPct,
  };

  evaluated.forEach((e) => e.assumptionFlags.forEach((f) => globalFlags.add(f)));

  return {
    raceContext,
    strategies,
    recommendedStrategyId: strategies[0].id,
    marginAnalysis,
    assumptionsUsed: [...globalFlags].sort(),
  };
}

interface EvaluatedStrategy {
  id: string;
  numStops: number;
  stints: Stint[];
  pitStops: PitStop[];
  predictedTotalRaceTimeSeconds: number;
  confidence: 'high' | 'medium' | 'low';
  assumptionFlags: string[];
  plannedLapsSum: number;
}

/**
 * Per-lap cumulative race time for one strategy plan, lap-by-lap
 * (tyre delta + fuel delta + a constant per-lap offset for
 * class/tier/base laptime, plus pit loss applied on a stint's endLap).
 * Exported so `raceGapEvolution.ts` can reuse the exact same lap-by-lap
 * math to diff two candidates without duplicating/drifting from this
 * logic — see SIMLOG.md #5 and the gap-evolution section.
 *
 * Returns `{ stints, pitStops, cumulativeTimeSec }` where
 * `cumulativeTimeSec[n]` is total elapsed race time through lap `n`
 * (index 0 = 0, i.e. race start).
 */
export function perLapStrategyTrace(
  plan: StrategyPlan,
  ctx: {
    totalLaps: number;
    baseLapTimeSec: number;
    /** Constant per-lap offset (e.g. class + tier pace gap). Pass 0 to omit — see raceGapEvolution.ts's isolated-car-pace note. */
    perLapOffsetSec: number;
    pitLossSec: number;
    degOptions: DegradationOptions;
    fuelOptions: FuelOptions;
  },
): {
  stints: Stint[];
  pitStops: PitStop[];
  cumulativeTimeSec: number[];
  assumptionFlags: string[];
  plannedLapsSum: number;
} {
  const flags = new Set<string>();
  const stints: Stint[] = [];
  const pitStops: PitStop[] = [];
  const cumulativeTimeSec: number[] = [0];
  let totalTimeSec = 0;
  let lapCursor = 0; // laps completed before this stint
  const plannedLapsSum = plan.stints.reduce((s, st) => s + st.plannedLaps, 0);

  plan.stints.forEach((stintPlan, stintIdx) => {
    const startLap = lapCursor + 1;
    const endLap = lapCursor + stintPlan.plannedLaps;
    const { nominalLifeLaps, assumptionFlags: lifeFlags } = estimateTyreLife(
      stintPlan.compound,
      ctx.degOptions,
    );
    lifeFlags.forEach((f) => flags.add(f));

    for (let lapOnTyre = 1; lapOnTyre <= stintPlan.plannedLaps; lapOnTyre += 1) {
      const absoluteLap = lapCursor + lapOnTyre;
      const { lapTimeDeltaSec: tyreDelta, assumptionFlags: tf } = tyreLapTimeDelta(
        stintPlan.compound,
        lapOnTyre,
        ctx.degOptions,
      );
      tf.forEach((f) => flags.add(f));

      const { fuelLapTimeDeltaSec: fuelDelta, assumptionFlags: ff } = fuelEffectForLap(
        absoluteLap,
        ctx.totalLaps,
        ctx.fuelOptions,
      );
      ff.forEach((f) => flags.add(f));

      const lapTimeSec = ctx.baseLapTimeSec + ctx.perLapOffsetSec + tyreDelta + fuelDelta;
      totalTimeSec += lapTimeSec;
      cumulativeTimeSec.push(round3(totalTimeSec));
    }

    stints.push({
      compound: stintPlan.compound,
      startLap,
      endLap,
      lapsOnTyre: stintPlan.plannedLaps,
      estimatedTyreLifeLaps: nominalLifeLaps,
    });

    // A stop happens after every stint except the last.
    if (stintIdx < plan.stints.length - 1) {
      totalTimeSec += ctx.pitLossSec;
      cumulativeTimeSec[cumulativeTimeSec.length - 1] = round3(totalTimeSec);
      pitStops.push({ lap: endLap, pitLossSeconds: round3(ctx.pitLossSec) });
    }

    lapCursor = endLap;
  });

  return {
    stints,
    pitStops,
    cumulativeTimeSec,
    assumptionFlags: [...flags],
    plannedLapsSum,
  };
}

function evaluateStrategy(
  plan: StrategyPlan,
  ctx: {
    totalLaps: number;
    baseLapTimeSec: number;
    tierOffset: number;
    classOffset: number;
    pitLossSec: number;
    degOptions: DegradationOptions;
    fuelOptions: FuelOptions;
    globalFlags: Set<string>;
  },
): EvaluatedStrategy {
  const trace = perLapStrategyTrace(plan, {
    totalLaps: ctx.totalLaps,
    baseLapTimeSec: ctx.baseLapTimeSec,
    perLapOffsetSec: ctx.classOffset + ctx.tierOffset,
    pitLossSec: ctx.pitLossSec,
    degOptions: ctx.degOptions,
    fuelOptions: ctx.fuelOptions,
  });
  const flags = new Set(trace.assumptionFlags);
  const stints = trace.stints;
  const pitStops = trace.pitStops;
  const totalTimeSec = trace.cumulativeTimeSec[trace.cumulativeTimeSec.length - 1];
  const plannedLapsSum = trace.plannedLapsSum;

  const flagCount = flags.size;
  const confidence: EvaluatedStrategy['confidence'] =
    flagCount <= 2 ? 'high' : flagCount <= 5 ? 'medium' : 'low';

  return {
    id: plan.id,
    numStops: pitStops.length,
    stints,
    pitStops,
    predictedTotalRaceTimeSeconds: round3(totalTimeSec),
    confidence,
    assumptionFlags: [...flags],
    plannedLapsSum,
  };
}

function computeMarginAnalysis(strategies: StrategyCandidate[]): MarginAnalysis {
  if (strategies.length < 2) {
    return {
      closestPairIds: [strategies[0]?.id ?? '', strategies[0]?.id ?? ''],
      deltaSeconds: 0,
      isCloseCall: false,
    };
  }
  let closest: [StrategyCandidate, StrategyCandidate] = [strategies[0], strategies[1]];
  let smallestDelta = Math.abs(
    strategies[0].predictedTotalRaceTimeSeconds - strategies[1].predictedTotalRaceTimeSeconds,
  );
  for (let i = 0; i < strategies.length; i += 1) {
    for (let j = i + 1; j < strategies.length; j += 1) {
      const delta = Math.abs(
        strategies[i].predictedTotalRaceTimeSeconds - strategies[j].predictedTotalRaceTimeSeconds,
      );
      if (delta < smallestDelta) {
        smallestDelta = delta;
        closest = [strategies[i], strategies[j]];
      }
    }
  }
  return {
    closestPairIds: [closest[0].id, closest[1].id],
    deltaSeconds: round3(smallestDelta),
    isCloseCall: smallestDelta < CLOSE_CALL_THRESHOLD_SEC,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
