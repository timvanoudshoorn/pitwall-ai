/**
 * degradation.ts
 * -----------------------------------------------------------------------
 * Core tyre degradation model: performance-over-time curve per compound,
 * parameterized so it can be tuned per car class / performance tier.
 *
 * Model: two-phase (linear + cliff) degradation, standard shorthand used
 * across motorsport strategy tooling when real telemetry-derived curves
 * aren't available:
 *   lapTimeDelta(lapsOnTyre) =
 *     paceOffsetVsHard                                    [compound offset]
 *     + warmupPenalty(lapsOnTyre)                         [cold tyre phase]
 *     + linearWearRate * min(lapsOnTyre-1, cliffLap-1)     [gradual wear]
 *     + cliffWearRate * max(0, lapsOnTyre - cliffLap)       [post-cliff wear]
 *     all scaled by carClass/performanceTier wear multipliers
 *
 * All results are DELTAS in seconds relative to a hypothetical fresh-hard
 * tyre on lap 1 at the same fuel load — combine with fuel.ts and a track's
 * base laptime to get an absolute laptime.
 *
 * See SIMLOG.md #1 for assumptions behind the placeholder constants this
 * pulls from constants.ts when no override is supplied.
 * -----------------------------------------------------------------------
 */

import type { TyreCompound } from '../ai/types';
import {
  TYRE_COMPOUNDS,
  PERFORMANCE_TIERS,
  CAR_CLASSES,
  type TyreCompoundParams,
  type PerformanceTierKey,
  type CarClassKey,
} from './constants';

export interface DegradationOptions {
  carClass?: CarClassKey;
  performanceTier?: PerformanceTierKey;
  compoundOverride?: Partial<TyreCompoundParams>;
  /**
   * Per-circuit tyre stress rating, 1 (gentle, e.g. Monaco/Monza) to 5
   * (punishing, e.g. Silverstone/Lusail) — from the data teammate's
   * data/track-tyre-characteristics.json. Converted to a wear multiplier
   * via `trackAbrasivenessMultiplier()` below. Omit to leave wear
   * track-agnostic (previous behavior). See SIMLOG.md #1 follow-up.
   */
  trackAbrasivenessRating?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Converts a 1-5 abrasiveness rating into a wear-rate multiplier, rating
 * 3 (moderate) as the neutral 1.0 baseline. PLACEHOLDER linear mapping —
 * not calibrated against real degradation data, just a reasonable
 * monotonic scale (each rating step = +/-10% wear rate). See SIMLOG.md #1.
 */
export function trackAbrasivenessMultiplier(rating: 1 | 2 | 3 | 4 | 5): number {
  return round3(1 + (rating - 3) * 0.1);
}

export interface LapTimeDeltaResult {
  lapTimeDeltaSec: number;
  phase: 'warmup' | 'linear' | 'cliff';
  compound: TyreCompound;
  lapsOnTyre: number;
  assumptionFlags: string[];
}

export function tyreLapTimeDelta(
  compound: TyreCompound,
  lapsOnTyre: number,
  options: DegradationOptions = {},
): LapTimeDeltaResult {
  const flags: string[] = [];
  const base = TYRE_COMPOUNDS[compound];
  if (!base) throw new Error(`Unknown tyre compound: ${compound}`);

  let params: TyreCompoundParams = base;
  if (options.compoundOverride) {
    params = { ...base, ...options.compoundOverride };
  } else {
    flags.push('tyre_compound_params_placeholder');
  }

  if (lapsOnTyre < 1) throw new Error('lapsOnTyre must be >= 1');

  let warmupPenalty = 0;
  let phase: LapTimeDeltaResult['phase'] = 'linear';
  if (lapsOnTyre <= params.warmupLaps) {
    const warmupFraction = 1 - (lapsOnTyre - 1) / params.warmupLaps;
    warmupPenalty = warmupFraction * 0.6; // ~0.6s cold-tyre penalty on lap 1, PLACEHOLDER (SIMLOG #1)
    phase = 'warmup';
    flags.push('tyre_warmup_penalty_placeholder');
  }

  let wear: number;
  if (lapsOnTyre <= params.cliffLap) {
    wear = params.linearWearRate * (lapsOnTyre - 1);
  } else {
    phase = 'cliff';
    const linearPortion = params.linearWearRate * (params.cliffLap - 1);
    const cliffPortion = params.cliffWearRate * (lapsOnTyre - params.cliffLap);
    wear = linearPortion + cliffPortion;
    flags.push('tyre_cliff_wear_placeholder');
  }

  let tierMultiplier = 1;
  let classMultiplier = 1;
  let trackMultiplier = 1;
  if (options.performanceTier) {
    const tier = PERFORMANCE_TIERS[options.performanceTier];
    if (!tier) throw new Error(`Unknown performance tier: ${options.performanceTier}`);
    tierMultiplier = tier.tyreWearMultiplier;
    flags.push('performance_tier_wear_multiplier_placeholder');
  }
  if (options.carClass) {
    const carClass = CAR_CLASSES[options.carClass];
    if (!carClass) throw new Error(`Unknown car class: ${options.carClass}`);
    classMultiplier = carClass.tyreWearMultiplier;
    flags.push('car_class_wear_multiplier_placeholder');
  }
  if (options.trackAbrasivenessRating) {
    trackMultiplier = trackAbrasivenessMultiplier(options.trackAbrasivenessRating);
    flags.push('track_abrasiveness_multiplier_placeholder');
  }

  const lapTimeDeltaSec =
    params.paceOffsetVsHard +
    warmupPenalty +
    wear * tierMultiplier * classMultiplier * trackMultiplier;

  return {
    lapTimeDeltaSec: round3(lapTimeDeltaSec),
    phase,
    compound,
    lapsOnTyre,
    assumptionFlags: dedupe(flags),
  };
}

export interface StintCurvePoint {
  lap: number;
  lapTimeDeltaSec: number;
  phase: LapTimeDeltaResult['phase'];
}

/** Full per-lap degradation curve for a stint — for charting and full-race sim. */
export function tyreStintCurve(
  compound: TyreCompound,
  stintLength: number,
  options: DegradationOptions = {},
): StintCurvePoint[] {
  const curve: StintCurvePoint[] = [];
  for (let lap = 1; lap <= stintLength; lap += 1) {
    const { lapTimeDeltaSec, phase } = tyreLapTimeDelta(compound, lap, options);
    curve.push({ lap, lapTimeDeltaSec, phase });
  }
  return curve;
}

export interface TyreLifeEstimate {
  nominalLifeLaps: number;
  cliffLapEstimate: number;
  assumptionFlags: string[];
}

/** Estimated safe tyre life (laps before cliff risk rises sharply), tier/class-adjusted. */
export function estimateTyreLife(
  compound: TyreCompound,
  options: DegradationOptions = {},
): TyreLifeEstimate {
  const flags: string[] = ['tyre_compound_params_placeholder'];
  const base = TYRE_COMPOUNDS[compound];
  if (!base) throw new Error(`Unknown tyre compound: ${compound}`);

  let combinedMultiplier = 1;
  if (options.performanceTier) {
    combinedMultiplier *= PERFORMANCE_TIERS[options.performanceTier].tyreWearMultiplier;
    flags.push('performance_tier_wear_multiplier_placeholder');
  }
  if (options.carClass) {
    combinedMultiplier *= CAR_CLASSES[options.carClass].tyreWearMultiplier;
    flags.push('car_class_wear_multiplier_placeholder');
  }
  if (options.trackAbrasivenessRating) {
    combinedMultiplier *= trackAbrasivenessMultiplier(options.trackAbrasivenessRating);
    flags.push('track_abrasiveness_multiplier_placeholder');
  }

  const nominalLifeLaps = Math.round(base.nominalLife / combinedMultiplier);
  const cliffLapEstimate = Math.round(base.cliffLap / combinedMultiplier);

  return { nominalLifeLaps, cliffLapEstimate, assumptionFlags: dedupe(flags) };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
