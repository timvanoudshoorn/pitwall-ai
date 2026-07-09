/**
 * weather.ts
 * -----------------------------------------------------------------------
 * Weather transition modeling: how "wet" the track is at a given lap
 * during a rain transition, which compound that wetness favors, and how
 * a strategy's expected value shifts once a rain probability is factored
 * in — including the risk of committing to the wrong tyre choice.
 *
 * See SIMLOG.md #7 for the wetness-penalty curve assumptions (nothing
 * here is calibrated from real F1 25 wet-weather telemetry).
 * -----------------------------------------------------------------------
 */

import type { TyreCompound } from '../ai/types';
import { TYRE_COMPOUNDS, WEATHER_DEFAULTS } from './constants';

/**
 * Track "wetness" as a 0 (bone dry) - 1 (full wet) fraction, ramping
 * linearly from `rainStartLap` over `transitionWindowLaps`, then holding
 * at 1 until `rainEndLap` (if given), then ramping back down over the
 * same window length. A single-transition (rain never stops) scenario is
 * modeled by omitting rainEndLap.
 */
export interface WetnessInput {
  lap: number;
  rainStartLap: number;
  rainEndLap?: number;
  transitionWindowLaps?: number;
}

export function trackWetnessAtLap(input: WetnessInput): number {
  const window = input.transitionWindowLaps ?? WEATHER_DEFAULTS.transitionWindowLaps;
  if (input.lap < input.rainStartLap) return 0;

  const risingWetness = clamp01((input.lap - input.rainStartLap) / window);

  if (input.rainEndLap === undefined || input.lap < input.rainEndLap) {
    return risingWetness;
  }

  const dryingFraction = clamp01((input.lap - input.rainEndLap) / window);
  return clamp01(risingWetness * (1 - dryingFraction));
}

export interface CompoundWeatherPenaltyResult {
  penaltySec: number;
  viable: boolean;
  assumptionFlags: string[];
}

const SLICK_AQUAPLANE_WETNESS_THRESHOLD = 0.12; // PLACEHOLDER, see SIMLOG.md #7
const SLICK_AQUAPLANE_PENALTY_PER_UNIT = 25; // seconds/lap penalty scale beyond threshold, PLACEHOLDER
const OFF_RANGE_PENALTY_PER_UNIT = 3.5; // seconds/lap penalty for inter/wet operated outside its optimal wetness band, PLACEHOLDER

/**
 * Extra laptime penalty (seconds) from running `compound` at a given
 * track wetness, ON TOP of that compound's normal dry-baseline
 * paceOffsetVsHard (see constants.ts / degradation.ts). Returns
 * `viable: false` once the mismatch is severe enough that the tyre
 * choice should be treated as effectively unraceable (e.g. slicks in
 * heavy wet).
 */
export function compoundWeatherPenalty(
  compound: TyreCompound,
  wetnessFraction: number,
): CompoundWeatherPenaltyResult {
  const flags = ['weather_penalty_curve_placeholder'];
  const wetness = clamp01(wetnessFraction);

  if (compound === 'soft' || compound === 'medium' || compound === 'hard') {
    const excess = Math.max(0, wetness - SLICK_AQUAPLANE_WETNESS_THRESHOLD);
    const penaltySec = round3(excess * excess * SLICK_AQUAPLANE_PENALTY_PER_UNIT * 10);
    return { penaltySec, viable: wetness < 0.35, assumptionFlags: flags };
  }

  const params = TYRE_COMPOUNDS[compound];
  const min = params.crossoverWetnessMin ?? 0;
  const max = params.crossoverWetnessMax ?? 1;
  let distance = 0;
  if (wetness < min) distance = min - wetness;
  else if (wetness > max) distance = wetness - max;
  const penaltySec = round3(distance * OFF_RANGE_PENALTY_PER_UNIT);
  return { penaltySec, viable: true, assumptionFlags: flags };
}

export interface RecommendedCompoundResult {
  compound: TyreCompound;
  estimatedPenaltySec: number;
  assumptionFlags: string[];
}

/** Picks the compound with the lowest (dry offset + weather penalty) at a given wetness. */
export function recommendedCompoundForWetness(wetnessFraction: number): RecommendedCompoundResult {
  const flags = new Set<string>();
  const candidates = (Object.keys(TYRE_COMPOUNDS) as TyreCompound[]).map((compound) => {
    const { penaltySec, assumptionFlags } = compoundWeatherPenalty(compound, wetnessFraction);
    assumptionFlags.forEach((f) => flags.add(f));
    const total = TYRE_COMPOUNDS[compound].paceOffsetVsHard + penaltySec;
    return { compound, estimatedPenaltySec: round3(total) };
  });

  const best = candidates.reduce((min, c) =>
    c.estimatedPenaltySec < min.estimatedPenaltySec ? c : min,
  );

  return { ...best, assumptionFlags: [...flags] };
}

export interface RainScenarioEvInput {
  /** Predicted total race time (seconds) assuming the track stays dry. */
  dryTotalTimeSec: number;
  /** Predicted total race time (seconds) if the strategy correctly adapts to the rain (right tyre, right lap). */
  wetAdaptedTotalTimeSec: number;
  /** Predicted total race time (seconds) if the strategy is caught out (wrong tyre for a window). */
  wetMisjudgedTotalTimeSec: number;
  rainProbabilityPct: number;
  /** Probability (0-100) that, given it rains, this strategy calls it correctly. Defaults to a neutral 50/50 guess. */
  correctCallProbabilityPct?: number;
}

export interface RainScenarioEvResult {
  expectedTotalTimeSec: number;
  bestCaseTotalTimeSec: number;
  worstCaseTotalTimeSec: number;
  assumptionFlags: string[];
}

/**
 * Expected value of a strategy's total race time across a simple 3-branch
 * weather tree: stays dry / rains-and-adapts / rains-and-misjudged. This
 * is intentionally simple (not a full Markov/Monte Carlo weather model)
 * — good enough to compare "how much does this strategy have riding on
 * the weather guess" across candidates. See SIMLOG.md #7.
 */
export function rainScenarioExpectedValue(input: RainScenarioEvInput): RainScenarioEvResult {
  const flags: string[] = [];
  const pRain = clamp01(input.rainProbabilityPct / 100);
  const pCorrect =
    input.correctCallProbabilityPct !== undefined
      ? clamp01(input.correctCallProbabilityPct / 100)
      : (flags.push('rain_correct_call_probability_default_50_50'), 0.5);

  const expectedTotalTimeSec = round3(
    (1 - pRain) * input.dryTotalTimeSec +
      pRain * (pCorrect * input.wetAdaptedTotalTimeSec + (1 - pCorrect) * input.wetMisjudgedTotalTimeSec),
  );

  return {
    expectedTotalTimeSec,
    bestCaseTotalTimeSec: round3(Math.min(input.dryTotalTimeSec, input.wetAdaptedTotalTimeSec)),
    worstCaseTotalTimeSec: round3(Math.max(input.dryTotalTimeSec, input.wetMisjudgedTotalTimeSec)),
    assumptionFlags: dedupe(flags),
  };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
