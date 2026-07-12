/**
 * stopCountPlausibility.ts
 * -----------------------------------------------------------------------
 * Determines which stop counts (1-stop, 2-stop, 3-stop, ...) are even
 * plausibly competitive for a given race distance, BEFORE a caller
 * generates them as strategy candidates.
 *
 * Bug this fixes (found by coordinator, 2026-07-12): `strategyCandidates.ts`
 * (visual's file, src/lib/) unconditionally generated 1/2/3-stop candidates
 * regardless of race length — so a 25%- or 35%-distance race would show an
 * absurd 3-stop candidate (and often an implausible 2-stop) that pit-loss
 * economics make essentially never competitive at that distance. This
 * module is the reasoning/threshold layer sim owns; visual wires it into
 * their candidate generator. See SIMLOG.md #13 for the full writeup.
 *
 * REASONING: a pit stop's fixed time cost (`pitLossSec`, ~18-22s in this
 * app's placeholders) is only worth paying if the resulting stint is long
 * enough for a fresh tyre's pace advantage to recoup that cost. Two
 * distinct floors make a stop count implausible for a given race distance:
 *
 *  1. HARD FLOOR (applies to every stop count, including 1-stop): a stint
 *     below `MIN_VIABLE_STINT_LAPS` isn't a real strategic choice at all —
 *     it doesn't clear tyre warmup (see degradation.ts's `warmupLaps`,
 *     1-3 laps per compound) plus a handful of representative racing laps.
 *  2. ECONOMIC FLOOR (applies only to stop counts beyond the first — a
 *     1-stop is always considered at least worth evaluating once it
 *     clears floor #1, since running some minimum viable strategy is
 *     the baseline case, not something to filter out): a stint materially
 *     shorter than the point a tyre's degradation curve turns steep (the
 *     "cliff", see `degradation.ts`/`estimateTyreLife()`) never reaches
 *     the wear regime an EXTRA stop (beyond the first) is meant to avoid —
 *     splitting further just pays `pitLossSec` again for a tyre that was
 *     never going to be in serious trouble anyway. Modeled by requiring
 *     the average stint length be at least `CLIFF_MARGIN_FRACTION` of a
 *     representative (medium) compound's tier/class/track-adjusted cliff
 *     lap.
 *
 * Both thresholds are PLACEHOLDER constants — qualitatively sound (shorter
 * races support fewer stops; higher-wear cars/tracks support relatively
 * more, since `estimateTyreLife()`'s cliffLapEstimate already factors in
 * carClass/performanceTier/trackAbrasivenessRating) but not calibrated
 * against real strategy data. Medium is used as the "representative"
 * compound for floor #2 specifically as a planning-level baseline — this
 * doesn't mean every candidate has to run medium, just that its
 * degradation curve is a reasonable stand-in for "a typical race compound"
 * when deciding how many stops the race distance can support at all.
 *
 * This is a cheap pre-filter, NOT a replacement for the real comparison —
 * it doesn't run `compareStrategies()` or any full race simulation, it
 * just decides which stop counts are worth generating/evaluating as
 * candidates in the first place.
 * -----------------------------------------------------------------------
 */

import { estimateTyreLife, type DegradationOptions } from './degradation';

export interface StopCountPlausibility {
  /** Number of pit stops (1 = two stints, 2 = three stints, etc). */
  stopCount: number;
  numStints: number;
  avgStintLaps: number;
  plausible: boolean;
  /** Populated when `plausible` is false — which floor it failed. */
  reason?:
    | 'below_min_stint_length'
    | 'stint_too_short_to_reach_wear_cliff'
    | 'forced_minimum_fallback_extremely_short_race';
}

const MIN_VIABLE_STINT_LAPS = 5; // PLACEHOLDER — floor #1, see module doc
const CLIFF_MARGIN_FRACTION = 0.5; // PLACEHOLDER — floor #2, see module doc

/**
 * Evaluates stop counts 1..maxStopCountToConsider and flags which are
 * plausible for this race distance/car/track combination.
 */
export function plausibleStopCounts(
  totalLaps: number,
  degOptions: DegradationOptions = {},
  maxStopCountToConsider = 3,
): StopCountPlausibility[] {
  const { cliffLapEstimate } = estimateTyreLife('medium', degOptions);
  const economicFloorLaps = cliffLapEstimate * CLIFF_MARGIN_FRACTION;

  const results: StopCountPlausibility[] = [];
  for (let stopCount = 1; stopCount <= maxStopCountToConsider; stopCount += 1) {
    const numStints = stopCount + 1;
    const avgStintLaps = totalLaps / numStints;

    let plausible = true;
    let reason: StopCountPlausibility['reason'];
    if (avgStintLaps < MIN_VIABLE_STINT_LAPS) {
      plausible = false;
      reason = 'below_min_stint_length';
    } else if (stopCount > 1 && avgStintLaps < economicFloorLaps) {
      plausible = false;
      reason = 'stint_too_short_to_reach_wear_cliff';
    }

    results.push({ stopCount, numStints, avgStintLaps: round1(avgStintLaps), plausible, reason });
  }

  // Hardening (found by a coordinator-requested stress pass, 2026-07-12): an
  // extremely short race (well under ~10 laps -- reachable by combining a low
  // race-length % with a short track, or any caller passing a small totalLaps
  // directly) can fail floor #1 for EVERY stop count, leaving zero plausible
  // candidates. A race, however short, still needs at least one strategy to
  // recommend. Force the single stint count sim/visual's candidate set can
  // actually build a plan around (1-stop -> two stints) to plausible in that
  // case, clearly flagged as a forced fallback rather than a genuine "this
  // is comfortably worth it" verdict -- callers/ai should hedge accordingly.
  if (!results.some((r) => r.plausible) && results.length > 0) {
    results[0].plausible = true;
    results[0].reason = 'forced_minimum_fallback_extremely_short_race';
  }

  return results;
}

/** Convenience: just the plausible stop-count numbers, in order. */
export function plausibleStopCountNumbers(
  totalLaps: number,
  degOptions: DegradationOptions = {},
  maxStopCountToConsider = 3,
): number[] {
  return plausibleStopCounts(totalLaps, degOptions, maxStopCountToConsider)
    .filter((r) => r.plausible)
    .map((r) => r.stopCount);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
