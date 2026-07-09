/**
 * raceGapEvolution.ts
 * -----------------------------------------------------------------------
 * Lap-by-lap gap-evolution series between two strategy candidates — the
 * data shape `visual`'s Strategy Battle screen has been stubbed pending
 * (see StrategyBattleScreen.tsx's placeholder panel and CLAUDE.md's "What's
 * still open" list, which flags this to sim explicitly).
 *
 * Reuses `perLapStrategyTrace()` from strategyCompare.ts — the exact same
 * lap-by-lap tyre/fuel/pit-loss math `compareStrategies()` uses to produce
 * `predictedTotalRaceTimeSeconds` — so this chart can never silently drift
 * from the headline numbers shown elsewhere in the app.
 *
 * Scope/limitation (same one strategyCompare.ts documents, see SIMLOG.md
 * #5): this is "isolated car, clear track" pace for BOTH candidates. It
 * assumes the same car class/tier/track for both — i.e. this answers "if
 * this car ran Strategy A vs Strategy B, how would the gap evolve," not
 * "how would car A vs car B's actual on-track gap evolve" (that needs a
 * multi-car race-order model with traffic, which doesn't exist yet
 * either). Because both candidates share the same car, class+tier pace
 * offset cancels out of the gap and is intentionally NOT included here
 * (pass a per-lap offset in seconds via degOptions if you ever need to
 * diff two different cars — not the current use case).
 *
 * Sign convention: `gapSeconds > 0` means candidate A is AHEAD (has done
 * less cumulative time so far) at that lap; `< 0` means candidate B is
 * ahead. This matches how a broadcast gap readout reads ("+1.2s" = the car
 * behind is 1.2s adrift), with A always the reference car.
 * -----------------------------------------------------------------------
 */

import type { DegradationOptions } from './degradation';
import type { FuelOptions } from './fuel';
import { perLapStrategyTrace, type StrategyPlan } from './strategyCompare';

export interface GapEvolutionPoint {
  lap: number;
  /** Positive = candidate A ahead at this lap; negative = candidate B ahead. */
  gapSeconds: number;
}

export interface GapEvolutionInput {
  totalLaps: number;
  baseLapTimeSec: number;
  pitLossSec: number;
  candidateA: StrategyPlan;
  candidateB: StrategyPlan;
  degOptions?: DegradationOptions;
  fuelOptions?: FuelOptions;
}

export interface GapEvolutionResult {
  candidateAId: string;
  candidateBId: string;
  /** One point per lap, 0 (race start, gap 0) through totalLaps. */
  points: GapEvolutionPoint[];
  /** Laps either candidate pits — useful for the chart to mark pit-lane events on the gap line. */
  pitLapsA: number[];
  pitLapsB: number[];
  assumptionFlags: string[];
}

export function raceGapEvolution(input: GapEvolutionInput): GapEvolutionResult {
  const flags = new Set<string>();
  const degOptions = input.degOptions ?? {};
  const fuelOptions = input.fuelOptions ?? {};

  const traceA = perLapStrategyTrace(input.candidateA, {
    totalLaps: input.totalLaps,
    baseLapTimeSec: input.baseLapTimeSec,
    perLapOffsetSec: 0,
    pitLossSec: input.pitLossSec,
    degOptions,
    fuelOptions,
  });
  const traceB = perLapStrategyTrace(input.candidateB, {
    totalLaps: input.totalLaps,
    baseLapTimeSec: input.baseLapTimeSec,
    perLapOffsetSec: 0,
    pitLossSec: input.pitLossSec,
    degOptions,
    fuelOptions,
  });
  traceA.assumptionFlags.forEach((f) => flags.add(f));
  traceB.assumptionFlags.forEach((f) => flags.add(f));

  if (traceA.plannedLapsSum !== input.totalLaps) {
    flags.add(`strategy_${input.candidateA.id}_stint_laps_do_not_sum_to_race_distance`);
  }
  if (traceB.plannedLapsSum !== input.totalLaps) {
    flags.add(`strategy_${input.candidateB.id}_stint_laps_do_not_sum_to_race_distance`);
  }

  // Both traces are indexed 0..plannedLapsSum; if a plan's laps don't sum to
  // totalLaps (flagged above), clamp to the shorter of the two so we never
  // read past an array's end — the chart just won't extend past that lap.
  const lastLap = Math.min(
    input.totalLaps,
    traceA.cumulativeTimeSec.length - 1,
    traceB.cumulativeTimeSec.length - 1,
  );

  const points: GapEvolutionPoint[] = [];
  for (let lap = 0; lap <= lastLap; lap += 1) {
    points.push({
      lap,
      gapSeconds: round3(traceB.cumulativeTimeSec[lap] - traceA.cumulativeTimeSec[lap]),
    });
  }

  return {
    candidateAId: input.candidateA.id,
    candidateBId: input.candidateB.id,
    points,
    pitLapsA: traceA.pitStops.map((p) => p.lap),
    pitLapsB: traceB.pitStops.map((p) => p.lap),
    assumptionFlags: [...flags].sort(),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
