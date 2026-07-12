/**
 * strategyCandidates.ts
 * -----------------------------------------------------------------------
 * Generates a small set of plausible strategy candidates (compound
 * sequence + stint-length split) to hand to sim's compareStrategies() as
 * `RaceSimInput.strategies`. This is a UI-side heuristic, not sim math —
 * sim owns tyre-life numbers (constants.ts TYRE_COMPOUNDS) and we lean on
 * those to weight the split, but "which compound sequences are worth
 * comparing" and "how to divide laps between them" is a display-layer
 * choice, not a simulation model. Flagged to sim in case they'd rather
 * own this as a first-class export once the candidate logic needs to get
 * smarter (e.g. accounting for an actual undercut-window search).
 * -----------------------------------------------------------------------
 */
import { TYRE_COMPOUNDS, plausibleStopCountNumbers } from '../sim';
import type { DegradationOptions } from '../sim';
import type { TyreCompound } from '../ai/types';
import type { StrategyPlan, StintPlan } from '../sim/strategyCompare';

/** Compound sequences tried for each stop count — realistic race-strategy shapes, not exhaustive. */
const CANDIDATE_SEQUENCES: { id: string; compounds: TyreCompound[] }[] = [
  { id: '1-stop-med-hard', compounds: ['medium', 'hard'] },
  { id: '2-stop-med-hard-med', compounds: ['medium', 'hard', 'medium'] },
  { id: '3-stop-soft-med-soft-med', compounds: ['soft', 'medium', 'soft', 'medium'] },
];

/**
 * Splits totalLaps across a compound sequence proportional to each
 * compound's nominalLife (from sim's TYRE_COMPOUNDS) rather than an even
 * split, so a 1-stop's hard stint is longer than its medium stint the way
 * a real strategist would plan it. Last stint absorbs any rounding
 * remainder so laps always sum exactly to totalLaps (compareStrategies()
 * flags a mismatch otherwise).
 */
function splitLapsByTyreLife(totalLaps: number, compounds: TyreCompound[]): StintPlan[] {
  const weights = compounds.map((c) => TYRE_COMPOUNDS[c].nominalLife);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const laps = weights.map((w) => Math.max(1, Math.round((w / weightSum) * totalLaps)));
  const drift = totalLaps - laps.reduce((a, b) => a + b, 0);
  laps[laps.length - 1] += drift;

  // Guard against a negative last-stint length from an extreme rounding drift on very short races.
  if (laps[laps.length - 1] < 1) {
    laps[laps.length - 1] = 1;
  }

  return compounds.map((compound, i) => ({ compound, plannedLaps: laps[i] }));
}

/**
 * Builds the standard 1/2/3-stop candidate set for a given race distance.
 * Drops any candidate whose stint count exceeds totalLaps (degenerate on
 * very short sprint-length races), AND any whose stop count sim's
 * `plausibleStopCountNumbers()` (src/sim/stopCountPlausibility.ts) flags as
 * not economically viable at this distance — e.g. a 25%/35%-length race
 * pays a pit stop's fixed time cost without a stint long enough to recoup
 * it, so a 2-/3-stop candidate would otherwise show up as if it were a
 * real option (SIMLOG.md #13, coordinator-flagged correctness bug). Pass
 * `degOptions` (carClass/performanceTier/trackAbrasivenessRating) when the
 * caller has them in scope for a more accurate cliff-lap threshold — sim's
 * function degrades gracefully to the medium-compound baseline without
 * them.
 */
export function buildStrategyCandidates(totalLaps: number, degOptions: DegradationOptions = {}): StrategyPlan[] {
  const allowedStopCounts = plausibleStopCountNumbers(totalLaps, degOptions);
  return CANDIDATE_SEQUENCES.filter(
    (seq) => seq.compounds.length <= totalLaps && allowedStopCounts.includes(seq.compounds.length - 1),
  ).map((seq) => ({
    id: seq.id,
    stints: splitLapsByTyreLife(totalLaps, seq.compounds),
  }));
}
